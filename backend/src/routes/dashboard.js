// backend/src/routes/dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Gece 03:00 sıfırlama kuralı
const ACTIVE_DATE_SQL = `((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul') - INTERVAL '3 hours')::date`;

// GET /api/dashboard?userId=...
router.get('/', async (req, res) => {
  const targetUserId = Number(req.query.userId || req.user?.id);

  if (!targetUserId || isNaN(targetUserId)) {
    return res.status(400).json({ error: 'userId belirtilmedi veya geçersiz.' });
  }

  try {
    // 1. Kullanıcı bilgileri
    const userRes = await db.query(
      `SELECT id, name, email, calorie_target, protein_target, carbs_target, fats_target, goal, 
              COALESCE(weight_kg, 70.0)::numeric(5,1) AS weight_kg,
              COALESCE(height_cm, 175.0)::numeric(5,1) AS height_cm,
              birth_date,
              COALESCE(
                EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date))::INT,
                age,
                25
              ) AS age,
              gender, occupation, is_premium,
              waist_cm, arm_cm, shoulder_cm, right_leg_cm, left_leg_cm, workout_days_per_week
       FROM users WHERE id = $1`,
      [targetUserId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const user = userRes.rows[0];

    // 2. Bugünün makroları (Gece 03:00'e kadar aynı gün sayılır)
    let caloriesConsumed = 0;
    let proteinConsumed = 0;
    let carbsConsumed = 0;
    let fatConsumed = 0;

    try {
      const mealsSumRes = await db.query(
        `SELECT 
            COALESCE(SUM(calories), 0)::int AS total_calories,
            COALESCE(SUM(protein_g), 0)::numeric(6,1) AS total_protein,
            COALESCE(SUM(carbs_g), 0)::numeric(6,1) AS total_carbs,
            COALESCE(SUM(fats_g), 0)::numeric(6,1) AS total_fats
         FROM food_logs
         WHERE user_id = $1 AND log_date = ${ACTIVE_DATE_SQL}`,
        [targetUserId]
      );

      if (mealsSumRes.rows.length > 0) {
        const row = mealsSumRes.rows[0];
        caloriesConsumed = Math.round(Number(row.total_calories || 0));
        proteinConsumed = Math.round(Number(row.total_protein || 0));
        carbsConsumed = Math.round(Number(row.total_carbs || 0));
        fatConsumed = Math.round(Number(row.total_fats || 0));
      }
    } catch (mealErr) {
      console.error('food_logs sorgu hatası:', mealErr.message);
    }

    // 3. Bugünün suyu (Gece 03:00'e kadar korunur)
    let waterConsumed = 0;
    try {
      const waterRes = await db.query(
        `SELECT COALESCE(water_ml, 0) AS water_ml
         FROM daily_logs
         WHERE user_id = $1 AND log_date = ${ACTIVE_DATE_SQL}
         LIMIT 1`,
        [targetUserId]
      );
      if (waterRes.rows.length > 0) {
        waterConsumed = Number(waterRes.rows[0].water_ml || 0);
      }
    } catch (e) {
      console.warn('Su sorgusu uyarısı:', e.message);
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

// POST /api/dashboard/water/add
router.post('/water/add', async (req, res) => {
  try {
    const { userId, amount = 250 } = req.body;
    const targetUserId = Number(userId);

    if (!targetUserId) {
      return res.status(400).json({ error: 'userId zorunludur' });
    }

    const result = await db.query(
      `INSERT INTO daily_logs (user_id, log_date, water_ml)
       VALUES ($1, ${ACTIVE_DATE_SQL}, $2)
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