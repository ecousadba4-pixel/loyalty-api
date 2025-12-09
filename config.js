const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_DEVELOPMENT = NODE_ENV === 'development';
const DATABASE_URL = process.env.DATABASE_URL;
const DEFAULT_BACKEND_HOST = 'loyalty-api.usadba4.ru';
const AUTH_DISABLED = String(process.env.AUTH_DISABLED || '').toLowerCase() === 'true';

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const createWildcardRegex = (pattern) =>
  new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`, 'i');

const normalizeOriginsList = (raw) =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const DEFAULT_ALLOWED_ORIGINS = [
  'https://usadba4.ru',
  'https://www.usadba4.ru',
  `https://${DEFAULT_BACKEND_HOST}`,
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1',
  'http://127.0.0.1:3000'
];

const configuredOrigins = process.env.ALLOWED_ORIGINS
  ? normalizeOriginsList(process.env.ALLOWED_ORIGINS)
  : [];

const UNIQUE_ALLOWED_ORIGINS = Array.from(
  new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins])
);

const EXACT_ALLOWED_ORIGINS = new Set(
  UNIQUE_ALLOWED_ORIGINS.filter((origin) => !origin.includes('*'))
);

const WILDCARD_ORIGINS = UNIQUE_ALLOWED_ORIGINS.filter((origin) =>
  origin.includes('*')
).map(createWildcardRegex);

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  if (EXACT_ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  return WILDCARD_ORIGINS.some((regex) => regex.test(origin));
};

const COOKIE_SECRET = process.env.COOKIE_SECRET || 'default_cookie_secret';
const RATE_LIMIT_WINDOW = Number(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_DEBUG_LOGGING_ENABLED = LOG_LEVEL === 'debug';
const STATIC_DIR = path.join(__dirname, 'public');

const normalizeHash = (hashValue) => {
  if (typeof hashValue !== 'string') {
    return undefined;
  }

  let normalized = hashValue.trim().toLowerCase().replace(/\s+/g, '');

  normalized = normalized.replace(/^(sha-?256[:=]?)/, '');
  normalized = normalized.replace(/^0x/, '');

  if (!/^[a-f0-9]{64}$/i.test(normalized)) {
    return undefined;
  }

  return normalized;
};

const PASSWORD_HASH = normalizeHash(process.env.PASSWORD_HASH);
const PASSWORD_HASH_BUFFER = PASSWORD_HASH ? Buffer.from(PASSWORD_HASH, 'hex') : null;

const PG_POOL_MAX = Number(process.env.PG_POOL_MAX) || 10;
const PG_IDLE_TIMEOUT = Number(process.env.PG_IDLE_TIMEOUT) || 30_000;
const PG_CONNECTION_TIMEOUT = Number(process.env.PG_CONNECTION_TIMEOUT) || 5_000;
const PG_STATEMENT_TIMEOUT = Number(process.env.PG_STATEMENT_TIMEOUT) || 10_000;
const PG_SSL_REJECT_UNAUTHORIZED = String(process.env.PG_SSL_REJECT_UNAUTHORIZED || '')
  .toLowerCase() !== 'false';

module.exports = {
  PORT,
  NODE_ENV,
  IS_DEVELOPMENT,
  DATABASE_URL,
  DEFAULT_BACKEND_HOST,
  AUTH_DISABLED,
  isOriginAllowed,
  COOKIE_SECRET,
  RATE_LIMIT_WINDOW,
  RATE_LIMIT_MAX,
  LOG_LEVEL,
  IS_DEBUG_LOGGING_ENABLED,
  STATIC_DIR,
  UNIQUE_ALLOWED_ORIGINS,
  normalizeHash,
  PASSWORD_HASH,
  PASSWORD_HASH_BUFFER,
  PG_POOL_MAX,
  PG_IDLE_TIMEOUT,
  PG_CONNECTION_TIMEOUT,
  PG_STATEMENT_TIMEOUT,
  PG_SSL_REJECT_UNAUTHORIZED
};
