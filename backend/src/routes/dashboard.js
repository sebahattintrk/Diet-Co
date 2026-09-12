// backend/src/routes/dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard?userId=...
router.get('/', async (req, res) => {
  const targetUserId = Number(req.query.userId || req.user?.id);

  if (!targetUserId || isNaN(targetUserId)) {
    return res.status(400).json({ error: 'userId belirtilmedi.' });
  }

  try {
    // 1. users tablosundaki net sütunları güvenli şekilde çek
    const userRes = await db.query(
      `SELECT * FROM users WHERE id = $1`,
      [targetUserId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const user = userRes.rows[0];

    // 2. daily_logs tablosundan bugünün loglarını çek
    let userLog = {
      water_consumed: 0,
      calories_consumed: 0,
      protein_consumed: 0,
    };

    try {
      const logRes = await db.query(
        `SELECT COALESCE(water_ml, 0) AS water_consumed,
                COALESCE(calories_eaten, 0) AS calories_consumed,
                COALESCE(protein_eaten, 0) AS protein_consumed
         FROM daily_logs
         WHERE user_id = $1 
           AND (log_date = CURRENT_DATE OR log_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date)
         LIMIT 1`,
        [targetUserId]
      );

      if (logRes.rows.length > 0) {
        userLog = logRes.rows[0];
      }
    } catch (logErr) {
      console.warn('daily_logs sorgu uyarısı (sıfır kabul ediliyor):', logErr.message);
    }

    return res.json({
      user, // users tablosundan gelen canlı 55.00 kg verisi
      waterConsumed: Number(userLog.water_consumed || 0),
      caloriesConsumed: Number(userLog.calories_consumed || 0),
      proteinConsumed: Number(userLog.protein_consumed || 0),
      caloriesTarget: Number(user.calorie_target || 2200),
      proteinTarget: Number(user.protein_target || 120),
      carbsTarget: Number(user.carbs_target || 250),
      fatTarget: Number(user.fats_target || 70),
    });
  } catch (err) {
    console.error('Dashboard getirme kritik hatası:', err);
    return res.status(500).json({ error: 'Dashboard verisi alınamadı: ' + err.message });
  }
});

// POST /api/dashboard/water/add veya /api/water/add
router.post('/water/add', async (req, res) => {
  try {
    const { userId, amount = 250 } = req.body;
    const targetUserId = Number(userId);

    if (!targetUserId) {
      return res.status(400).json({ error: 'userId zorunludur' });
    }

    const result = await db.query(
      `INSERT INTO daily_logs (user_id, log_date, water_ml)
       VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (user_id, log_date)
       DO UPDATE SET water_ml = COALESCE(daily_logs.water_ml, 0) + EXCLUDED.water_ml
       RETURNING water_ml;`,
      [targetUserId, parseInt(amount, 10)]
    );

    const updatedWater = Number(result.rows[0]?.water_ml || 0);

    return res.json({
      success: true,
      water_ml: updatedWater,
      waterConsumed: updatedWater,
    });
  } catch (err) {
    console.error('Su ekleme hatası:', err);
    return res.status(500).json({ error: 'Su kaydedilemedi: ' + err.message });
  }
});

module.exports = router;