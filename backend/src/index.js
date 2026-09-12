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