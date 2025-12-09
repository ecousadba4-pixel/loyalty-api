const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();

/* ================== CONFIG ================== */

const {
  PORT,
  RATE_LIMIT_WINDOW,
  RATE_LIMIT_MAX,
  AUTH_DISABLED,
  COOKIE_SECRET,
  STATIC_DIR,
  UNIQUE_ALLOWED_ORIGINS,
  IS_DEBUG_LOGGING_ENABLED,
  IS_DEVELOPMENT,
  PASSWORD_HASH,
  DATABASE_URL,
  isOriginAllowed
} = require('./config');

/* ================== MODULES ================== */

const db = require('./db/index');

const {
  requestDurationMiddleware,
  metricsHandler
} = require('./metrics');

const authRouter = require('./routes/auth');
const guestsRouter = require('./routes/guests');
const bonusesRouter = require('./routes/bonuses');

/* ================== CRITICAL CHECKS ================== */

if (!DATABASE_URL) {
  console.error('❌ Переменная DATABASE_URL не задана. Сервер остановлен.');
  process.exit(1);
}

if (!AUTH_DISABLED && !PASSWORD_HASH) {
  console.error(
    '❌ Не задан PASSWORD_HASH и AUTH не отключён. Укажи PASSWORD_HASH или AUTH_DISABLED=true.'
  );
  process.exit(1);
}

/* ================== MIDDLEWARE ================== */

app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));

/* ✅ PROMETHEUS MIDDLEWARE */
app.use(requestDurationMiddleware);

/* ================== RATE LIMIT ================== */

const apiRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(apiRateLimiter);

/* ================== CORS ================== */

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) callback(null, true);
      else callback(new Error('Origin not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

/* ================== DEBUG LOG ================== */

if (IS_DEBUG_LOGGING_ENABLED) {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

/* ================== STATIC ================== */

if (STATIC_DIR) {
  app.use('/app', express.static(STATIC_DIR));
}

/* ================== ROUTES ================== */

app.use('/auth', authRouter);
app.use('/guests', guestsRouter);
app.use('/bonuses', bonusesRouter);

/* ✅ CONFIG ENDPOINT */
app.get('/config', (req, res) => {
  res.json({ authDisabled: AUTH_DISABLED });
});

/* ✅ METRICS */
app.get('/metrics', metricsHandler);

/* ================== HEALTH ================== */

app.get('/health', async (req, res) => {
  try {
    await db.healthCheck();
    res.json({
      status: '✅ OK',
      database: 'Connected',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: '❌ ERROR',
      error: error.message
    });
  }
});

/* ================== 404 ================== */

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

/* ================== GLOBAL ERROR ================== */

app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);

  res.status(500).json({
    message: IS_DEVELOPMENT && error instanceof Error
      ? error.message
      : 'Internal Server Error'
  });
});

/* ================== START SERVER ================== */

const server = app.listen(PORT, () => {
  console.log(`✅ Loyalty API запущен на порту ${PORT}`);
  console.log(`📍 Allowed origins: ${UNIQUE_ALLOWED_ORIGINS.join(', ')}`);
});

/* ================== GRACEFUL SHUTDOWN ================== */

let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`⚠️ Сигнал ${signal}. Остановка сервера...`);

  server.close(async () => {
    console.log('✅ HTTP сервер остановлен');

    try {
      await db.disconnect();
      console.log('✅ База данных отключена');
    } catch (e) {
      console.error('❌ Ошибка отключения БД:', e);
    }

    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);


