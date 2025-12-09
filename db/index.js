const { Pool } = require('pg');
const config = require('../config');

if (!config.DATABASE_URL) {
  console.error('❌ Переменная окружения DATABASE_URL не задана. DB модуль не может инициализироваться.');
  // don't exit here; let server decide. Export a null pool to allow graceful handling
}

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.PG_POOL_MAX,
  idleTimeoutMillis: config.PG_IDLE_TIMEOUT,
  connectionTimeoutMillis: config.PG_CONNECTION_TIMEOUT,
  statement_timeout: config.PG_STATEMENT_TIMEOUT,
  query_timeout: config.PG_STATEMENT_TIMEOUT,
  ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: config.PG_SSL_REJECT_UNAUTHORIZED } : false
});

pool.on('error', (error) => {
  console.error('❌ Необработанная ошибка пула БД:', error);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params)
};
