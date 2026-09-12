const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/complete', async (req, res) => {
  try {
    const {
      userId,
      gender,
      height,
      weight,
      target_weight,
      goal,
      birth_date,
      // Vücut Ölçüleri
      waist_cm,
      arm_cm,
      shoulder_cm,
      right_leg_cm,
      left_leg_cm,
      chest_cm,
      hip_cm,
      // Günlük Aktivite
      workout_days_per_week,
      workout_hours_per_day,
      occupation,
      work_activity_level
    } = req.body;

    const query = `
      UPDATE users
      SET 
        gender = COALESCE($1, gender),
        height = COALESCE($2, height),
        weight = COALESCE($3, weight),
        target_weight = COALESCE($4, target_weight),
        goal = COALESCE($5, goal),
        birth_date = COALESCE($6, birth_date),
        waist_cm = $7,
        arm_cm = $8,
        shoulder_cm = $9,
        right_leg_cm = $10,
        left_leg_cm = $11,
        chest_cm = $12,
        hip_cm = $13,
        workout_days_per_week = $14,
        workout_hours_per_day = $15,
        occupation = $16,
        work_activity_level = $17,
        is_onboarded = true,
        updated_at = NOW()
      WHERE id = $18
      RETURNING *;
    `;

    const values = [
      gender, height, weight, target_weight, goal, birth_date || null,
      waist_cm || null, arm_cm || null, shoulder_cm || null,
      right_leg_cm || null, left_leg_cm || null,
      chest_cm || null, hip_cm || null,
      workout_days_per_week || null, workout_hours_per_day || null,
      occupation || null, work_activity_level || null,
      userId
    ];

    const result = await db.query(query, values);

    // İlk kilo kaydını daily_logs tablosuna da ekle
    if (weight) {
      await db.query(`
        INSERT INTO daily_logs (user_id, log_date, weight)
        VALUES ($1, CURRENT_DATE, $2)
        ON CONFLICT (user_id, log_date) 
        DO UPDATE SET weight = EXCLUDED.weight, updated_at = NOW();
      `, [userId, weight]);
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Onboarding hata:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;