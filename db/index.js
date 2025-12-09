const { Pool } = require('pg');
const config = require('./config'); // ✅ ВАЖНО: исправленный путь

if (!config.DATABASE_URL) {
  console.error('❌ Переменная DATABASE_URL не задана. DB модуль не может инициализироваться.');
}

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.PG_POOL_MAX,
  idleTimeoutMillis: config.PG_IDLE_TIMEOUT,
  connectionTimeoutMillis: config.PG_CONNECTION_TIMEOUT,
  statement_timeout: config.PG_STATEMENT_TIMEOUT,
  query_timeout: config.PG_STATEMENT_TIMEOUT,
  ssl:
    config.NODE_ENV === 'production'
      ? { rejectUnauthorized: config.PG_SSL_REJECT_UNAUTHORIZED }
      : false
});

pool.on('error', (error) => {
  console.error('❌ Необработанная ошибка пула БД:', error);
});

const query = (text, params) => pool.query(text, params);

/* ✅ НОРМАЛЬНЫЙ healthCheck ДЛЯ /health */
const healthCheck = async () => {
  await pool.query('SELECT 1');
};

/* ✅ КОРРЕКТНЫЙ disconnect ДЛЯ SIGTERM */
const disconnect = async () => {
  await pool.end();
};

module.exports = {
  pool,
  query,
  healthCheck,
  disconnect
};
