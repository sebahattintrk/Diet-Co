// Premium feature: Öğün Değiştir / Akıllı Alternatif.
//
// Given the meal a user wants to replace, asks Gemini for 3 Turkish alternatives
// that hit roughly the same macros (±20% calories, similar protein). The user
// picks one, then the route applies it to today's meal_plan snapshot.
//
// We share macro/disliked validation patterns with mealGenerator.js so a single
// retry path is enough; on persistent failure we return null and the route falls
// back to "alternatives not available right now".

const TIMEOUT_MS = 12_000;
const CAL_TOLERANCE = 0.20;          // ±20% on calories per alternative
const ALT_COUNT = 3;

const ALT_SCHEMA = {
  type: 'object',
  properties: {
    alternatives: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          name:        { type: 'string' },
          description: { type: 'string' },
          calories:    { type: 'integer' },
          protein_g:   { type: 'number' },
          carbs_g:     { type: 'number' },
          fats_g:      { type: 'number' },
          tags:        { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'description', 'calories', 'protein_g', 'carbs_g', 'fats_g'],
        propertyOrdering: ['name', 'description', 'calories', 'protein_g', 'carbs_g', 'fats_g', 'tags'],
      },
    },
  },
  required: ['alternatives'],
};

async function suggestSwap({ user, slot, currentMeal, reason }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = buildPrompt(user, slot, currentMeal, reason);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 1100,
          responseMimeType: 'application/json',
          responseSchema: ALT_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) return { source: 'rate_limited', alternatives: [] };
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty_response');
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed?.alternatives) ? parsed.alternatives : null;
    if (!arr || arr.length !== ALT_COUNT) throw new Error('bad_alt_count');

    const normalized = arr.map((a) => normalize(a, slot)).filter(Boolean);

    // Filter out anything that violates dislike list or wildly misses the calorie band.
    const baseCal = Number(currentMeal.calories) || 0;
    const calLow  = baseCal * (1 - CAL_TOLERANCE);
    const calHigh = baseCal * (1 + CAL_TOLERANCE);
    const disliked = Array.isArray(user.disliked_foods) ? user.disliked_foods : [];

    const accepted = normalized.filter((m) => {
      if (baseCal > 0 && (m.calories < calLow || m.calories > calHigh)) return false;
      const hay = `${m.name} ${m.description}`.toLocaleLowerCase('tr-TR');
      for (const d of disliked) {
        const needle = String(d).toLocaleLowerCase('tr-TR').trim();
        if (needle && hay.includes(needle)) return false;
      }
      return true;
    });

    if (accepted.length === 0) return { source: 'no_valid_alternatives', alternatives: [] };
    return { source: 'gemini', alternatives: accepted };
  } catch (err) {
    console.warn('[mealSwap] failed:', err.message);
    return { source: 'error', alternatives: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(user, slot, currentMeal, reason) {
  const slotLabel = {
    breakfast: 'Kahvaltı',
    lunch:     'Öğle yemeği',
    dinner:    'Akşam yemeği',
    snack:     'Ara öğün',
  }[slot] || slot;

  const disliked = Array.isArray(user.disliked_foods) && user.disliked_foods.length
    ? user.disliked_foods.join(', ')
    : 'yok';

  return [
    'Sen Diet-Co uygulamasının "Öğün Değiştir" motorusun. Kullanıcı belirli bir öğünü değiştirmek istiyor; ona TAM 3 alternatif Türk yemeği önereceksin.',
    '',
    `--- DEĞİŞTİRİLECEK ÖĞÜN (${slotLabel}) ---`,
    `Ad: ${currentMeal.name}`,
    `Makrolar: ${currentMeal.calories} kcal, ${Math.round(currentMeal.protein_g || 0)} g protein, ${Math.round(currentMeal.carbs_g || 0)} g karbonhidrat, ${Math.round(currentMeal.fats_g || 0)} g yağ`,
    reason ? `Kullanıcının sebebi: "${reason}"` : '',
    '',
    `--- KULLANICI ---`,
    `Hedef: ${user.goal}, kalori hedefi ${user.calorie_target} kcal/gün, protein hedefi ${user.protein_target} g/gün`,
    `Sevmediği yiyecekler: ${disliked}`,
    user.budget ? `Bütçe: ${user.budget} TL/ay (ekonomik öneriler tercih et)` : '',
    '',
    'KURALLAR:',
    '- TAM 3 alternatif. Hepsi farklı olsun, kopya etme.',
    '- SADECE Türk yemekleri: menemen, mercimek çorbası, dürüm, izgara tavuk, ev köftesi, kuru fasulye, simit, lor, süzme yoğurt, ton balıklı sandviç, ayran, bulgur pilavı, vb.',
    `- Her alternatif yaklaşık ${currentMeal.calories} kcal olmalı (±%20 sınırı: ${Math.round(currentMeal.calories * 0.8)}–${Math.round(currentMeal.calories * 1.2)} kcal).`,
    `- Protein gram olarak orijinal yemeğin (${Math.round(currentMeal.protein_g || 0)} g) ±5g civarında olmalı.`,
    `- Bu ${slotLabel.toLowerCase()} için uygun bir saat dilimi tipi seç (kahvaltıya akşam yemeği önerme).`,
    `- Sevmediği yiyecekleri (${disliked}) malzeme olarak BİLE kullanma.`,
    '- name: 4-7 kelime Türkçe (örn. "Tavuklu Bulgur Pilavı + Cacık").',
    '- description: 1 cümle, malzemeler cümle içinde geçsin.',
    '- tags: 1-3 etiket (ör. "ekonomik", "pratik", "yüksek-protein").',
    '',
    'JSON döndür: { "alternatives": [ { name, description, calories, protein_g, carbs_g, fats_g, tags }, ... 3 tane ] }',
  ].filter(Boolean).join('\n');
}

function normalize(m, slot) {
  if (!m || !m.name) return null;
  return {
    slot,
    category: slot,
    name: String(m.name).trim().slice(0, 80),
    description: String(m.description || '').trim().slice(0, 240),
    calories: clampInt(m.calories, 80, 1500),
    protein_g: clampNum(m.protein_g, 0, 120),
    carbs_g:   clampNum(m.carbs_g,   0, 200),
    fats_g:    clampNum(m.fats_g,    0, 90),
    tags: Array.isArray(m.tags) ? m.tags.slice(0, 3).map(String) : [],
  };
}
function clampInt(v, lo, hi) {
  const n = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}
function clampNum(v, lo, hi) {
  const n = Math.round((Number(v) || 0) * 10) / 10;
  return Math.max(lo, Math.min(hi, n));
}

module.exports = { suggestSwap };
