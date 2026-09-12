// backend/src/routes/chat.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { GoogleGenAI } = require('@google/genai');
const { generateMedicalConstraints } = require('../services/healthFilter');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const checkLimit = require('../middleware/checkLimit');

function calculateNutrition(u, newWeight) {
  const age = u.calculated_age || u.age || 20;
  const height = parseFloat(u.height_cm || u.height || 180);
  const weight = parseFloat(newWeight);
  const isFemale = (u.gender || '').toLowerCase() === 'female';
  const days = parseInt(u.workout_days_per_week, 10) || 0;

  let bmr = (10 * weight) + (6.25 * height) - (5 * age) + (isFemale ? -161 : 5);
  let mult = 1.2;
  if (days >= 1 && days <= 2) mult = 1.375;
  else if (days >= 3 && days <= 4) mult = 1.55;
  else if (days >= 5) mult = 1.725;

  if (u.work_activity_level === 'heavy') mult = Math.max(mult, 1.725);
  else if (u.work_activity_level === 'moderate') mult = Math.max(mult, 1.55);
  else if (u.work_activity_level === 'light') mult = Math.max(mult, 1.375);

  const tdee = Math.round(bmr * mult);
  let targetCalories = tdee;
  if (u.goal === 'weight_gain' || u.goal === 'muscle_gain') targetCalories = tdee + 400;
  else if (u.goal === 'weight_loss' || u.goal === 'fat_loss') targetCalories = Math.max(1200, tdee - 450);

  const targetProtein = Math.round(weight * 1.8);
  const targetFats = Math.round((targetCalories * 0.25) / 9);
  const targetCarbs = Math.round((targetCalories - (targetProtein * 4) - (targetFats * 9)) / 4);

  return { targetCalories, targetProtein, targetCarbs, targetFats };
}

function parseWeightFromText(rawText, currentWeight) {
  if (!rawText) return null;

  let text = rawText
    .replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(',', '.');

  const words = { 'bir': '1', 'iki': '2', 'uc': '3', 'dort': '4', 'bes': '5', 'on': '10' };
  for (const [w, n] of Object.entries(words)) text = text.replace(new RegExp(`\\b${w}\\b`, 'g'), n);

  const numMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (!numMatch) return null;

  const val = parseFloat(numMatch[1]);
  if (isNaN(val)) return null;

  if (val <= 20) {
    if (/verdim|dustum|kaybettim|gitti|eksildim/.test(text)) return Math.max(30, currentWeight - val);
    if (/aldim/.test(text)) return currentWeight + val;
  }

  if (val >= 35 && val <= 280) {
    if (/oldum|dustum|ciktim|kiloyum|tartildim|kilo/.test(text)) return val;
  }

  return null;
}

function extractFoodLog(replyText, userMessage) {
  let parsed = null;

  const tagMatch = replyText.match(/\[BESIN_KAYIT:\s*(\{.*?\})\s*\]/i);
  if (tagMatch) {
    try {
      parsed = JSON.parse(tagMatch[1]);
    } catch (_) {}
  }

  if (!parsed) {
    const jsonMatch = replyText.match(/```(?:json:food_log|json)?\s*(\{[\s\S]*?\})\s*```?/i);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch (_) {}
    }
  }

  if (!parsed && /yedim|içtim|ictim|tükettim|yendi/i.test(userMessage)) {
    const calMatch = replyText.match(/Kalori:\s*~?\s*(\d+)/i);
    const proMatch = replyText.match(/Protein:\s*~?\s*(\d+(?:\.\d+)?)/i);
    const carbMatch = replyText.match(/Karbonhidrat:\s*~?\s*(\d+(?:\.\d+)?)/i);
    const fatMatch = replyText.match(/Yağ:\s*~?\s*(\d+(?:\.\d+)?)/i);

    if (calMatch) {
      const cleanName = userMessage
        .replace(/az önce|yedim|içtim|tükettim|biraz/gi, '')
        .trim();

      parsed = {
        food_name: cleanName ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1) : 'Öğün',
        calories: parseInt(calMatch[1], 10),
        protein_g: proMatch ? parseFloat(proMatch[1]) : 0,
        carbs_g: carbMatch ? parseFloat(carbMatch[1]) : 0,
        fats_g: fatMatch ? parseFloat(fatMatch[1]) : 0,
      };
    }
  }

  return parsed;
}

