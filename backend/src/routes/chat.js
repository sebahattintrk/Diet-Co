// backend/src/routes/chat.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { GoogleGenAI } = require('@google/genai');
const { generateMedicalConstraints } = require('../services/healthFilter');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const checkLimit = require('../middleware/checkLimit');

// Türkiye saatine göre gece 03:00'te gün devreden SQL tarih tanımı
const ACTIVE_DATE_SQL = `((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul') - INTERVAL '3 hours')::date`;

function calculateNutrition(u, newWeight) {
  const age = Number(u.calculated_age || u.age) || 25;
  const height = Number(u.height_cm || u.height) || 175;
  const weight = Number(newWeight) || 70;
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

  targetCalories = Math.round(Number(targetCalories) || 2000);
  const targetProtein = Math.round((weight * 1.8) || 120);
  const targetFats = Math.round(((targetCalories * 0.25) / 9) || 60);
  const targetCarbs = Math.max(50, Math.round((targetCalories - (targetProtein * 4) - (targetFats * 9)) / 4) || 200);

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
    if (/oldum|dustum|ciktim|kiloyum|tartildim|kilo|kg/.test(text)) return val;
  }

  return null;
}

function extractFoodLog(replyText, userMessage) {
  let parsed = null;

  const tagMatch = replyText.match(/\[BESIN_KAYIT:\s*(\{.*?\})\s*\]/i);
  if (tagMatch) {
    try {
      parsed = JSON.parse(tagMatch[1]);
    } catch (_) { }
  }

  if (!parsed) {
    const jsonMatch = replyText.match(/```(?:json:food_log|json)?\s*(\{[\s\S]*?\})\s*```?/i);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch (_) { }
    }
  }

  if (!parsed && /yedim|içtim|ictim|tükettim|yendi|kahvaltı|öğün|atıştırdım/i.test(userMessage)) {
    const calMatch = replyText.match(/(?:Kalori|kcal)\s*[:=~]?\s*(\d+)/i);
    const proMatch = replyText.match(/Protein\s*[:=~]?\s*(\d+(?:\.\d+)?)/i);
    const carbMatch = replyText.match(/(?:Karbonhidrat|Karb)\s*[:=~]?\s*(\d+(?:\.\d+)?)/i);
    const fatMatch = replyText.match(/Yağ\s*[:=~]?\s*(\d+(?:\.\d+)?)/i);

    if (calMatch) {
      const cleanName = userMessage
        .replace(/az önce|yedim|içtim|ictim|tükettim|biraz|sabah|akşam|öğle/gi, '')
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

  if (!parsed && /yedim|içtim|ictim|tükettim/i.test(userMessage)) {
    const cleanName = userMessage.replace(/yedim|içtim|ictim|tükettim/gi, '').trim();
    parsed = {
      food_name: cleanName ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1) : 'Tüketilen Öğün',
      calories: 250,
      protein_g: 12,
      carbs_g: 25,
      fats_g: 8,
    };
  }

  return parsed;
}

