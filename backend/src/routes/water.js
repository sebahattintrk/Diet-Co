// backend/src/routes/water.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Türkiye saatine göre gün devreden SQL tarih tanımı
const ACTIVE_DATE_SQL = `((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul') - INTERVAL '3 hours')::date`;

router.post('/add', async (req, res) => {
  const { userId, amount } = req.body;
  const targetUserId = Number(userId);
  const waterAmount = parseInt(amount, 10) || 250;

  if (!targetUserId) {
    return res.status(400).json({ error: 'Geçersiz kullanıcı ID.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO daily_logs (user_id, log_date, water_ml)
       VALUES ($1, ${ACTIVE_DATE_SQL}, $2)
       ON CONFLICT (user_id, log_date)
       DO UPDATE SET water_ml = COALESCE(daily_logs.water_ml, 0) + EXCLUDED.water_ml
       RETURNING water_ml;`,
      [targetUserId, waterAmount]
    );

    return res.status(200).json({
      success: true,
      waterConsumed: result.rows[0].water_ml,
    });
  } catch (error) {
    console.error('Su ekleme hatası:', error);
    return res.status(500).json({ error: 'Su verisi kaydedilemedi.' });
  }
});

module.exports = router;