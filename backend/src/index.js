const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
// Gelen her isteği terminale yazar:
app.use((req, res, next) => {
  console.log(`📡 [GELEN İSTEK] ${req.method} ${req.url}`);
  next();
});
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Rotalar
const onboardingRoutes = require('./routes/onboarding');
const dashboardRoutes = require('./routes/dashboard');
const chatRoutes = require('./routes/chat');
const mealPlanRoutes = require('./routes/mealPlan');
const exercisesRoutes = require('./routes/exercises');
const supplementsRoutes = require('./routes/supplements');
const waterRouter = require('./routes/water');

app.use('/api/onboarding', onboardingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/meal-plan', mealPlanRoutes);
app.use('/api/exercises', exercisesRoutes);
app.use('/api/supplements', supplementsRoutes);
app.use('/api/progress', require('./routes/progress'));

// Öğün silme için doğrudan kök yakalayıcı (Hem /api/progress/meal hem /progress/meal hem de /api/progress/meal/:id için)
const db = require('./db');
app.delete(['/api/progress/meal/:id', '/progress/meal/:id'], async (req, res) => {
  const mealId = Number(req.params.id);
  console.log(`🗑️ [SİLME İSTEĞİ GELDİ] Öğün ID: ${mealId}`);

  if (!mealId || isNaN(mealId)) {
    return res.status(400).json({ error: 'Geçersiz öğün kimliği.' });
  }

  try {
    const result = await db.query('DELETE FROM food_logs WHERE id = $1 RETURNING *', [mealId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Öğün bulunamadı.' });
    }
    console.log(`✅ [ÖĞÜN SİLİNDİ] ID: ${mealId}, İsim: ${result.rows[0].food_name}`);
    return res.json({ success: true, message: 'Öğün başarıyla kaldırıldı.', deletedMeal: result.rows[0] });
  } catch (error) {
    console.error('🔥 [Öğün Silme Hatası]:', error);
    return res.status(500).json({ error: 'Öğün silinirken hata oluştu.' });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/water', waterRouter);

app.get('/', (req, res) => {
  res.send('FitIntel API Çalışıyor');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`> FitIntel API listening on http://localhost:${PORT}`);
});

app.use((err, req, res, next) => {
  console.error('🔥 [BACKEND HATA]:', err.message || err);
  res.status(500).json({ error: err.message || 'Sunucu hatası' });
});