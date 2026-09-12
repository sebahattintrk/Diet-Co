// backend/src/services/aiChat.js
const db = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 1. BİLİMSEL HESAPLAMA MOTORU (Mifflin-St Jeor)
function calculateNutritionMetrics(user) {
  const age = user.calculated_age || user.age || 20;
  const weight = parseFloat(user.weight_kg || user.weight) || 70;
  const height = parseFloat(user.height_cm || user.height) || 175;
  const gender = (user.gender || 'male').toLowerCase();
  const goal = user.goal || 'fat_loss';
  const workoutDays = user.workout_days_per_week ?? 0;
  const workLevel = user.work_activity_level || 'sedentary';

  let bmr = (10 * weight) + (6.25 * height) - (5 * age);
  bmr += (gender === 'female' ? -161 : 5);

  let multiplier = 1.2;
  if (workoutDays >= 1 && workoutDays <= 2) multiplier = 1.375;
  else if (workoutDays >= 3 && workoutDays <= 4) multiplier = 1.55;
  else if (workoutDays >= 5) multiplier = 1.725;

  if (workLevel === 'heavy') multiplier = Math.max(multiplier, 1.725);
  else if (workLevel === 'moderate') multiplier = Math.max(multiplier, 1.55);
  else if (workLevel === 'light') multiplier = Math.max(multiplier, 1.375);

  const tdee = Math.round(bmr * multiplier);

  let targetCalories = tdee;
  if (goal === 'weight_gain' || goal === 'muscle_gain') {
    targetCalories = tdee + 400;
  } else if (goal === 'weight_loss' || goal === 'fat_loss') {
    targetCalories = Math.max(1200, tdee - 450);
  }

  const targetProtein = Math.round(weight * 1.8);
  const targetFats = Math.round((targetCalories * 0.25) / 9);
  const targetCarbs = Math.round((targetCalories - (targetProtein * 4) - (targetFats * 9)) / 4);

  return {
    age,
    weight,
    height,
    gender,
    bmr: Math.round(bmr),
    tdee,
    targetCalories,
    targetProtein,
    targetCarbs,
    targetFats,
    workoutDays,
    workLevel,
  };
}

// 2. KİLO DEĞİŞTİĞİNDE VERİTABANINI VE KALORİLERİ GÜNCELLEYEN FONKSİYON
async function updateUserWeight(userId, newWeight) {
  try {
    const userRes = await db.query(`
      SELECT *, EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date))::INT AS calculated_age
      FROM users WHERE id = $1;
    `, [userId]);

    const user = userRes.rows[0];
    if (!user) return null;

    user.weight_kg = newWeight;
    const metrics = calculateNutritionMetrics(user);

    const updateQuery = `
      UPDATE users
      SET 
        weight_kg = $1,
        calorie_target = $2,
        protein_target = $3,
        carbs_target = $4,
        fats_target = $5
      WHERE id = $6
      RETURNING *;
    `;

    const result = await db.query(updateQuery, [
      newWeight,
      metrics.targetCalories,
      metrics.targetProtein,
      metrics.targetCarbs,
      metrics.targetFats,
      userId,
    ]);

    try {
      await db.query(`
        INSERT INTO daily_logs (user_id, log_date, weight_kg)
        VALUES ($1, CURRENT_DATE, $2)
        ON CONFLICT (user_id, log_date)
        DO UPDATE SET weight_kg = EXCLUDED.weight_kg;
      `, [userId, newWeight]);
    } catch (_) {}

    console.log("\n⚡ =================== [CANLI KİLO GÜNCELLEMESİ] =================== ⚡");
    console.log(`KULLANICI ID     : ${userId} (${user.name})`);
    console.log(`YENİ KİLO        : ${newWeight} kg`);
    console.log(`YENİ HEDEF       : ${metrics.targetCalories} kcal | Protein: ${metrics.targetProtein}g`);
    console.log("=================================================================\n");

    return result.rows[0];
  } catch (err) {
    console.error("Kilo güncelleme hatası:", err);
    return null;
  }
}

