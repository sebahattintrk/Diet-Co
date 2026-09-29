const express = require('express');
const router = express.Router();
const db = require('../db');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// GET /api/progress/:userId - Günlük, haftalık ve aylık besin özeti
router.get('/:userId', async (req, res) => {
  const userId = Number(req.params.userId) || 1;

  try {
    // 1. Kullanıcı hedefleri
    const userRes = await db.query('SELECT calorie_target, protein_target, carbs_target, fats_target, goal, name FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const targets = userRes.rows[0];

    // 2. Bugün tüketilen toplam makrolar (Gece 00:00 olunca CURRENT_DATE sayesinde otomatik sıfırlanır)
    const todayTotalsRes = await db.query(`
      SELECT 
        COALESCE(SUM(calories), 0)::int AS total_calories,
        COALESCE(SUM(protein_g), 0)::numeric(6,1) AS total_protein,
        COALESCE(SUM(carbs_g), 0)::numeric(6,1) AS total_carbs,
        COALESCE(SUM(fats_g), 0)::numeric(6,1) AS total_fats
      FROM food_logs
      WHERE user_id = $1 AND log_date = CURRENT_DATE
    `, [userId]);

    // 3. Bugün yenen yemeklerin listesi
    const todayMealsRes = await db.query(`
      SELECT id, food_name, calories, protein_g, carbs_g, fats_g, to_char(created_at, 'HH24:MI') as time
      FROM food_logs
      WHERE user_id = $1 AND log_date = CURRENT_DATE
      ORDER BY created_at DESC
    `, [userId]);

    // 4. Son 7 günün günlük dökümü (Haftalık trend için)
    const weeklyTrendRes = await db.query(`
      SELECT 
        log_date,
        COALESCE(SUM(calories), 0)::int AS calories,
        COALESCE(SUM(protein_g), 0)::numeric(6,1) AS protein
      FROM food_logs
      WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY log_date
      ORDER BY log_date ASC
    `, [userId]);

    // 5. Son 30 günün ortalamaları (Aylık görünüm)
    const monthlyStatsRes = await db.query(`
      SELECT 
        COUNT(DISTINCT log_date)::int AS logged_days,
        COALESCE(AVG(day_cals), 0)::int AS avg_daily_calories,
        COALESCE(AVG(day_pro), 0)::numeric(6,1) AS avg_daily_protein
      FROM (
        SELECT log_date, SUM(calories) as day_cals, SUM(protein_g) as day_pro
        FROM food_logs
        WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY log_date
      ) sub
    `, [userId]);

    return res.json({
      targets,
      today: {
        totals: todayTotalsRes.rows[0],
        meals: todayMealsRes.rows,
      },
      weeklyTrend: weeklyTrendRes.rows,
      monthlyStats: monthlyStatsRes.rows[0],
    });
  } catch (error) {
    console.error('Progress API Error:', error);
    return res.status(500).json({ error: 'Gelişim verisi alınamadı.' });
  }
});

// POST /api/progress/:userId/ai-report - Günlük, haftalık veya aylık koç raporu
router.post('/:userId/ai-report', async (req, res) => {
  const userId = Number(req.params.userId) || 1;
  const { period } = req.body; // 'daily' | 'weekly' | 'monthly'

  try {
    const userRes = await db.query(
      'SELECT name, goal, calorie_target, protein_target FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const u = userRes.rows[0];

    let prompt = '';

    if (period === 'daily') {
      // Bugünün toplamı ve yenenlerin listesi
      const todayTotalsRes = await db.query(`
        SELECT COALESCE(SUM(calories), 0)::int AS total_calories,
               COALESCE(SUM(protein_g), 0)::numeric(6,1) AS total_protein,
               COALESCE(SUM(carbs_g), 0)::numeric(6,1) AS total_carbs,
               COALESCE(SUM(fats_g), 0)::numeric(6,1) AS total_fats
        FROM food_logs
        WHERE user_id = $1 AND log_date = CURRENT_DATE
      `, [userId]);

      const todayMealsRes = await db.query(`
        SELECT food_name, calories, protein_g, carbs_g, fats_g, to_char(created_at, 'HH24:MI') as time
        FROM food_logs
        WHERE user_id = $1 AND log_date = CURRENT_DATE
        ORDER BY created_at ASC
      `, [userId]);

      const totals = todayTotalsRes.rows[0];
      const calRemaining = Math.max(0, u.calorie_target - totals.total_calories);
      const proRemaining = Math.max(0, Number(u.protein_target) - Number(totals.total_protein));

      prompt = `
Danışan: ${u.name} | Hedef: ${u.goal}
Günlük Hedef: ${u.calorie_target} kcal, ${u.protein_target}g Protein
Bugün Alınan: ${totals.total_calories} kcal, ${totals.total_protein}g Protein
Kalan İhtiyaç: ${calRemaining} kcal, ${proRemaining.toFixed(1)}g Protein
Bugün Tüketilen Öğünler: ${JSON.stringify(todayMealsRes.rows)}

Görev: Danışanına bugünkü beslenme durumuna dair anlık bir gün sonu/ara durum koç değerlendirmesi yap.
1. Hedefe göre bugünkü ilerlemesini samimi bir dille özetle.
2. Kalan kalori ve protein açığını net söyle.
3. Günün geri kalanı (akşam yemeği veya ara öğün) için bütçe dostu, tam kalan açığı kapatacak pratik 1 yemek tavsiyesi ver.
4. Su ve dinlenme hatırlatmasıyla bitir. Madde madde ve hap bilgi niteliğinde olsun.
`;
    } else {
      const days = period === 'monthly' ? 30 : 7;
      const logsRes = await db.query(`
        SELECT log_date, SUM(calories) as calories, SUM(protein_g) as protein
        FROM food_logs
        WHERE user_id = $1 AND log_date >= CURRENT_DATE - ($2 || ' days')::interval
        GROUP BY log_date
        ORDER BY log_date ASC
      `, [userId, days]);

      prompt = `
Danışan: ${u.name} | Hedef: ${u.goal} (Günlük Hedef: ${u.calorie_target} kcal, ${u.protein_target}g Protein)
Son ${days} günlük tüketim dökümü:
${JSON.stringify(logsRes.rows)}

Görev: Bu verilere dayanarak danışanına samimi, profesyonel bir ${period === 'monthly' ? 'aylık' : 'haftalık'} koç özeti çıkar.
- Hedefe tutarlılık puanı ver.
- Önümüzdeki dönem için en kritik 2 stratejik tavsiyeyi yaz.
`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    return res.json({ report: response.text });
  } catch (error) {
    console.error('AI Report Error:', error);
    return res.status(500).json({ error: 'Rapor üretilemedi: ' + error.message });
  }
});

// DELETE /meal/:id -> index.js içindeki '/api/progress' ile birleştiğinde '/api/progress/meal/:id' olur
router.delete('/meal/:id', async (req, res) => {
  const mealId = Number(req.params.id);

  if (!mealId || isNaN(mealId)) {
    return res.status(400).json({ error: 'Geçersiz öğün kimliği.' });
  }

  try {
    const result = await db.query(
      'DELETE FROM food_logs WHERE id = $1 RETURNING *',
      [mealId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Öğün bulunamadı.' });
    }

    return res.json({
      success: true,
      message: 'Öğün başarıyla kaldırıldı.',
      deletedMeal: result.rows[0],
    });
  } catch (error) {
    console.error('Öğün silme hatası:', error);
    return res.status(500).json({ error: 'Öğün silinirken hata oluştu: ' + error.message });
  }
});

module.exports = router;