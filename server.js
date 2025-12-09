const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const util = require('util');

const app = express();

// ✅ Централизованный импорт конфига (ИСПРАВЛЕНО)
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
  PASSWORD_HASH_BUFFER,
  PASSWORD_HASH,
  DATABASE_URL,
  isOriginAllowed
} = require('./config');

const db = require('./db');
const metrics = require('./metrics');
const authRouter = require('./routes/auth');
const guestsRouter = require('./routes/guests');

// ✅ КРИТИЧЕСКИЕ ПРОВЕРКИ
if (!DATABASE_URL) {
  console.error('❌ Переменная окружения DATABASE_URL не задана. Сервер остановлен.');
  process.exit(1);
}

if (!AUTH_DISABLED && !PASSWORD_HASH) {
  console.error(
    '❌ Не задан PASSWORD_HASH и отключение авторизации не разрешено. Установите PASSWORD_HASH или AUTH_DISABLED=true.'
  );
  process.exit(1);
}

// ✅ Trust proxy (обязательно для VPS + nginx)
app.set('trust proxy', 1);

// ✅ Базовые middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));

// ✅ Rate Limit (ИСПРАВЛЕНО)
const apiRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(apiRateLimiter);

// ✅ CORS (через config.js)
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by CORS policy'), false);
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

// ✅ Логирование входящих запросов (если нужно)
if (IS_DEBUG_LOGGING_ENABLED) {
  app.use((req, res, next) => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );
    next();
  });
}

// ✅ Статика
if (STATIC_DIR) {
  app.use('/app', express.static(STATIC_DIR));
}

// ✅ Роуты API
app.use('/auth', authRouter);
app.use('/guests', guestsRouter);

// ✅ Метрики Prometheus
app.get('/metrics', metrics.metricsMiddleware);

// ✅ Healthcheck
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

// ✅ 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ✅ Глобальный error-handler
app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);

  res.status(500).json({
    message: IS_DEVELOPMENT && error instanceof Error
      ? error.message
      : 'Internal Server Error'
  });
});

// ✅ Запуск сервера
const server = app.listen(PORT, () => {
  console.log(`✅ Loyalty API запущен на порту ${PORT}`);
  console.log(`📍 Allowed origins: ${UNIQUE_ALLOWED_ORIGINS.join(', ')}`);
});

// ✅ Graceful shutdown
const setupGracefulShutdown = () => {
  const shutdown = async (signal, error) => {
    console.log(`⚠️ Получен сигнал ${signal}. Завершение работы...`);

    if (error) console.error(error);

    server.close(async () => {
      console.log('✅ HTTP сервер остановлен');

      try {
        await db.disconnect();
        console.log('✅ База данных отключена');
      } catch (e) {
        console.error('❌ Ошибка при отключении БД:', e);
      }

      process.exit(0);
    });

    setTimeout(() => {
      console.error('❌ Принудительное завершение процесса');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  process.on('unhandledRejection', (reason) => {
    const rejectionError =
      reason instanceof Error ? reason : new Error(String(reason));
    shutdown('unhandledRejection', rejectionError);
  });

  process.on('uncaughtException', (uncaughtError) => {
    shutdown('uncaughtException', uncaughtError);
  });
};

setupGracefulShutdown();

