const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const util = require('util');

const app = express();

// Centralized config and modules
const config = require('./config');
const db = require('./db');
const metrics = require('./metrics');
const authRouter = require('./routes/auth');
const guestsRouter = require('./routes/guests');
const bonusesRouter = require('./routes/bonuses');

// validate important config early
const { PASSWORD_HASH_BUFFER, PASSWORD_HASH, DATABASE_URL } = config;

if (PASSWORD_HASH_BUFFER && PASSWORD_HASH_BUFFER.length !== 32) {
  console.error('❌ PASSWORD_HASH должен быть валидным SHA-256 (64 hex-символа).');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('❌ Переменная окружения DATABASE_URL не задана. Сервер остановлен.');
  process.exit(1);
}

if (!config.AUTH_DISABLED && !PASSWORD_HASH) {
  console.error(
    '❌ Не задан PASSWORD_HASH и отключение авторизации не разрешено. Установите PASSWORD_HASH или AUTH_DISABLED=true.'
  );
  process.exit(1);
}

// Trust proxy для Amvera/cloud
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Prometheus metrics middleware
app.use(metrics.requestDurationMiddleware);

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(cookieParser(config.COOKIE_SECRET));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Статические ассеты для внутреннего фронтенда
app.use('/app', express.static(config.STATIC_DIR));
app.get('/app', (req, res) => {
  res.sendFile(path.join(config.STATIC_DIR, 'index.html'));
});

// Rate limiting: применяем только к /api/*
const apiRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Слишком много запросов, попробуйте позже.'
  }
});
app.use('/api', apiRateLimiter);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (config.isOriginAllowed(origin)) {
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

// Подключение к БД
const PG_POOL_MAX = Number(process.env.PG_POOL_MAX) || 10;
const PG_IDLE_TIMEOUT = Number(process.env.PG_IDLE_TIMEOUT) || 30_000;
const PG_CONNECTION_TIMEOUT = Number(process.env.PG_CONNECTION_TIMEOUT) || 5_000;
const PG_STATEMENT_TIMEOUT = Number(process.env.PG_STATEMENT_TIMEOUT) || 10_000;
const PG_SSL_REJECT_UNAUTHORIZED = String(process.env.PG_SSL_REJECT_UNAUTHORIZED || '')
  .toLowerCase() !== 'false';

// DB pool is handled in ./db
const { pool } = db;

// Вспомогательная функция SHA-256
// helpers moved to ./utils

// === ЭНДПОИНТЫ ===

// Health-check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: '✅ OK',
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: '❌ Error',
      database: 'Disconnected',
      error: NODE_ENV === 'development' ? error.message : 'DB connection error'
    });
  }
});

// Эндпоинт метрик для Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.client.register.contentType);
    const m = await metrics.client.register.metrics();
    res.send(m);
  } catch (error) {
    console.error('Ошибка при формировании метрик:', error);
    res.status(500).end('Metrics collection error');
  }
});

app.get('/api/config', (req, res) => {
  res.json({ authDisabled: config.AUTH_DISABLED });
});

// Главная страница
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Hotel Guests API работает!',
    status: 'OK',
    database: 'Neon PostgreSQL',
    build: process.env.BUILD_VERSION || 'dev'
  });
});

// 🔐 Аутентификация (новый эндпоинт)
// auth router
app.use('/api/auth', authRouter);

// guests routes
app.use('/api/guests', guestsRouter);

// bonuses routes
app.use('/api/bonuses', bonusesRouter);

// 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '🚫 Маршрут не найден'
  });
});

// Обработчик ошибок
app.use((error, req, res, next) => {
  if (config.IS_DEBUG_LOGGING_ENABLED) console.error('Необработанная ошибка:', error);
  res.status(500).json({ success: false, message: config.IS_DEVELOPMENT && error instanceof Error ? error.message : 'Внутренняя ошибка сервера' });
});

// Запуск
const server = app.listen(config.PORT, () => {
  console.log(`🚀 Сервер запущен на Amvera, порт ${config.PORT}`);
  console.log(`📍 Health check: /health`);
  console.log(`📍 Allowed origins: ${config.UNIQUE_ALLOWED_ORIGINS.join(', ')}`);
});

const closeServer = util.promisify(server.close.bind(server));

const setupGracefulShutdown = () => {
  let isShuttingDown = false;

  const shutdown = async (signal, error) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    if (error) {
      console.error(`Получена ошибка ${signal}, завершаем работу:`, error);
    } else {
      console.log(`Получен сигнал ${signal}, начинаем корректное завершение.`);
    }

    try {
      await closeServer();
      console.log('HTTP-сервер остановлен.');
    } catch (closeError) {
      console.error('Ошибка при остановке HTTP-сервера:', closeError);
    }

    try {
      await db.pool.end();
      console.log('Пул подключений к БД закрыт.');
    } catch (poolError) {
      console.error('Ошибка при закрытии пула БД:', poolError);
    } finally {
      process.exit(error ? 1 : 0);
    }
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

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

