// Premium feature: Haftalık AI Raporu.
//
// Deterministic metric summary (weight/waist deltas, compliance avg, protein/water
// averages) + a Gemini-generated 2-sentence narrative + one concrete action.
//
// The metrics block is the source of truth — the LLM only narrates it. We do NOT let
// the LLM produce numbers; that prevents hallucinated trends.

const TIMEOUT_MS = 14_000;

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    tone:    { type: 'string', enum: ['positive', 'neutral', 'warning'] },
    body:    { type: 'string' },
    action:  { type: 'string' },
  },
  required: ['tone', 'body', 'action'],
  propertyOrdering: ['tone', 'body', 'action'],
};

async function buildWeeklyReport(user, last7) {
  const metrics = computeMetrics(user, last7);
  const summary = await narrate(user, metrics);
  return {
    week_ending: new Date().toISOString().slice(0, 10),
    metrics,
    summary,
  };
}

function computeMetrics(user, last7) {
  const rows = Array.isArray(last7) ? last7 : [];
  const compliances = rows.map((r) => Number(r.compliance) || 0).filter((v) => v > 0);
  const weights    = rows.map((r) => Number(r.weight_kg)).filter(Boolean);
  const waists     = rows.map((r) => Number(r.waist_cm)).filter(Boolean);
  const proteins   = rows.map((r) => Number(r.protein_eaten) || 0).filter((v) => v > 0);
  const waters     = rows.map((r) => Number(r.water_ml)      || 0).filter((v) => v > 0);

  const avg = (arr) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const delta = (arr) =>
    arr.length >= 2 ? round1(arr[arr.length - 1] - arr[0]) : null;

  return {
    days_logged:        rows.length,
    weight_delta_kg:    delta(weights),
    weight_latest_kg:   weights.length ? round1(weights[weights.length - 1]) : null,
    waist_delta_cm:     delta(waists),
    waist_latest_cm:    waists.length ? round1(waists[waists.length - 1]) : null,
    compliance_avg:     avg(compliances),
    protein_avg_g:      avg(proteins),
    protein_target_g:   Number(user.protein_target) || 0,
    water_avg_ml:       avg(waters),
    goal:               user.goal,
    calorie_target:     Number(user.calorie_target) || 0,
  };
}

async function narrate(user, metrics) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return { ...fallbackNarration(user, metrics), source: 'rule_engine' };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = buildPrompt(user, metrics);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: 350,
          responseMimeType: 'application/json',
          responseSchema: SUMMARY_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty_response');
    const parsed = JSON.parse(text);
    if (!['positive', 'neutral', 'warning'].includes(parsed.tone)) parsed.tone = 'neutral';
    return {
      tone:   parsed.tone,
      body:   String(parsed.body).trim().slice(0, 300),
      action: String(parsed.action).trim().slice(0, 180),
      source: 'gemini',
    };
  } catch (err) {
    console.warn('[weeklyReport] gemini failed:', err.message);
    return { ...fallbackNarration(user, metrics), source: 'rule_engine' };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(user, m) {
  return [
    'Sen Diet-Co uygulamasının haftalık rapor yorumlayıcısısın. Aşağıdaki METRİKLER kesindir — değiştirmeyeceksin, sadece anlatacaksın.',
    '',
    `Kullanıcı: ${user.name || 'kullanıcı'}, hedef: ${user.goal}`,
    'METRİKLER:',
    `- Loglu gün: ${m.days_logged}/7`,
    `- Kilo: ${m.weight_latest_kg != null ? m.weight_latest_kg + ' kg (Δ ' + (m.weight_delta_kg != null ? deltaStr(m.weight_delta_kg) + ' kg' : 'veri yok') + ')' : 'veri yok'}`,
    `- Bel:  ${m.waist_latest_cm != null ? m.waist_latest_cm + ' cm (Δ ' + (m.waist_delta_cm != null ? deltaStr(m.waist_delta_cm) + ' cm' : 'veri yok') + ')' : 'veri yok'}`,
    `- Uyum ortalaması: ${m.compliance_avg != null ? '%' + m.compliance_avg : 'veri yok'}`,
    `- Protein ortalaması: ${m.protein_avg_g != null ? m.protein_avg_g + ' / ' + m.protein_target_g + ' g' : 'veri yok'}`,
    `- Su ortalaması: ${m.water_avg_ml != null ? m.water_avg_ml + ' ml/gün' : 'veri yok'}`,
    `- Mevcut kalori hedefi: ${m.calorie_target} kcal`,
    '',
    'KURALLAR:',
    '- 2 cümlelik body + 1 cümlelik action.',
    '- body: bu haftanın özeti — neyin değiştiği. Sayıları METRİKLER\'den AYNEN kullan, yenisini uydurma.',
    '- action: tek somut adım. Plana sadık kal/değişiklik öner.',
    '- Klişe yasak ("bol su iç", "sabırlı ol", "düzenli ol").',
    '- tone:',
    '    - "positive": hedefe uyumlu ilerleme',
    '    - "warning":  plato, hızlı kayıp, uyum düşüklüğü',
    '    - "neutral":  karma veya veri zayıf',
    '- Türkçe, koç tonu, doğrudan.',
    '',
    'JSON döndür: { "tone", "body", "action" }',
  ].join('\n');
}

function fallbackNarration(user, m) {
  if (!m.days_logged || m.days_logged < 3) {
    return {
      tone: 'neutral',
      body: `Bu hafta ${m.days_logged || 0} gün log girdin. Trend analizi için 5+ gün gerekiyor.`,
      action: 'Önümüzdeki hafta her gün su ve uyum girişini eksiksiz yap.',
    };
  }
  const parts = [];
  if (m.weight_delta_kg != null) parts.push(`Kilo Δ ${deltaStr(m.weight_delta_kg)} kg`);
  if (m.waist_delta_cm  != null) parts.push(`bel Δ ${deltaStr(m.waist_delta_cm)} cm`);
  if (m.compliance_avg  != null) parts.push(`uyum %${m.compliance_avg}`);
  return {
    tone: m.compliance_avg != null && m.compliance_avg >= 80 ? 'positive' : 'neutral',
    body: parts.length ? parts.join(', ') + '.' : 'Veriler kısıtlı.',
    action: 'Mevcut planı sürdür, gelecek hafta yeniden değerlendireceğim.',
  };
}

function deltaStr(n) {
  if (n > 0) return `+${round1(n)}`;
  return String(round1(n));
}
function round1(n) { return Math.round(Number(n) * 10) / 10; }

module.exports = { buildWeeklyReport };