router.post('/', checkLimit, async (req, res) => {
  const { message, userId } = req.body;
  const targetUserId = Number(userId || req.user?.id);

  if (!targetUserId || isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Geçersiz veya eksik kullanıcı oturumu.' });
  }

  try {
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mesaj boş olamaz.' });
    }

    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    let u = userRes.rows[0];
    const displayName = u.name ? u.name.trim() : 'Dostum';
    const lowerMsg = message.trim().toLowerCase();

    // ----------------------------------------------------
    // 🗑️ ÖĞÜN SİLME VEYA GÜNÜ SIFIRLAMA MANTIĞI
    // ----------------------------------------------------
    if (/sıfırla|sifirla|temizle|yanlış yedim|yanlis yedim/i.test(lowerMsg) && /bugün|öğün|yemek|yediklerim|hepsini/i.test(lowerMsg)) {
      await db.query(`DELETE FROM food_logs WHERE user_id = $1 AND log_date = ${ACTIVE_DATE_SQL}`, [targetUserId]);

      const resetReply = `Anladım ${displayName}, bugünkü tüm yediklerini günlüğünden temizledim. Sayfayı yenilediğinde kalorilerin sıfırlanmış olacaktır! Yeni öğünlerini girmeye baştan başlayabilirsin. 🔄`;

      await db.query(
        `INSERT INTO chat_messages (user_id, message, sender, created_at)
         VALUES ($1, $2, 'model', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))`,
        [targetUserId, resetReply]
      );

      return res.status(200).json({
        reply: resetReply,
        loggedItem: null,
        user: u,
        remainingQuestions: req.remainingQuestions,
        isPro: req.userIsPro,
      });
    }

    if (/sil|kaldır|kaldir/i.test(lowerMsg) && /öğün|yemek|yediğim|yedigim/i.test(lowerMsg)) {
      // Spesifik son öğünü veya ismi geçen öğünü sil
      const lastFoodRes = await db.query(
        `SELECT id, food_name FROM food_logs WHERE user_id = $1 AND log_date = ${ACTIVE_DATE_SQL} ORDER BY id DESC LIMIT 1`,
        [targetUserId]
      );

      if (lastFoodRes.rows.length > 0) {
        const deletedFood = lastFoodRes.rows[0];
        await db.query(`DELETE FROM food_logs WHERE id = $1`, [deletedFood.id]);

        const deleteReply = `Tamamdır ${displayName}, günlüğüne son eklediğin "${deletedFood.food_name}" öğününü sildim ve kalorilerini düştüm! 👌`;

        await db.query(
          `INSERT INTO chat_messages (user_id, message, sender, created_at)
           VALUES ($1, $2, 'model', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))`,
          [targetUserId, deleteReply]
        );

        return res.status(200).json({
          reply: deleteReply,
          loggedItem: null,
          user: u,
          remainingQuestions: req.remainingQuestions,
          isPro: req.userIsPro,
        });
      }
    }

    // 1. Kullanıcı mesajını kaydet
    try {
      await db.query(
        `INSERT INTO chat_messages (user_id, message, sender, created_at)
         VALUES ($1, $2, 'user', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))`,
        [targetUserId, message.trim()]
      );
    } catch (saveUserMsgErr) {
      console.warn('chat_messages kullanıcı mesajı kayıt uyarısı:', saveUserMsgErr.message);
    }

    let currentWeight = parseFloat(u.weight_kg || 75);
    const detectedWeight = parseWeightFromText(message, currentWeight);
    let weightUpdated = false;

    if (detectedWeight && detectedWeight !== currentWeight) {
      const newMetrics = calculateNutrition(u, detectedWeight);

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
          VALUES ($1, ${ACTIVE_DATE_SQL}, $2)
          ON CONFLICT (user_id, log_date)
          DO UPDATE SET weight_kg = EXCLUDED.weight_kg;
        `, [targetUserId, detectedWeight]);
      } catch (_) { }

      currentWeight = detectedWeight;
      u.weight_kg = detectedWeight;
      u.calorie_target = newMetrics.targetCalories;
      u.protein_target = newMetrics.targetProtein;
      weightUpdated = true;
    }

    let eatenCal = 0;
    try {
      const todaySummary = await db.query(`
        SELECT COALESCE(SUM(calories), 0) as total_cal
        FROM food_logs
        WHERE user_id = $1 AND log_date = ${ACTIVE_DATE_SQL}
      `, [targetUserId]);
      eatenCal = Number(todaySummary.rows[0]?.total_cal || 0);
    } catch (_) { }

    const targetCal = Number(u.calorie_target) || 2200;
    const medicalBlock = typeof generateMedicalConstraints === 'function'
      ? generateMedicalConstraints(u.health_conditions)
      : '';

    const systemInstruction = `
Sen Diet-Co uygulamasının profesyonel, samimi, net ve motive edici yapay zeka fitness/beslenme koçusun.
Danışan: ${displayName}
Hedef: ${u.goal || 'Sağlıklı Yaşam'} | Günlük Kalori Hedefi: ${targetCal} kcal
Bugün Tüketilen: ${eatenCal} kcal | Güncel Kilo: ${currentWeight} kg
${weightUpdated ? `NOT: Kullanıcı az önce yeni kilosunu bildirdi (${currentWeight} kg). Kilo başarıyla güncellendi!` : ''}

${medicalBlock}

🚨 ÇOK ÖNEMLİ BESİN KAYIT KURALI:
Kullanıcı bir şey yediğini veya içtiğini belirttiğinde (örneğin: "yumurta yedim", "protein bar yedim kahve içtim"):
1. Mesajında danışanına besinlerin yaklaşık kalori, protein, karbonhidrat ve yağ değerlerini kibarca söyle ve hedefine etkisini açıkla.
2. CEVABININ EN SON SATIRINA KESİNLİKLE VE HİÇ BOZMADAN ŞU JSON ETİKETİNİ KOY:
[BESIN_KAYIT: {"food_name": "Öğün veya Yiyecek Adı", "calories": 250, "protein_g": 15, "carbs_g": 20, "fats_g": 8}]
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
              ${ACTIVE_DATE_SQL},
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
      
      const fallbackFood = extractFoodLog('', message);
      if (fallbackFood && fallbackFood.calories > 0) {
        try {
          await db.query(`
            INSERT INTO food_logs (
              user_id, food_name, calories, protein_g, carbs_g, fats_g, log_date, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, ${ACTIVE_DATE_SQL}, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))
          `, [
            targetUserId,
            fallbackFood.food_name,
            fallbackFood.calories,
            fallbackFood.protein_g,
            fallbackFood.carbs_g,
            fallbackFood.fats_g,
          ]);
          loggedItem = fallbackFood;
        } catch (_) {}
      }

      if (weightUpdated) {
        reply = `Harika haber ${displayName}! Yeni kilonu (${currentWeight} kg) başarıyla kaydettim ve hedeflerini güncelledim. 💪`;
      } else if (loggedItem) {
        reply = `Afiyet olsun ${displayName}! Yediğin ${loggedItem.food_name} (${loggedItem.calories} kcal) günlüğüne ve gelişim sayfana işlendi. Hedefine doğru harika ilerliyorsun! 🥗`;
      } else {
        reply = `Mesajını aldım ${displayName}! Günlük hedeflerine sadık kalarak harika bir disiplin sergiliyorsun. Tempoyu koruyalım! 💪`;
      }
    }

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