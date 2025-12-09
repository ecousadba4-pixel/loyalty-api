const express = require('express');
const router = express.Router();
const db = require('../db');
const { respondWithValidationError, handleUnexpectedError, getNextLoyaltyLevel } = require('../utils');

router.get('/search', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return respondWithValidationError(res, 'Не указан номер телефона для поиска');
    }
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10) {
      return respondWithValidationError(res, 'Неверный формат номера телефона');
    }

    const normalizedPhone = digits.slice(-10);

    const result = await db.query(
      `SELECT
        phone as guest_phone,
        last_name,
        first_name,
        loyalty_level,
        bonus_balances as current_balance,
        visits_total as visits_count,
        last_date_visit as last_visit_date
      FROM bonuses_balance
      WHERE phone = $1
      ORDER BY last_date_visit DESC
      LIMIT 1`,
      [normalizedPhone]
    );

    const guestRecord = result.rows.length ? result.rows[0] : null;

    const responseData = guestRecord
      ? { ...guestRecord, loyalty_level: getNextLoyaltyLevel(guestRecord.loyalty_level) }
      : null;

    res.json({ success: true, data: responseData });
  } catch (error) {
    return handleUnexpectedError(res, error, 'Ошибка при поиске гостя');
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM bonuses_balance ORDER BY last_date_visit DESC LIMIT 100');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    return handleUnexpectedError(res, error, 'Ошибка при получении данных бонусов');
  }
});

module.exports = router;
