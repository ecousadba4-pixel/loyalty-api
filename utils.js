const crypto = require('crypto');
const config = require('./config');

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

const respondWithError = (res, statusCode, message) =>
  res.status(statusCode).json({ success: false, message });

const respondWithValidationError = (res, message) => respondWithError(res, 400, message);

const buildPublicErrorMessage = (error, fallbackMessage) =>
  config.IS_DEVELOPMENT && error instanceof Error ? error.message : fallbackMessage;

const handleUnexpectedError = (res, error, fallbackMessage) => {
  if (config.IS_DEBUG_LOGGING_ENABLED) {
    console.error(fallbackMessage, error);
  }

  return res.status(500).json({
    success: false,
    message: buildPublicErrorMessage(error, fallbackMessage)
  });
};

const normalizeLoyaltyLevel = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const LOYALTY_LEVELS = [
  { normalized: '1 сезон', display: '1 СЕЗОН' },
  { normalized: '2 сезона', display: '2 СЕЗОНА' },
  { normalized: '3 сезона', display: '3 СЕЗОНА' },
  { normalized: '4 сезона', display: '4 СЕЗОНА' }
];

const getNextLoyaltyLevel = (currentLevel) => {
  const normalized = normalizeLoyaltyLevel(currentLevel);

  if (!normalized) {
    return LOYALTY_LEVELS[0].display;
  }

  const currentIndex = LOYALTY_LEVELS.findIndex((level) => level.normalized === normalized);

  if (currentIndex === -1) {
    return LOYALTY_LEVELS[0].display;
  }

  const nextIndex = Math.min(currentIndex + 1, LOYALTY_LEVELS.length - 1);

  return LOYALTY_LEVELS[nextIndex].display;
};

const safeTimingCompare = (candidateHash, expectedBuffer) => {
  if (!candidateHash || !expectedBuffer) {
    return false;
  }

  try {
    const candidateBuffer = Buffer.from(candidateHash, 'hex');

    if (candidateBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
  } catch (error) {
    if (config.IS_DEBUG_LOGGING_ENABLED) {
      console.error('Ошибка при сравнении хеша пароля:', error);
    }

    return false;
  }
};

function normalizeCheckinDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  const raw = String(dateValue).trim();

  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('.');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (/^\d{4}\.\d{2}\.\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('.');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

module.exports = {
  sha256,
  respondWithError,
  respondWithValidationError,
  handleUnexpectedError,
  normalizeCheckinDate,
  getNextLoyaltyLevel,
  safeTimingCompare
};
