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
    // 1. Kullanıcı bilgilerini ve hedeflerini çek
    const userRes = await db.query(
      `SELECT * FROM users WHERE id = $1`,
      [targetUserId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const user = userRes.rows[0];

    // 2. Bugün içilen su miktarını çek (daily_logs tablosundan)
    let waterConsumed = 0;
    try {
      const waterRes = await db.query(
        `SELECT COALESCE(water_ml, 0) AS water_ml
         FROM daily_logs
         WHERE user_id = $1 
           AND (log_date = CURRENT_DATE OR log_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date)
         LIMIT 1`,
        [targetUserId]
      );
      if (waterRes.rows.length > 0) {
        waterConsumed = Number(waterRes.rows[0].water_ml || 0);
      }
    } catch (e) {
      console.warn('Su sorgusu uyarısı:', e.message);
    }

    // 3. Bugün yenen yemeklerin toplam kalorilerini ve makrolarını çek (logged_meals tablosundan)
    let caloriesConsumed = 0;
    let proteinConsumed = 0;
    let carbsConsumed = 0;
    let fatConsumed = 0;

    try {
      const mealsSumRes = await db.query(
        `SELECT 
            COALESCE(SUM(calories), 0) AS total_cal,
            COALESCE(SUM(protein_g), 0) AS total_protein,
            COALESCE(SUM(carbs_g), 0) AS total_carbs,
            COALESCE(SUM(fats_g), 0) AS total_fats
         FROM logged_meals
         WHERE user_id = $1
           AND (
             log_date = CURRENT_DATE 
             OR log_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date
             OR (created_at AT TIME ZONE 'Europe/Istanbul')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date
           )`,
        [targetUserId]
      );

      if (mealsSumRes.rows.length > 0) {
        const row = mealsSumRes.rows[0];
        caloriesConsumed = Math.round(Number(row.total_cal || 0));
        proteinConsumed = Math.round(Number(row.total_protein || 0));
        carbsConsumed = Math.round(Number(row.total_carbs || 0));
        fatConsumed = Math.round(Number(row.total_fats || 0));
      }
    } catch (mealErr) {
      console.warn('logged_meals sorgu hatası, daily_logs fallback deneniyor:', mealErr.message);
    }

    return res.json({
      user,
      waterConsumed,
      caloriesConsumed,
      proteinConsumed,
      carbsConsumed,
      fatConsumed,
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