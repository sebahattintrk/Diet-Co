// backend/src/services/mealGenerator.js
const { generateMedicalConstraints, HEALTH_RESTRICTIONS } = require('./healthFilter');

const GOAL_TR = {
  fat_loss: 'yağ kaybı',
  muscle_gain: 'kas kazanımı',
  recomp: 'vücut yenileme',
};
const ACTIVITY_TR = {
  sedentary: 'hareketsiz',
  light: 'hafif aktif',
  moderate: 'orta aktif',
  active: 'aktif',
  very_active: 'çok aktif',
};

// Süre 35 saniyeye çıkarıldı (Gemini yanıtı kesilmesin)
const TIMEOUT_MS = 35_000;
const SLOT_SHARE = { breakfast: 0.25, lunch: 0.32, dinner: 0.33, snack: 0.10 };

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          slot:           { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          name:           { type: 'string' },
          description:    { type: 'string' },
          calories:       { type: 'integer' },
          protein_g:      { type: 'number' },
          carbs_g:        { type: 'number' },
          fats_g:         { type: 'number' },
          serving_size_g: { type: 'integer' },
          prep_time_min:  { type: 'integer' },
          ingredients:    { type: 'array', items: { type: 'string' } },
          rationale:      { type: 'string' },
          tags:           { type: 'array', items: { type: 'string' } },
        },
        required: ['slot', 'name', 'description', 'calories', 'protein_g', 'carbs_g', 'fats_g',
                   'serving_size_g', 'prep_time_min', 'ingredients', 'rationale'],
      },
    },
  },
  required: ['meals'],
};

// 🛡️ KULLANICI ASLA BOŞ EKRAN GÖRMESİN DİYE AKILLI YEDEK ÖĞÜNLER
function generateFallbackMeals(user) {
  const targetKcal = user.calorie_target || 2500;
  const targetProt = user.protein_target || 130;

  return [
    {
      slot: 'breakfast',
      category: 'breakfast',
      name: 'Yulaflı ve Peynirli Sporcu Kahvaltısı',
      description: 'Güne yüksek enerji ve dengeli protein ile başlaman için tam kıvamında omlet ve zeytin tabağı.',
      calories: Math.round(targetKcal * 0.25),
      protein_g: Math.round(targetProt * 0.25),
      carbs_g: Math.round((targetKcal * 0.25 * 0.5) / 4),
      fats_g: Math.round((targetKcal * 0.25 * 0.25) / 9),
      serving_size_g: 350,
      prep_time_min: 15,
      ingredients: ['3 adet yumurta', '60g lor peyniri', '50g yulaf ezmesi', '5 adet zeytin', 'Domates, salatalık'],
      rationale: 'Hedeflenen kas kazanımı ve tokluk hissi için zengin proteinli başlangıç.',
      tags: ['Kahvaltı', 'Yüksek Protein', 'Enerji'],
    },
    {
      slot: 'lunch',
      category: 'lunch',
      name: 'Izgara Tavuklu Basmati Pilav ve Mevsim Salata',
      description: 'Temiz karbonhidrat ve sindirimi kolay yağsız tavuk göğsü kombinasyonu.',
      calories: Math.round(targetKcal * 0.35),
      protein_g: Math.round(targetProt * 0.35),
      carbs_g: Math.round((targetKcal * 0.35 * 0.5) / 4),
      fats_g: Math.round((targetKcal * 0.35 * 0.2) / 9),
      serving_size_g: 450,
      prep_time_min: 25,
      ingredients: ['180g tavuk göğsü', '1 su bardağı pişmiş basmati pirinç', '1 tatlı kaşığı zeytinyağı', 'Akdeniz yeşillikleri'],
      rationale: 'Gün ortasında glikojen depolarını tazelemek ve kas onarımını desteklemek için.',
      tags: ['Öğle Yemeği', 'Dengeli', 'Fit'],
    },
    {
      slot: 'dinner',
      category: 'dinner',
      name: 'Fırında Sebzeli Somon / Köfte ve Fırın Patates',
      description: 'Hafif ama besleyici, akşam saatlerinde sindirimi yormayan zengin tabak.',
      calories: Math.round(targetKcal * 0.30),
      protein_g: Math.round(targetProt * 0.30),
      carbs_g: Math.round((targetKcal * 0.30 * 0.4) / 4),
      fats_g: Math.round((targetKcal * 0.30 * 0.3) / 9),
      serving_size_g: 400,
      prep_time_min: 30,
      ingredients: ['160g somon veya yağsız köfte', '1 adet orta boy fırınlanmış patates', 'Kuşkonmaz / Kabak', '1 kase yoğurt'],
      rationale: 'Gece boyunca protein sentezini sürdürecek sağlıklı yağ ve mineral desteği.',
      tags: ['Akşam Yemeği', 'Omega 3', 'Glutensiz'],
    },
    {
      slot: 'snack',
      category: 'snack',
      name: 'Muzlu ve Fıstık Ezmeli Yoğurt Kasesi',
      description: 'Hızlıca hazırlanan, tatlı ihtiyacını temiz makrolarla karşılayan ara öğün.',
      calories: Math.round(targetKcal * 0.10),
      protein_g: Math.round(targetProt * 0.10),
      carbs_g: Math.round((targetKcal * 0.10 * 0.6) / 4),
      fats_g: Math.round((targetKcal * 0.10 * 0.25) / 9),
      serving_size_g: 220,
      prep_time_min: 5,
      ingredients: ['150g süzme yoğurt', '1 adet yerli muz', '1 tatlı kaşığı şekersiz fıstık ezmesi', '1 tutam tarçın'],
      rationale: 'Kan şekerini dengede tutarak antrenman öncesi veya sonrası metabolizmayı canlı tutar.',
      tags: ['Ara Öğün', 'Pratik', 'Tatlı Krizine'],
    },
  ];
}

