// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'fitintel_super_secret_jwt_key_2026';

// POST /api/auth/complete-registration (Tüm kayıt adımları bittiğinde tek seferde oluşturur)
router.post('/complete-registration', async (req, res) => {
  const {
    name,
    email,
    password,
    goal,
    gender,
    birth_date,
    age: providedAge,
    height_cm,
    weight_kg,
    waist_cm,
    arm_cm,
    shoulder_cm,
    right_leg_cm,
    left_leg_cm,
    chest_cm,
    hip_cm,
    workout_days_per_week,
    workout_hours_per_day,
    occupation,
    work_activity_level,
    health_conditions,
    disliked_foods,
    budget,
  } = req.body;

  if (!name || !email || !password || !height_cm || !weight_kg) {
    return res.status(400).json({ error: 'Kayıt ve fiziksel ölçü alanları eksiksiz doldurulmalıdır.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Bu e-posta adresi zaten kullanımda.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // 1. Dinamik Yaş Hesabı
    let calculatedAge = providedAge ? parseInt(providedAge, 10) : null;
    if (!calculatedAge && birth_date) {
      const birth = new Date(birth_date);
      const today = new Date();
      calculatedAge = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) calculatedAge--;
    }
    const finalAge = calculatedAge || 24;

    // 2. BMR & TDEE Hesabı (Mifflin-St Jeor)
    const weight = parseFloat(weight_kg);
    const height = parseFloat(height_cm);
    const isFemale = (gender || '').toLowerCase() === 'female';

    let bmr = (10 * weight) + (6.25 * height) - (5 * finalAge);
    bmr += isFemale ? -161 : 5;

    const days = parseInt(workout_days_per_week, 10) || 0;
    let multiplier = 1.2;
    if (days >= 1 && days <= 2) multiplier = 1.375;
    else if (days >= 3 && days <= 4) multiplier = 1.55;
    else if (days >= 5) multiplier = 1.725;

    if (work_activity_level === 'heavy') multiplier = Math.max(multiplier, 1.725);
    else if (work_activity_level === 'moderate') multiplier = Math.max(multiplier, 1.55);
    else if (work_activity_level === 'light') multiplier = Math.max(multiplier, 1.375);

    const tdee = Math.round(bmr * multiplier);

    let dynamicCalories = tdee;
    if (goal === 'weight_gain' || goal === 'muscle_gain') {
      dynamicCalories = tdee + 400;
    } else if (goal === 'weight_loss' || goal === 'fat_loss') {
      dynamicCalories = Math.max(1200, tdee - 450);
    }

    const dynamicProtein = Math.round(weight * 1.8);
    const dynamicFats = Math.round((dynamicCalories * 0.25) / 9);
    const dynamicCarbs = Math.round((dynamicCalories - (dynamicProtein * 4) - (dynamicFats * 9)) / 4);

    let formattedDislikedFoods = null;
    if (Array.isArray(disliked_foods)) {
      formattedDislikedFoods = disliked_foods;
    } else if (typeof disliked_foods === 'string' && disliked_foods.trim().length > 0) {
      formattedDislikedFoods = disliked_foods.split(',').map((i) => i.trim()).filter(Boolean);
    }

    // 3. Kullanıcıyı ve tüm verileri tek hamlede kaydet
    const insertQuery = `
      INSERT INTO users (
        name, email, password_hash, is_premium, trial_ends_at,
        goal, birth_date, age, height_cm, weight_kg,
        waist_cm, arm_cm, shoulder_cm, right_leg_cm, left_leg_cm,
        chest_cm, hip_cm, workout_days_per_week, workout_hours_per_day,
        occupation, work_activity_level, health_conditions, disliked_foods, budget,
        calorie_target, protein_target, carbs_target, fats_target,
        daily_ai_count, last_ai_date
      ) VALUES (
        $1, $2, $3, false, NOW() - INTERVAL '1 hour',
        $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21, $22,
        $23, $24, $25, $26,
        0, CURRENT_DATE
      )
      RETURNING *;
    `;

    const values = [
      name.trim(),
      email.toLowerCase().trim(),
      hash,
      goal || 'fat_loss',
      birth_date || null,
      finalAge,
      height,
      weight,
      waist_cm || null,
      arm_cm || null,
      shoulder_cm || null,
      right_leg_cm || null,
      left_leg_cm || null,
      chest_cm || null,
      hip_cm || null,
      workout_days_per_week || 0,
      workout_hours_per_day || 1.0,
      occupation || null,
      work_activity_level || 'sedentary',
      health_conditions || '',
      formattedDislikedFoods,
      budget ? parseFloat(budget) : null,
      dynamicCalories,
      dynamicProtein,
      dynamicCarbs,
      dynamicFats,
    ];

    const result = await db.query(insertQuery, values);
    const user = result.rows[0];
    delete user.password_hash;

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    return res.status(201).json({ success: true, token, user });
  } catch (err) {
    console.error('Kayıt Tamamlama Hatası:', err);
    return res.status(500).json({ error: 'Kayıt tamamlanamadı: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre gereklidir.' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'E-posta veya şifre hatalı.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'E-posta veya şifre hatalı.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    delete user.password_hash;
    return res.json({ token, user });
  } catch (err) {
    console.error('Login Hatası:', err);
    return res.status(500).json({ error: 'Giriş yapılırken bir hata oluştu: ' + err.message });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;
    if (!userId) return res.status(400).json({ error: 'userId zorunludur' });

    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const user = result.rows[0];
    delete user.password_hash;
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ error: 'Kullanıcı bilgisi alınamadı: ' + err.message });
  }
});

// POST /api/auth/upgrade
router.post('/upgrade', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Kullanıcı kimliği eksik.' });

  try {
    const result = await db.query(
      'UPDATE users SET is_premium = true WHERE id = $1 RETURNING id, name, email, is_premium',
      [userId]
    );
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Üyelik güncellenemedi: ' + err.message });
  }
});

