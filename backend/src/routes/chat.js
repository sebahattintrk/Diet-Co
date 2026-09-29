// backend/src/routes/chat.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { GoogleGenAI } = require('@google/genai');
const { generateMedicalConstraints } = require('../services/healthFilter');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const checkLimit = require('../middleware/checkLimit');

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
    if (/aldim/.test(text) && /kilo|kg/.test(text)) return currentWeight + val;
  }

  if (val >= 35 && val <= 280) {
    if (/oldum|dustum|ciktim|kiloyum|tartildim|kilo|kg/.test(text)) return val;
  }

  return null;
}

function extractFoodLog(replyText, userMessage, isWeightUpdate = false) {
  if (isWeightUpdate) return null;

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

  const hasFoodAction = /yedim|içtim|ictim|tükettim|yendi|kahvaltı|öğün|atıştırdım/i.test(userMessage);
  const isWeightContext = /kilo aldım|kilo verdim|tartıldım|kg oldum|kilo olarak güncelle/i.test(userMessage);

  if (!parsed && hasFoodAction && !isWeightContext) {
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

    // 1. SU BARINI SIFIRLAMA
    if (
      /suyumu sıfırla|suyumu sifirla|suyu sıfırla|suyu sifirla|suyu temizle|su tüketimini sıfırla/i.test(lowerMsg) ||
      (/su|suları|sulari/i.test(lowerMsg) && /sıfırla|sifirla|temizle/i.test(lowerMsg))
    ) {
      await db.query(`
        INSERT INTO daily_logs (user_id, log_date, water_ml)
        VALUES ($1, ${ACTIVE_DATE_SQL}, 0)
        ON CONFLICT (user_id, log_date)
        DO UPDATE SET water_ml = 0;
      `, [targetUserId]);

      const resetWaterReply = `Tamamdır ${displayName}, bugünkü su tüketimini sıfırladım! Sayfayı yenilediğinde su barı sıfırdan başlayacaktır. 💧`;

      await db.query(
        `INSERT INTO chat_messages (user_id, message, sender, created_at)
         VALUES ($1, $2, 'model', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))`,
        [targetUserId, resetWaterReply]
      );

      return res.status(200).json({
        reply: resetWaterReply,
        loggedItem: null,
        user: u,
        remainingQuestions: req.remainingQuestions,
        isPro: req.userIsPro,
      });
    }

    // 2. TÜM ÖĞÜNLERİ SİLME
    if (
      /tüm öğünlerimi sil|tum ogunlerimi sil|bütün öğünlerimi sil|butun ogunlerimi sil|tüm yediklerimi sil|tum yediklerimi sil|bütün yediklerimi sil|öğünlerimin hepsini sil/i.test(lowerMsg) ||
      (/tüm|tum|bütün|butun|hepsini/i.test(lowerMsg) && /öğün|ogun|yemek|yediklerim/i.test(lowerMsg) && /sil|kaldır|kaldir|temizle/i.test(lowerMsg))
    ) {
      await db.query(`DELETE FROM food_logs WHERE user_id = $1`, [targetUserId]);
      
      await db.query(`
        INSERT INTO daily_logs (user_id, log_date, water_ml)
        VALUES ($1, ${ACTIVE_DATE_SQL}, 0)
        ON CONFLICT (user_id, log_date)
        DO UPDATE SET water_ml = 0;
      `, [targetUserId]);

      const resetAllReply = `Tamamdır ${displayName}, sistemdeki tüm geçmiş ve bugünkü öğün kayıtlarını ve su tüketimini başarıyla temizledim. Sayfayı yenilediğinde günlüğün tertemiz görünecektir! 🚀`;

      await db.query(
        `INSERT INTO chat_messages (user_id, message, sender, created_at)
         VALUES ($1, $2, 'model', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))`,
        [targetUserId, resetAllReply]
      );

      return res.status(200).json({
        reply: resetAllReply,
        loggedItem: null,
        user: u,
        remainingQuestions: req.remainingQuestions,
        isPro: req.userIsPro,
      });
    }

    // 3. BUGÜNKÜ YEDİKLERİMİ VE SUYU SIFIRLAMA
    if (/sıfırla|sifirla|temizle|yanlış yedim|yanlis yedim/i.test(lowerMsg) && /bugün|bugun|öğün|yemek|yediklerim|günü/i.test(lowerMsg)) {
      await db.query(`DELETE FROM food_logs WHERE user_id = $1 AND log_date = ${ACTIVE_DATE_SQL}`, [targetUserId]);

      await db.query(`
        INSERT INTO daily_logs (user_id, log_date, water_ml)
        VALUES ($1, ${ACTIVE_DATE_SQL}, 0)
        ON CONFLICT (user_id, log_date)
        DO UPDATE SET water_ml = 0;
      `, [targetUserId]);

      const resetReply = `Anladım ${displayName}, bugünkü tüm yediklerini ve su barını tamamen sıfırladım. Sayfayı yenilediğinde kalorilerin ve suyun sıfır olarak güncellenecektir! Yeni başlangıcını yapabilirsin. 🔄`;

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

    // 4. SON ÖĞÜNÜ SİLME
    if (/sil|kaldır|kaldir/i.test(lowerMsg) && /öğün|yemek|yediğim|yedigim/i.test(lowerMsg)) {
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

    // Kullanıcı mesajını kaydet
    try {
      await db.query(
        `INSERT INTO chat_messages (user_id, message, sender, created_at)
         VALUES ($1, $2, 'user', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))`,
        [targetUserId, message.trim()]
      );
    } catch (saveUserMsgErr) {
      console.warn('chat_messages kullanıcı mesajı kayıt uyarısı:', saveUserMsgErr.message);
    }

    // Kilo güncellemesi tespiti
    let currentWeight = parseFloat(u.weight_kg || 75);
    const detectedWeight = parseWeightFromText(message, currentWeight);
    let weightUpdated = false;
    let weightDiff = 0;

    if (detectedWeight && detectedWeight !== currentWeight) {
      weightDiff = Number((detectedWeight - currentWeight).toFixed(1));
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

    // 📏 KULLANICININ VÜCUT ÖLÇÜLERİ ANALİZİ
    const measurementsBlock = `
DANİŞANIN VÜCUT ÖLÇÜLERİ:
- Bel Çevresi: ${u.waist_cm ? `${u.waist_cm} cm` : 'Belirtilmedi'}
- Kol Çevresi: ${u.arm_cm ? `${u.arm_cm} cm` : 'Belirtilmedi'}
- Omuz Çevresi: ${u.shoulder_cm ? `${u.shoulder_cm} cm` : 'Belirtilmedi'}
- Sağ/Sol Bacak: ${u.right_leg_cm ? `${u.right_leg_cm} cm` : 'Belirtilmedi'}
- Göğüs: ${u.chest_cm ? `${u.chest_cm} cm` : 'Belirtilmedi'}
- Kalça: ${u.hip_cm ? `${u.hip_cm} cm` : 'Belirtilmedi'}
${u.waist_cm && u.shoulder_cm ? `- Omuz/Bel Oranı: ${(Number(u.shoulder_cm) / Number(u.waist_cm)).toFixed(2)} (V-Taper Analizi)` : ''}

🎯 ÖLÇÜ BAZLI KOÇLUK KURALI:
Eğer danışanın bel çevresi genişse karbonhidrat zamanlamasına ve insülin hassasiyetine dikkat et. Omuz/kol hacmi hedefliyorsa protein dağılımını ve progressive overload motivasyonunu buna göre kurgula.`;

    // 🎯 HEDEFE DUYARLI KİLO GELİŞİM DEĞERLENDİRMESİ
    let weightContextPrompt = '';
    const userGoal = u.goal || 'maintain';

    if (weightUpdated) {
      const isGainGoal = (userGoal === 'weight_gain' || userGoal === 'muscle_gain');
      const isLossGoal = (userGoal === 'weight_loss' || userGoal === 'fat_loss');

      if (weightDiff < 0 && isGainGoal) {
        weightContextPrompt = `
⚠️ DİKKAT (HEDEFLE TERS DURUM): Kullanıcı az önce kilo kaybettiğini bildirdi (${weightDiff} kg azaldı, yeni kilo: ${currentWeight} kg).
Kullanıcının asıl hedefi KAS KAZANIMI / KİLO ALMAK. 
Bu yüzden KESİNLİKLE "Tebrikler!", "Harika kilo verdin!" gibi kutlama cümleleri KURMA. 
Nazikçe kilonun düştüğünü (${currentWeight} kg), kas kazanmak için kalori fazlasına ve öğünleri aksatmamaya odaklanmamız gerektiğini söyle. Motivasyon ver ve yeni hedefin (${targetCal} kcal) doğrultusunda yemesi gerektiğini hatırlat.`;
      } else if (weightDiff > 0 && isLossGoal) {
        weightContextPrompt = `
⚠️ DİKKAT (HEDEFLE TERS DURUM): Kullanıcı az önce kilo aldığını bildirdi (+${weightDiff} kg arttı, yeni kilo: ${currentWeight} kg).
Kullanıcının asıl hedefi KİLO VERMEK / YAĞ YAKIMI.
Bu yüzden KESİNLİKLE "Tebrikler!", "Harika kilo aldın!" deme.
Bunun ödem, su tutumu veya geçici bir dalgalanma olabileceğini söyleyerek moralini bozmaması gerektiğini, disiplinli kalarak hedefe devam edeceğimizi söyle. Yeni kalori hedefi (${targetCal} kcal) güncellendi de.`;
      } else if ((weightDiff > 0 && isGainGoal) || (weightDiff < 0 && isLossGoal)) {
        weightContextPrompt = `
🎉 BAŞARI (HEDEFE UYGUN İLERLEME): Kullanıcı hedefine uygun bir kilo değişimi bildirdi (${weightDiff > 0 ? `+${weightDiff} kg aldı` : `${Math.abs(weightDiff)} kg verdi`}, yeni kilo: ${currentWeight} kg).
Kullanıcıyı içtenlikle tebrik et, hedefine tam uyum sağladığını söyle ve motivasyonunu artır.`;
      } else {
        weightContextPrompt = `
Kullanıcı yeni kilosunu bildirdi (${currentWeight} kg). Kilosunu başarıyla güncellediğini ve günlük hedeflerini revize ettiğini açıkla.`;
      }
    }

    const systemInstruction = `
Sen Diet-Co uygulamasının profesyonel, samimi, net ve bilimsel temelli yapay zeka fitness/beslenme koçusun.
Danışan: ${displayName}
Cinsiyet: ${u.gender || 'Belirtilmedi'}
Hedef: ${u.goal || 'Sağlıklı Yaşam'} | Günlük Kalori Hedefi: ${targetCal} kcal
Bugün Tüketilen: ${eatenCal} kcal | Güncel Kilo: ${currentWeight} kg
${weightContextPrompt}

${measurementsBlock}
${medicalBlock}

🚨 ÇOK ÖNEMLİ KURALLAR:
1. Kullanıcı kilo aldığını, kilo verdiğini veya tartı sonucunu söylüyorsa bu bir YEMEK DEĞİLDİR. Asla [BESIN_KAYIT] etiketi üretme.
2. Kullanıcının hedefiyle ters düşen bir kilo değişimi varsa KESİNLİKLE TEBRİK ETME. Durumu profesyonel bir koç gibi değerlendir.
3. Yalnızca kullanıcı açıkça bir yiyecek/içecek yediğini/içtiğini belirttiğinde CEVABININ EN SONUNA ŞU ETİKETİ EKLE:
[BESIN_KAYIT: {"food_name": "Öğün Adı", "calories": 250, "protein_g": 15, "carbs_g": 20, "fats_g": 8}]
`;

    let reply = '';
    let loggedItem = null;

    try {
      // Birincil olarak en stabil ve hızlı model denenir
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: message,
        config: { systemInstruction, temperature: 0.6 },
      });

      reply = response.text || '';

      const food = extractFoodLog(reply, message, weightUpdated);
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
      console.error('🚨 [CHAT AI KRITIK HATA DETAYI]:', JSON.stringify(aiErr, Object.getOwnPropertyNames(aiErr)));
      loggedItem = null;

      if (weightUpdated) {
        const isGain = (userGoal === 'weight_gain' || userGoal === 'muscle_gain');
        if (weightDiff < 0 && isGain) {
          reply = `Kilonu ${currentWeight} kg olarak güncelledim ${displayName}. Kas kazanımı hedeflediğimiz için kilonun düşmesini istemeyiz; günlük ${targetCal} kcal hedefini yakalamaya ve proteinini aksatmamaya odaklanalım. 💪`;
        } else {
          reply = `Kilonu ${currentWeight} kg olarak sisteme kaydettim ${displayName}. Günlük kalori bütçeni ${targetCal} kcal olarak revize ettim.`;
        }
      } else {
        reply = `Şu an bağlantıda kısa bir gecikme oldu ${displayName}. Lütfen 10-15 saniye sonra tekrar dene.`;
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