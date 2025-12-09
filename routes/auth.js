const express = require('express');
const router = express.Router();
const config = require('../config');
const { sha256, safeTimingCompare, respondWithValidationError } = require('../utils');

router.post('/', (req, res) => {
  const { password } = req.body;

  if (config.AUTH_DISABLED) {
    return res.status(200).json({ success: true, message: 'Авторизация отключена администратором' });
  }

  if (!password || typeof password !== 'string') {
    return respondWithValidationError(res, 'Пароль обязателен');
  }

  const rawPassword = String(password);
  const trimmedPassword = rawPassword.trim();

  if (!trimmedPassword) {
    return respondWithValidationError(res, 'Пароль обязателен');
  }

  const candidatePasswords = Array.from(
    new Set([rawPassword, trimmedPassword].filter((pw) => typeof pw === 'string' && pw.length > 0))
  );
  const candidateHashes = candidatePasswords.map((pw) => sha256(pw));

  if (!config.PASSWORD_HASH) {
    console.error('❌ Не задан PASSWORD_HASH для проверки пароля');
    return res.status(500).json({ success: false, message: 'Ошибка конфигурации сервера' });
  }

  const hashMatches = candidateHashes
    .map((hash) => config.normalizeHash(hash))
    .some((hash) => safeTimingCompare(hash, config.PASSWORD_HASH_BUFFER));

  if (hashMatches) {
    return res.status(200).json({ success: true, message: 'Доступ разрешён' });
  } else {
    return res.status(401).json({ success: false, message: 'Неверный пароль' });
  }
});

module.exports = router;