router.post('/', checkLimit, async (req, res) => {
  const { message, userId } = req.body;
  const targetUserId = Number(userId) || 1;

  try {
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mesaj boş olamaz.' });
    }

    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    let u = userRes.rows[0];

    // 1. Kullanıcı mesajını limit sayacı için chat_messages tablosuna kaydet
    try {
      await db.query(
        `INSERT INTO chat_messages (user_id, message, sender, created_at)
         VALUES ($1, $2, 'user', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))`,
        [targetUserId, message.trim()]
      );
    } catch (saveUserMsgErr) {
      console.warn('chat_messages kullanıcı mesajı kayıt uyarısı:', saveUserMsgErr.message);
    }

    const displayName = u.name ? u.name.trim() : 'Dostum';
    let currentWeight = parseFloat(u.weight_kg || u.weight || 75);

    const detectedWeight = parseWeightFromText(message, currentWeight);
    let weightUpdated = false;
    let newMetrics = null;

    if (detectedWeight && detectedWeight !== currentWeight) {
      newMetrics = calculateNutrition(u, detectedWeight);

      await db.query(`
        UPDATE users 
        SET weight_kg = $1, calorie_target = $2, protein_target = $3, carbs_target = $4, fats_target = $5
        WHERE id = $6
      `, [
        detectedWeight,
        newMetrics.targetCalories,
        newMetrics.targetProtein,
        newMetrics.targetCarbs,
        newMetrics.targetFats,
        targetUserId
      ]);

      try {
        await db.query(`
          INSERT INTO daily_logs (user_id, log_date, weight_kg)
          VALUES ($1, CURRENT_DATE, $2)
          ON CONFLICT (user_id, log_date)
          DO UPDATE SET weight_kg = EXCLUDED.weight_kg;
        `, [targetUserId, detectedWeight]);
      } catch (_) {}

      currentWeight = detectedWeight;
      u.weight_kg = detectedWeight;
      u.calorie_target = newMetrics.targetCalories;
      u.protein_target = newMetrics.targetProtein;
      weightUpdated = true;
    }

    let eatenCal = 0;
    let eatenPro = 0;
    try {
      const todaySummary = await db.query(`
        SELECT COALESCE(SUM(calories), 0) as total_cal,
               COALESCE(SUM(protein_g), 0) as total_pro
        FROM food_logs
        WHERE user_id = $1 AND (log_date = CURRENT_DATE OR created_at::date = CURRENT_DATE)
      `, [targetUserId]);
      eatenCal = Number(todaySummary.rows[0].total_cal);
      eatenPro = Number(todaySummary.rows[0].total_pro);
    } catch (_) {}

    const targetCal = u.calorie_target || 2200;
    const remainingCal = targetCal - eatenCal;

    const medicalBlock = generateMedicalConstraints(u.health_conditions);

    const systemInstruction = `
Sen Diet-Co uygulamasının stratejik, bilimsel ve motive edici fitness/beslenme koçusun.
Kullanıcı: ${displayName}
Hedef: ${u.goal || 'Sağlıklı Yaşam'} | Günlük Hedef: ${targetCal} kcal
Bugün Alınan: ${eatenCal} kcal

${medicalBlock}

🚨 ÖNEMLİ SAĞLIK VE TAVSİYE KURALI:
Kullanıcı sana yemek önerisi sorduğunda veya bir besin tüketmek istediğini söylediğinde (Örn: "Dürüm yesem olur mu?", "Tatlı krizim tuttu ne yiyeyim?"):
Kullanıcının yukarıda belirtilen sağlık rahatsızlıklarına kesinlikle dikkat et! Eğer yemek istediği veya sorduğu şey hastalığına zararlıysa (örneğin çölyak için unlu/glutenli gıdalar, insülin direnci için şekerli tatlılar vb.), nazikçe bunun sağlığı için zararlı olduğunu söyle ve güvenli bir alternatif öner. ASLA yasaklı bir besini tavsiye etme!

ÖNEMLİ BESİN KAYIT KURALI:
Kullanıcı bir şey yediğinde/içtiğinde tahmini değerleri belirt ve cevabın en sonuna ekle:
[BESIN_KAYIT: {"food_name": "Öğün Adı", "calories": 250, "protein_g": 15, "carbs_g": 20, "fats_g": 8}]
`;

    let reply = '';
    let loggedItem = null;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: message,
        config: { systemInstruction, temperature: 0.7 },
      });

      reply = response.text || '';

      const food = extractFoodLog(reply, message);
      if (food && food.calories > 0) {
        try {
          await db.query(`
            INSERT INTO food_logs (
              user_id, food_name, calories, protein_g, carbs_g, fats_g, log_date, created_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, 
              (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
              (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')
            )
          `, [
            targetUserId,
            food.food_name || 'Öğün',
            Math.round(food.calories),
            parseFloat(food.protein_g || 0),
            parseFloat(food.carbs_g || 0),
            parseFloat(food.fats_g || 0),
          ]);
          loggedItem = food;
        } catch (dbErr) {
          console.error('Food log insert error:', dbErr);
        }
      }

      reply = reply
        .replace(/\[BESIN_KAYIT:\s*\{.*?\}\s*\]/gi, '')
        .replace(/```(?:json:food_log|json)?[\s\S]*?(?:```|$)/gi, '')
        .trim();

    } catch (aiErr) {
      console.error('Chat AI hatası:', aiErr.message || aiErr);
      reply = `Mesajınızı aldım ${displayName}! Sağlık durumunuz ve hedefleriniz doğrultusunda harika ilerliyoruz. 💪`;
    }

    // 2. Modelin cevabını da sohbet geçmişine kaydet
    try {
      await db.query(
        `INSERT INTO chat_messages (user_id, message, sender, created_at)
         VALUES ($1, $2, 'model', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))`,
        [targetUserId, reply]
      );
    } catch (saveModelMsgErr) {
      console.warn('chat_messages model yanıtı kayıt uyarısı:', saveModelMsgErr.message);
    }

    const freshUserRes = await db.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
    const freshUser = freshUserRes.rows[0] || u;
    freshUser.weight = parseFloat(freshUser.weight_kg);
    freshUser.weight_kg = parseFloat(freshUser.weight_kg);

    return res.status(200).json({
      reply,
      loggedItem,
      user: freshUser,
      remainingQuestions: req.remainingQuestions,
      isPro: req.userIsPro,
    });
  } catch (fatalError) {
    console.error('Fatal Route Error:', fatalError);
    return res.status(500).json({ error: 'Mesaj işlenirken bir sunucu hatası oluştu.' });
  }
});

module.exports = router;