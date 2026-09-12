// Premium feature: Dışarıda Ne Yiyeyim?
//
// Given a venue type (döner, kebap, kahvaltı, market, fast food, ev yemeği) and
// the user's REMAINING macros for the day, returns a single concrete order with
// portion guidance.
//
// Output framing: this is *guidance*, not a precise calorie calculator. We say
// "yaklaşık" everywhere because restaurant portions vary.

const TIMEOUT_MS = 12_000;

const VENUES = {
  doner:       'Dönerci (et döner, tavuk döner, lavaş, dürüm, pilav-tavuk)',
  kebap:       'Kebapçı (adana, urfa, beyti, kuzu şiş, lahmacun, pide, salatalar)',
  ev_yemegi:   'Ev yemeği lokantası (kuru fasulye, tavuklu nohut, izgara köfte, sebze yemeği, mercimek)',
  market:      'Market (hazır ürünler: ton balığı, süzme yoğurt, kıymalı dürüm, salata kase)',
  kahvalti:    'Kahvaltıcı (serpme kahvaltı, peynir, zeytin, omlet, menemen, simit)',
  fast_food:   'Fast food (burger, tavuk wrap, sandviç, McDonald\'s/Burger King benzeri)',
};

const REC_SCHEMA = {
  type: 'object',
  properties: {
    headline:        { type: 'string' }, // 1-line decision
    order_items:     { type: 'array', items: { type: 'string' } },
    estimated_kcal:  { type: 'integer' },
    estimated_protein_g: { type: 'integer' },
    advice:          { type: 'string' },
    avoid:           { type: 'string' },
  },
  required: ['headline', 'order_items', 'estimated_kcal', 'estimated_protein_g', 'advice'],
  propertyOrdering: ['headline', 'order_items', 'estimated_kcal', 'estimated_protein_g', 'advice', 'avoid'],
};

async function recommendEatingOut({ user, venue, remainingCal, remainingProtein }) {
  if (!VENUES[venue]) {
    return { error: 'invalid_venue' };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return { error: 'ai_offline' };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = buildPrompt(user, venue, remainingCal, remainingProtein);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
          responseSchema: REC_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) return { error: 'rate_limited' };
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty_response');
    const parsed = JSON.parse(text);
    return {
      venue,
      headline:            String(parsed.headline).trim().slice(0, 120),
      order_items:         Array.isArray(parsed.order_items)
                              ? parsed.order_items.slice(0, 6).map(String)
                              : [],
      estimated_kcal:      clampInt(parsed.estimated_kcal, 50, 2000),
      estimated_protein_g: clampInt(parsed.estimated_protein_g, 0, 150),
      advice:              String(parsed.advice).trim().slice(0, 220),
      avoid:               parsed.avoid ? String(parsed.avoid).trim().slice(0, 180) : null,
    };
  } catch (err) {
    console.warn('[eatingOut] failed:', err.message);
    return { error: 'ai_error', message: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(user, venueKey, remainingCal, remainingProtein) {
  const venueDesc = VENUES[venueKey];
  const disliked = Array.isArray(user.disliked_foods) && user.disliked_foods.length
    ? user.disliked_foods.join(', ')
    : 'yok';

  return [
    'Sen Diet-Co uygulamasının "Dışarıda Ne Yiyeyim?" motorusun. Kullanıcı şu an dışarıda yemek seçecek; ona TEK bir sipariş önerisi vereceksin.',
    '',
    `MEKAN TÜRÜ: ${venueDesc}`,
    '',
    'KULLANICININ DURUMU:',
    `- Hedef: ${user.goal}`,
    `- Bugünün kalan kalorisi: ~${remainingCal} kcal`,
    `- Bugünün kalan proteini: ~${remainingProtein} g`,
    `- Sevmediği yiyecekler: ${disliked}`,
    '',
    'KURALLAR:',
    '- TEK bir sipariş öner, listeleme yapma. order_items dizisinde sıralı maddeler olarak ver.',
    '- Türkiye gerçekliği: gerçek menü ürünleri kullan (örn. "tavuk döner dürüm — lavaşsız", "ayran küçük boy", "izgara köfte porsiyon").',
    '- Tahmin (yaklaşık) olduğunu belirt — estimated_kcal/protein KESİN değil.',
    '- headline: tek satır, doğrudan karar (örn. "Lavaşsız tavuk döner + ayran al, pilav ekleme").',
    '- advice: 1-2 cümle, neden bu seçim ve nasıl yenir.',
    '- avoid: opsiyonel — neyi yememesi gerektiğini söyle (örn. "pilav, soslu salata, cola").',
    `- Kalori bütçesini (${remainingCal} kcal) aşma. Protein yetersizse (${remainingProtein} g) bir protein kaynağını öne çıkar.`,
    '- Sevmediği yiyecekleri içerme.',
    '',
    'JSON döndür: { headline, order_items: ["..."], estimated_kcal, estimated_protein_g, advice, avoid }',
  ].join('\n');
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

module.exports = { recommendEatingOut, VENUES };
