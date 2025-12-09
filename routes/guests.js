const express = require('express');
const router = express.Router();
const db = require('../db');
const { respondWithValidationError, handleUnexpectedError, normalizeCheckinDate } = require('../utils');

router.post('/', async (req, res) => {
  try {
    const {
      guest_phone,
      last_name,
      first_name,
      checkin_date,
      loyalty_level,
      shelter_booking_id,
      total_amount,
      bonus_spent
    } = req.body;

    if (!guest_phone || !last_name || !first_name || !shelter_booking_id || !total_amount) {
      return respondWithValidationError(
        res,
        'Заполните обязательные поля: телефон, фамилия, имя, номер бронирования и сумму.'
      );
    }

    const normalizedPhoneDigits = String(guest_phone).replace(/\D/g, '');
    if (normalizedPhoneDigits.length < 10) {
      return respondWithValidationError(res, 'Укажите корректный номер телефона гостя.');
    }
    const phoneToStore = normalizedPhoneDigits.slice(-10);

    const lastNameSanitized = String(last_name).trim();
    const firstNameSanitized = String(first_name).trim();
    const bookingSanitized = String(shelter_booking_id).trim();
    const loyaltySanitized = String(loyalty_level || '').trim();
    const normalizedDate = normalizeCheckinDate(checkin_date);

    if (!lastNameSanitized || !firstNameSanitized) {
      return respondWithValidationError(res, 'Фамилия и имя не могут быть пустыми.');
    }

    if (lastNameSanitized.length > 120 || firstNameSanitized.length > 120) {
      return respondWithValidationError(res, 'Фамилия и имя не должны превышать 120 символов.');
    }

    if (!bookingSanitized) {
      return respondWithValidationError(res, 'Укажите номер бронирования Shelter.');
    }

    if (bookingSanitized.length > 80) {
      return respondWithValidationError(res, 'Номер бронирования слишком длинный.');
    }

    if (!normalizedDate) {
      return respondWithValidationError(res, 'Некорректный формат даты заезда.');
    }

    if (Number.isNaN(Date.parse(normalizedDate))) {
      return respondWithValidationError(res, 'Дата заезда не распознана.');
    }

    const amount = Number.parseFloat(total_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return respondWithValidationError(
        res,
        'Сумма при выезде должна быть положительным числом не более 1 000 000.'
      );
    }

    const bonusValueRaw = Number.parseInt(bonus_spent, 10);
    const bonusValue = Number.isFinite(bonusValueRaw) && bonusValueRaw > 0 ? bonusValueRaw : 0;
    if (bonusValue > 1_000_000) {
      return respondWithValidationError(res, 'Списанные баллы не могут превышать 1 000 000.');
    }

    const query = `
      INSERT INTO guests
      (guest_phone, last_name, first_name, checkin_date, loyalty_level,
       shelter_booking_id, total_amount, bonus_spent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      phoneToStore,
      lastNameSanitized,
      firstNameSanitized,
      normalizedDate,
      loyaltySanitized || null,
      bookingSanitized,
      amount,
      bonusValue
    ];

    const result = await db.query(query, values);

    res.json({ success: true, message: '✅ Данные гостя успешно добавлены!', data: result.rows[0] });
  } catch (error) {
    return handleUnexpectedError(res, error, '❌ Ошибка при добавлении гостя');
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM guests ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    return handleUnexpectedError(res, error, 'Ошибка при получении списка гостей');
  }
});

module.exports = router;