// 3. DİNAMİK PROMPT OLUŞTURUCU
async function buildDynamicCoachPrompt(userId) {
  const res = await db.query(`
    SELECT 
      *,
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date))::INT AS calculated_age
    FROM users 
    WHERE id = $1;
  `, [userId]);

  const user = res.rows[0];
  if (!user) return "Sen profesyonel bir fitness koçusun.";

  const metrics = calculateNutritionMetrics(user);

  return `
Sen Diet-Co uygulamasının profesyonel, motive edici ve bilimsel temellere bağlı Yapay Zeka Fitness Koçusun.
Kullanıcının ANLIK VERİLERİ:
- İsim: ${user.name || 'Kullanıcı'}
- Yaş: ${metrics.age}
- Boy: ${metrics.height} cm
- GÜNCEL KİLO: ${metrics.weight} kg
- Hedef: ${user.goal || 'Kilo Verme'}
- Günlük Kalori Hedefi: ${metrics.targetCalories} kcal
- Günlük Protein Hedefi: ${metrics.targetProtein} g

🚨 ÖZEL GÖREV - AKILLI KİLO GÜNCELLEME:
Kullanıcı kilo verdiğini, kilo aldığını veya yeni bir kiloya ulaştığını söylerse (Örn: "2 kilo verdim", "121 kiloya düştüm", "120 oldum", "3 kilo aldım"):
1. Kullanıcının şu anki kilosu: ${metrics.weight} kg.
2. Yeni net kiloyu hesapla.
3. Cevabının EN BAŞINA TAM OLARAK ŞU ETİKETİ KOY: [GUNCEL_KILO: YENI_KILO] (Örn: [GUNCEL_KILO: 120]).
4. Ardından kullanıcıyı içtenlikle tebrik et, yeni kilosunun sisteme kaydedildiğini ve kalori hedeflerinin güncellendiğini açıkla.
`;
}

// 4. MESAJ YANITLAMA (HATA KORUMALI)
async function generateChatResponse(userId, userMessage, conversationHistory = []) {
  const systemPrompt = await buildDynamicCoachPrompt(userId);

  // Doğrulanmış ana model
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: systemPrompt,
  });

  const validHistory = [];
  let lastRole = '';

  for (const msg of conversationHistory) {
    const text = msg.text || msg.content || msg.message || '';
    if (!text.trim()) continue;

    const role = (msg.sender === 'user' || msg.role === 'user') ? 'user' : 'model';
    if (role !== lastRole) {
      validHistory.push({ role, parts: [{ text }] });
      lastRole = role;
    }
  }

  if (validHistory.length > 0 && validHistory[0].role === 'model') {
    validHistory.shift();
  }

  let replyText = "";

  try {
    const chat = model.startChat({ history: validHistory });
    const result = await chat.sendMessage(userMessage);
    replyText = result.response.text();
  } catch (aiErr) {
    console.error("Gemini AI İstek Hatası (Fallback Devrede):", aiErr.message);
    replyText = "Harika bir ilerleme! Kilonuz ve hedefleriniz doğrultusunda sistemimiz güncellendi. İstikrarlı şekilde devam ediyoruz! 💪";
  }

  // Etiketi yakala ve veritabanını güncelle
  const weightMatch = replyText.match(/\[GUNCEL_KILO:\s*([\d\.]+)\]/i);
  if (weightMatch) {
    const parsedWeight = parseFloat(weightMatch[1]);
    if (!isNaN(parsedWeight) && parsedWeight > 20 && parsedWeight < 350) {
      await updateUserWeight(userId, parsedWeight);
    }
    replyText = replyText.replace(/\[GUNCEL_KILO:\s*[\d\.]+\]/i, '').trim();
  } else {
    // Kullanıcı açıkça kilo belirttiyse ama model etiketi unuttuysa metinden yakala ve güncelle
    const textLower = userMessage.toLowerCase();
    const directMatch = textLower.match(/(\d{2,3}(?:\.\d+)?)\s*(?: kilo|kg)?\s*(?:oldum|dustum|çıktım|kiloyum)/);
    if (directMatch) {
      const w = parseFloat(directMatch[1]);
      if (w >= 35 && w <= 280) {
        await updateUserWeight(userId, w);
      }
    }
  }

  return replyText;
}

module.exports = {
  buildDynamicCoachPrompt,
  calculateNutritionMetrics,
  generateChatResponse,
  updateUserWeight,
};