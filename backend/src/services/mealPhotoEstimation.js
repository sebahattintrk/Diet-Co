// Premium feature: Fotoğraflı Öğün Tahmini.
//
// Multimodal Gemini call: takes a meal photo and returns approximate macros.
// Critical product framing: NOT a precise calorie counter. All numbers are estimates
// and the prompt explicitly says so — the UI must show the "TAHMİNİ" badge.

const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 16_000;
const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

const ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    label:       { type: 'string' },
    calories:    { type: 'integer' },
    protein_g:   { type: 'number' },
    carbs_g:     { type: 'number' },
    fats_g:      { type: 'number' },
    confidence:  { type: 'string', enum: ['low', 'medium', 'high'] },
    notes:       { type: 'string' },
  },
  required: ['label', 'calories', 'protein_g', 'carbs_g', 'fats_g', 'confidence', 'notes'],
  propertyOrdering: ['label', 'calories', 'protein_g', 'carbs_g', 'fats_g', 'confidence', 'notes'],
};

async function estimateMealFromPhoto({ filePath }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return { source: 'offline', estimate: null };
  }

  const img = readImage(filePath);
  if (!img) return { source: 'error', estimate: null, error: 'photo_not_readable' };

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = buildPrompt();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: img.mime, data: img.b64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 350,
          responseMimeType: 'application/json',
          responseSchema: ESTIMATE_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) return { source: 'rate_limited', estimate: null };
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty_response');
    const parsed = JSON.parse(text);

    return {
      source: 'gemini',
      estimate: {
        label:       String(parsed.label).trim().slice(0, 80),
        calories:    clampInt(parsed.calories, 0, 3000),
        protein_g:   clampNum(parsed.protein_g, 0, 200),
        carbs_g:     clampNum(parsed.carbs_g, 0, 300),
        fats_g:      clampNum(parsed.fats_g, 0, 150),
        confidence:  ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium',
        notes:       String(parsed.notes || '').trim().slice(0, 300),
      },
    };
  } catch (err) {
    console.warn('[mealPhotoEstimation] failed:', err.message);
    return { source: 'error', estimate: null, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt() {
  return [
    'Sen Diet-Co uygulamasının fotoğraflı öğün tahmini motorusun. Sana bir yemek fotoğrafı verildi. Görseldeki yemeği tanımla ve TAHMİNİ makro değerlerini ver.',
    '',
    'KESİN KURALLAR:',
    '- Bu KESİN değil, TAHMİNİ. notes alanında belirsizlik kaynaklarını söyle (örn. "porsiyon büyüklüğü göründüğü kadar varsayıldı", "sos görünmüyor, içermeyebilir").',
    '- Sadece görseldekini değerlendir. Spekülatif malzeme ekleme.',
    '- confidence değerini dürüstçe ata:',
    '    - "high": net porsiyon, tanıdık yemek (örn. tek menemen tabağı)',
    '    - "medium": yemek tanınıyor ama porsiyon belirsiz',
    '    - "low": birden fazla yemek, kapalı tabak, yarısı görünmüyor',
    '- label: Türkçe yemek adı + porsiyon ipucu (örn. "Tavuk dürüm — orta boy", "Menemen — 2 yumurta").',
    '- calories tam sayı; protein/karb/yağ 1 ondalık.',
    '- notes: 1-2 cümle, neyin belirsiz olduğunu söyle, kullanıcıyı kendi tartısıyla doğrulamaya teşvik et.',
    '- Yargılayıcı/diyet shaming dili YASAK ("çok yağlı, yememelisin" YASAK).',
    '',
    'JSON: { label, calories, protein_g, carbs_g, fats_g, confidence, notes }',
  ].join('\n');
}

function readImage(relPath) {
  try {
    const safe = path.normalize(relPath).replace(/^(\.\.[\\/])+/, '');
    const full = path.join(UPLOADS_ROOT, safe);
    if (!full.startsWith(UPLOADS_ROOT)) return null;
    const buf = fs.readFileSync(full);
    return { b64: buf.toString('base64'), mime: mimeFromPath(full) };
  } catch {
    return null;
  }
}

// Gemini multimodal accepts PNG/JPEG/WEBP/HEIC/HEIF — match the actual file extension
// so iPhone HEIC uploads get the correct mime tag.
function mimeFromPath(p) {
  const lower = String(p).toLowerCase();
  if (lower.endsWith('.png'))  return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}
function clampNum(v, lo, hi) {
  const n = Math.round((Number(v) || 0) * 10) / 10;
  return Math.max(lo, Math.min(hi, n));
}

module.exports = { estimateMealFromPhoto };