async function generateMeals({ user, excludeNames = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn('[mealGenerator] API Key bulunamadı, güvenli fallback üretiliyor.');
    return generateFallbackMeals(user);
  }

  try {
    let result = await tryOnce({ user, excludeNames, feedback: null });
    if (result.ok && result.meals && result.meals.length === 4) {
      return result.meals;
    }

    console.warn('[mealGenerator] 1. deneme başarısız:', result.reason, '→ 2. deneme yapılıyor...');
    result = await tryOnce({ user, excludeNames, feedback: 'Lütfen TAM OLARAK 4 adet Türk öğünü içeren geçerli JSON üret.' });
    if (result.ok && result.meals && result.meals.length === 4) {
      return result.meals;
    }
  } catch (e) {
    console.error('[mealGenerator Hatası]:', e.message);
  }

  // Gemini başarısız olsa dahi kullanıcı ekranda asla boş sayfa görmez!
  console.log('[mealGenerator] Akıllı Fallback planı devreye girdi.');
  return generateFallbackMeals(user);
}

async function tryOnce({ user, excludeNames, feedback }) {
  let meals;
  try {
    meals = await callGemini({ user, excludeNames, feedback });
  } catch (err) {
    return { ok: false, reason: `api_error: ${err.message}` };
  }
  if (!meals || meals.length !== 4) {
    return { ok: false, reason: 'bad_meal_count' };
  }

  return { ok: true, meals };
}

async function callGemini({ user, excludeNames, feedback }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = buildPrompt(user, excludeNames, feedback);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: MEAL_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 150)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty_response');

    let cleanText = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const parsed = JSON.parse(cleanText);
    const arr = Array.isArray(parsed?.meals) ? parsed.meals : null;
    if (!arr) return null;
    return arr.map((m) => normalizeMeal(m)).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(user, excludeNames, feedback) {
  const goal     = GOAL_TR[user.goal] || user.goal;
  const activity = ACTIVITY_TR[user.activity_level] || user.activity_level;
  const dislikedList = Array.isArray(user.disliked_foods) ? user.disliked_foods.filter(Boolean) : [];
  const budget = user.budget ? `${user.budget} TL aylık` : 'belirtilmemiş';

  const medicalBlock = generateMedicalConstraints(user.health_conditions);
  const excludeBlock = excludeNames.length
    ? `\nSON ZAMANLARDA ÖNERİLEN (TEKRAR ETME):\n${excludeNames.map((n) => `- ${n}`).join('\n')}`
    : '';

  const dislikedRules = dislikedList.length
    ? `\nSEVMEDİĞİ YİYECEKLER (KESİNLİKLE KULLANMA):\n${dislikedList.map((d) => `- ${d}`).join('\n')}`
    : '';

  return [
    'Sen Diet-Co uygulamasının uzman Türk beslenme koçusun.',
    'Kullanıcı için 4 öğünlük (breakfast, lunch, dinner, snack) tam 1 günlük beslenme planı oluştur.',
    '',
    medicalBlock,
    dislikedRules,
    excludeBlock,
    '',
    `KULLANICI BİLGİLERİ:`,
    `- Günlük Kalori Hedefi: ~${user.calorie_target || 2500} kcal`,
    `- Protein Hedefi: ~${user.protein_target || 130} g`,
    `- Karbonhidrat Hedefi: ~${user.carbs_target || 300} g`,
    `- Yağ Hedefi: ~${user.fats_target || 65} g`,
    `- Hedef: ${goal}`,
    `- Bütçe: ${budget}`,
    '',
    'KURALLAR:',
    '1. Her slot için (breakfast, lunch, dinner, snack) TAM BİRER adet öğün üret.',
    '2. Yemek isimleri iştah açıcı ve Türk damak tadına uygun olsun.',
    '3. ingredients alanında 4-8 maddelik gerçekçi malzeme listesi ver.',
    '4. rationale alanında bu öğünün neden bu kullanıcıya uygun olduğunu 1 cümleyle açıkla.',
  ].join('\n');
}

function normalizeMeal(m) {
  if (!m || !m.slot || !m.name) return null;
  const slot = String(m.slot).toLowerCase();
  if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(slot)) return null;

  return {
    slot,
    category: slot,
    name: String(m.name).trim().slice(0, 90),
    description: String(m.description || '').trim().slice(0, 280),
    calories: Math.round(Number(m.calories) || 400),
    protein_g: Math.round(Number(m.protein_g) || 20),
    carbs_g:   Math.round(Number(m.carbs_g) || 40),
    fats_g:    Math.round(Number(m.fats_g) || 12),
    serving_size_g: Math.round(Number(m.serving_size_g) || 300),
    prep_time_min:  Math.round(Number(m.prep_time_min) || 20),
    ingredients: Array.isArray(m.ingredients) ? m.ingredients.map((x) => String(x).trim()).filter(Boolean) : [],
    rationale: String(m.rationale || '').trim().slice(0, 220),
    tags: Array.isArray(m.tags) ? m.tags.slice(0, 4).map(String) : ['Dengeli'],
  };
}

module.exports = { generateMeals };