// Premium feature — AI vision analysis of waist-area progress photos.
//
// Calls Gemini 2.5 Flash Lite in multimodal mode with the latest photo (and the
// previous photo when available) plus the user's waist/weight context, and returns
// a 2-3 sentence Turkish comment about the *visual* change.
//
// Hard rules baked into the prompt:
//   - No medical / body-fat / "you lost X kg of fat" claims.
//   - Stays at the level of "görsel değişim algılanıyor" / "fark sınırlı" / etc.
//   - Frames the comment as a signal for the decision engine, not a diagnosis.

const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 18_000;
const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

async function analyzePhoto({ user, latest, previous }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return { source: 'offline', text: null };
  }

  const latestImage = readImage(latest.file_path);
  if (!latestImage) {
    return { source: 'error', text: null, error: 'photo_not_readable' };
  }
  const previousImage = previous ? readImage(previous.file_path) : null;

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = buildPrompt(user, latest, previous);

  const parts = [{ text: prompt }];
  if (previousImage) {
    parts.push({ text: '\n[ÖNCEKİ FOTOĞRAF]' });
    parts.push({ inlineData: { mimeType: previousImage.mime, data: previousImage.b64 } });
  }
  parts.push({ text: '\n[EN SON FOTOĞRAF]' });
  parts.push({ inlineData: { mimeType: latestImage.mime, data: latestImage.b64 } });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 250,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text();
      // Distinguish quota errors (429) so the route can return a 200 with a
      // user-facing message rather than a generic 503.
      if (res.status === 429) {
        console.warn('[photoAnalysis] rate-limited (429)');
        return { source: 'rate_limited', text: null };
      }
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('empty_response');
    return { source: 'gemini', text: text.slice(0, 600) };
  } catch (err) {
    console.warn('[photoAnalysis] failed:', err.message);
    return { source: 'error', text: null, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

function readImage(relPath) {
  try {
    // Defensive: only allow paths under uploads/. We already control file_path on upload
    // but double-check here so a bad row can't read arbitrary files.
    const safe = path.normalize(relPath).replace(/^(\.\.[\\/])+/, '');
    const full = path.join(UPLOADS_ROOT, safe);
    if (!full.startsWith(UPLOADS_ROOT)) return null;
    const buf = fs.readFileSync(full);
    return { b64: buf.toString('base64'), mime: mimeFromPath(full) };
  } catch {
    return null;
  }
}

// Detect mime by file extension. Gemini multimodal accepts PNG/JPEG/WEBP/HEIC/HEIF.
function mimeFromPath(p) {
  const lower = String(p).toLowerCase();
  if (lower.endsWith('.png'))  return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function buildPrompt(user, latest, previous) {
  const latestWaist   = numOrNull(latest?.waist_cm);
  const previousWaist = numOrNull(previous?.waist_cm);
  const startingWaist = numOrNull(user?.starting_waist_cm);

  const measureLine = [];
  if (latestWaist != null)   measureLine.push(`bugünkü bel ${latestWaist} cm`);
  if (previousWaist != null) measureLine.push(`önceki bel ${previousWaist} cm`);
  if (startingWaist != null) measureLine.push(`başlangıç bel ${startingWaist} cm`);
  const measureStr = measureLine.length ? measureLine.join(', ') : 'bel ölçüsü girilmemiş';

  const daysBetween = previous && latest
    ? Math.max(1, daysDiff(latest.photo_date, previous.photo_date))
    : null;

  return [
    'Sen Diet-Co uygulamasının görsel takip yorumlayıcısısın. Bir kullanıcının bel bölgesi fotoğraflarına bakıp Türkçe, 2-3 cümlelik bir GÖRSEL DEĞİŞİM yorumu yapacaksın.',
    '',
    'KESİN KURALLAR:',
    '- "Yağ oranın %X" gibi sayısal beden iddiası ASLA yapma.',
    '- "X kg yağ kaybetmişsin" türü tıbbi/ölçümsel kesinlik YOK.',
    '- "Doktor", "tanı", "teşhis" kelimeleri kullanma.',
    '- Sadece görsel olarak ne fark ettiğini söyle: "bel bölgesi çizgisi daha belirgin", "duruş benzer", "fark sınırlı", "görsel değişim algılanıyor".',
    '- Aşağılayıcı veya yargılayıcı dil yok. Vücut yapısı yorumu yok.',
    '- Sonunda kullanıcıya tek somut yönlendirme: "planı sürdür", "1-2 hafta daha veri topla", "ışık/açı tutarlı tut" gibi.',
    '- Karar motoruna sinyal verir tonda: "bu görsel sinyal kilo ve bel verisiyle birlikte değerlendirilecek".',
    '',
    'KISITLAMA:',
    '- 2-3 cümle, max 60 kelime.',
    '- Türkçe, koç tonu.',
    '- Madde işareti kullanma.',
    '',
    '--- BAĞLAM ---',
    `Hedef: ${user?.goal === 'fat_loss' ? 'yağ kaybı' : user?.goal === 'muscle_gain' ? 'kas kazanımı' : 'recomp'}`,
    `Ölçüler: ${measureStr}`,
    daysBetween ? `Fotolar arası: ~${daysBetween} gün` : 'İlk fotoğraf (önceki yok)',
    previous ? '' : 'NOT: Sadece tek fotoğraf var, karşılaştırma için bir referans olarak başlangıç fotoğrafı sayılır.',
    '',
    previous
      ? 'İki fotoğrafa bak. Önceki ve son fotoğrafı karşılaştır. Görsel değişimi nazikçe yorumla.'
      : 'Tek bir başlangıç fotoğrafına bakıyorsun. Henüz karşılaştırma yapamayacağını söyle ve kullanıcıyı 1-2 hafta sonra tekrar yüklemeye davet et. Görsel hakkında olumsuz/yargılayıcı yorum YAPMA.',
  ].join('\n');
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function daysDiff(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round(Math.abs(da - db) / (1000 * 60 * 60 * 24));
}

module.exports = { analyzePhoto };