// DELETE /api/auth/delete-account
router.delete('/delete-account', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Kullanıcı kimliği eksik.' });

  try {
    await db.query('DELETE FROM food_logs WHERE user_id = $1', [userId]).catch(() => {});
    await db.query('DELETE FROM daily_logs WHERE user_id = $1', [userId]).catch(() => {});
    await db.query('DELETE FROM meal_plans WHERE user_id = $1', [userId]).catch(() => {});
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    return res.json({ success: true, message: 'Hesap ve tüm veriler başarıyla silindi.' });
  } catch (err) {
    return res.status(500).json({ error: 'Hesap silinirken hata oluştu: ' + err.message });
  }
});

// PUT /api/auth/measurements
router.put('/measurements', async (req, res) => {
  const {
    userId,
    waist_cm,
    arm_cm,
    shoulder_cm,
    right_leg_cm,
    left_leg_cm,
    workout_days_per_week,
  } = req.body;

  const targetUserId = userId || 1;

  try {
    const query = `
      UPDATE users 
      SET 
        waist_cm = $1,
        arm_cm = $2,
        shoulder_cm = $3,
        right_leg_cm = $4,
        left_leg_cm = $5,
        workout_days_per_week = $6
      WHERE id = $7
      RETURNING *;
    `;

    const values = [
      waist_cm ? parseFloat(waist_cm) : null,
      arm_cm ? parseFloat(arm_cm) : null,
      shoulder_cm ? parseFloat(shoulder_cm) : null,
      right_leg_cm ? parseFloat(right_leg_cm) : null,
      left_leg_cm ? parseFloat(left_leg_cm) : null,
      workout_days_per_week !== undefined ? parseInt(workout_days_per_week, 10) : 0,
      targetUserId,
    ];

    const result = await db.query(query, values);
    const updatedUser = result.rows[0];
    delete updatedUser.password_hash;

    return res.status(200).json({
      success: true,
      message: 'Vücut ölçüleri başarıyla güncellendi!',
      user: updatedUser,
    });
  } catch (err) {
    console.error('[Ölçü Güncelleme Hatası]:', err);
    return res.status(500).json({ error: 'Ölçüler güncellenemedi.' });
  }
});

module.exports = router;