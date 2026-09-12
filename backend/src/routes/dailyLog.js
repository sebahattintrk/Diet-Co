// backend/src/routes/dailyLog.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/daily-log/weight
router.post('/weight', async (req, res) => {
  try {
    const { userId, weight } = req.body;
    const newWeight = parseFloat(weight);

    if (!userId || !newWeight || isNaN(newWeight)) {
      return res.status(400).json({ error: 'userId ve geçerli bir kilo değeri zorunludur.' });
    }

    // 1. Kullanıcının mevcut diğer verilerini çek (Kaloriyi yeni kiloya göre dinamik hesaplamak için)
    const userRes = await db.query(`
      SELECT 
        *,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date))::INT AS calculated_age
      FROM users 
      WHERE id = $1;
    `, [userId]);

    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    // 2. Yeni Kiloya Göre Bilimsel Hesaplama (Mifflin-St Jeor)
    const age = user.calculated_age || user.age || 20;
    const height = parseFloat(user.height_cm || 180);
    const isFemale = (user.gender || '').toLowerCase() === 'female';
    const days = parseInt(user.workout_days_per_week, 10) || 0;

    let bmr = (10 * newWeight) + (6.25 * height) - (5 * age) + (isFemale ? -161 : 5);
    let mult = days >= 3 ? 1.55 : (days >= 1 ? 1.375 : 1.2);
    if (user.work_activity_level === 'heavy') mult = Math.max(mult, 1.725);

    const tdee = Math.round(bmr * mult);
    let targetCalories = tdee;

    if (user.goal === 'weight_gain' || user.goal === 'muscle_gain') {
      targetCalories = tdee + 400;
    } else if (user.goal === 'weight_loss' || user.goal === 'fat_loss') {
      targetCalories = Math.max(1200, tdee - 450);
    }

    const targetProtein = Math.round(newWeight * 1.8);
    const targetFats = Math.round((targetCalories * 0.25) / 9);
    const targetCarbs = Math.round((targetCalories - (targetProtein * 4) - (targetFats * 9)) / 4);

    // 3. users Tablosunu Güncelle (weight_kg ve fats_target sütunlarıyla)
    const updateQuery = `
      UPDATE users 
      SET 
        weight_kg = $1,
        calorie_target = $2,
        protein_target = $3,
        carbs_target = $4,
        fats_target = $5,
        updated_at = NOW()
      WHERE id = $6
      RETURNING *;
    `;

    const userUpdate = await db.query(updateQuery, [
      newWeight,
      targetCalories,
      targetProtein,
      targetCarbs,
      targetFats,
      userId,
    ]);

    // 4. Kilo Geçmişi İçin daily_logs Tablosuna Ekle (weight_kg sütun adıyla)
    try {
      await db.query(`
        INSERT INTO daily_logs (user_id, log_date, weight_kg)
        VALUES ($1, CURRENT_DATE, $2)
        ON CONFLICT (user_id, log_date)
        DO UPDATE SET weight_kg = EXCLUDED.weight_kg;
      `, [userId, newWeight]);
    } catch (_) {}

    res.json({
      success: true,
      current_weight: newWeight,
      user: userUpdate.rows[0],
    });
  } catch (error) {
    console.error('Kilo güncelleme hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;