// AI Insight service — generates a daily decision card for the user.
//
// Output schema (decision card format):
//   {
//     tone:      'positive' | 'neutral' | 'warning',
//     situation: short headline — what's happening ("Protein hedefin %63'ünde")
//     reason:    why it's happening ("Son 3 öğünden 2'sini tamamladın ama akşamı atladın")
//     action:    one concrete thing to do today ("Bu akşam tavuk + yoğurtla 40 g daha protein al")
//   }
//
// Primary path: Gemini 2.5 Flash Lite with responseSchema enforcement.
// Fallback: deterministic rule engine — also returns the new {situation/reason/action} shape.

const GOAL_TR = {
  fat_loss: 'yağ kaybı',
  muscle_gain: 'kas kazanımı',
  recomp: 'vücut yenileme (recomp)',
};
const ACTIVITY_TR = {
  sedentary: 'hareketsiz',
  light: 'hafif aktif',
  moderate: 'orta aktif',
  active: 'aktif',
  very_active: 'çok aktif',
};

const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    tone:      { type: 'string', enum: ['positive', 'neutral', 'warning'] },
    situation: { type: 'string' },
    reason:    { type: 'string' },
    action:    { type: 'string' },
  },
  required: ['tone', 'situation', 'reason', 'action'],
  propertyOrdering: ['tone', 'situation', 'reason', 'action'],
};

async function buildInsight(user, last7, today) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim().length > 0) {
    try {
      const ai = await callGemini(apiKey, user, last7, today);
      if (ai) return { ...ai, source: 'gemini' };
    } catch (err) {
      console.warn('[aiInsight] gemini failed, falling back:', err.message);
    }
  }
  return { ...deterministicInsight(user, last7, today), source: 'rule_engine' };
}

async function callGemini(apiKey, user, last7, today) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = buildPrompt(user, last7, today);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
          responseSchema: INSIGHT_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty_response');

    const parsed = JSON.parse(text);
    if (!parsed.situation || !parsed.reason || !parsed.action) throw new Error('schema_mismatch');
    if (!['positive', 'neutral', 'warning'].includes(parsed.tone)) parsed.tone = 'neutral';
    return {
      tone:      parsed.tone,
      situation: String(parsed.situation).trim().slice(0, 90),
      reason:    String(parsed.reason).trim().slice(0, 180),
      action:    String(parsed.action).trim().slice(0, 180),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(user, last7, today) {
  const goal     = GOAL_TR[user.goal] || user.goal;
  const activity = ACTIVITY_TR[user.activity_level] || user.activity_level;

  const trendLines = (last7 || []).map((r) => {
    const parts = [];
    if (r.weight_kg != null) parts.push(`kilo ${Number(r.weight_kg).toFixed(1)} kg`);
    if (r.waist_cm  != null) parts.push(`bel ${Number(r.waist_cm).toFixed(1)} cm`);
    if (r.calories_eaten)    parts.push(`${r.calories_eaten} kcal yendi`);
    if (r.protein_eaten)     parts.push(`${r.protein_eaten} g protein`);
    if (r.water_ml)          parts.push(`${r.water_ml} ml su`);
    if (r.compliance != null) parts.push(`uyum %${r.compliance}`);
    return `- ${r.log_date}: ${parts.join(', ') || 'log boş'}`;
  }).join('\n');

  const todayBlock = today
    ? `\n\nBUGÜN ŞU AN:\n- ${today.calories_eaten || 0} / ${user.calorie_target} kcal\n- ${Math.round(today.protein_eaten || 0)} / ${user.protein_target} g protein\n- ${today.water_ml || 0} ml su\n- Uyum: ${today.compliance != null ? '%' + today.compliance : 'henüz girilmedi'}`
    : '';

  return [
    'Sen Diet-Co uygulamasının karar motoru AI\'sın. Kullanıcıya BUGÜN için tek bir KARAR KARTI üreteceksin.',
    '',
    'KART FORMATI (3 alan):',
    '1. situation: TEK satır, kısa headline. Şu an ne durumdayız? (örn: "Protein hedefinin %63\'ündesin")',
    '2. reason:    1-2 cümle. NEDEN böyle? Veriye dayalı somut açıklama (örn: "Son 3 günde ortalama protein alımın 110g ve akşam öğünleri tamamlanmıyor")',
    '3. action:    1 cümle. BUGÜN NE YAP? Tek somut adım — sayı ya da spesifik yiyecek içerebilir (örn: "Bu akşam tavuk + yoğurtla 40 g daha protein al")',
    '',
    'KURALLAR:',
    '- Türkçe, koç tonu, doğrudan. "Hocam" demeden ama sıcak: "Şöyle yapalım", "Bunu deneyelim".',
    '- Klişe önerme: "bol su iç", "düzenli ol" tarzı genel cümleler YASAK.',
    '- Veriye yapışık ol. Sayı ver. "%63", "40 g", "3 gün" gibi spesifik referanslar kullan.',
    '- Tek bir aksiyon ver, listeleme yapma.',
    '- Tıbbi tavsiye verme, doktor gibi konuşma.',
    '- Kilo ve bel verisini BİRLİKTE oku:',
    '    - Kilo sabit + bel düşüyor → recomp sinyali ("Kaloriyi düşürme, sürdür")',
    '    - Kilo düşüyor + bel aynı → "Su veya kas kaybı olabilir, 3 gün daha veri topla, protein artır"',
    '    - İkisi de duruyor → klasik plato (adım/su öner, kalori sonra)',
    '    - Çok hızlı kilo kaybı (>1.5 kg/hafta) → "Kaloriyi yükselt, hız değil süreklilik"',
    '- tone seçimi:',
    '    - "positive": kullanıcı hedefte ilerliyor, momentum var',
    '    - "warning":  plato/duraklama, ciddi sapma, geride kalma',
    '    - "neutral":  veri yetersiz veya karma sinyal',
    '',
    '--- KULLANICI ---',
    `İsim: ${user.name || 'Kullanıcı'}`,
    `Yaş/Cinsiyet: ${user.age}, ${user.gender}`,
    `Kilo/Boy: ${user.weight_kg} kg / ${user.height_cm} cm`,
    `Aktivite: ${activity}`,
    `Hedef: ${goal}`,
    `TDEE: ${user.tdee} kcal · Hedef Kalori: ${user.calorie_target} kcal · Protein Hedefi: ${user.protein_target} g`,
    todayBlock,
    '',
    `--- SON 7 GÜN (${(last7 || []).length} kayıt) ---`,
    trendLines || '- henüz log yok',
    '',
    'JSON döndür: { "tone", "situation", "reason", "action" }',
  ].join('\n');
}

// ---------- deterministic fallback ----------
function deterministicInsight(user, last7, today) {
  // No data yet
  if (!last7 || last7.length < 2) {
    return {
      tone: 'neutral',
      situation: 'Veri toplamaya devam et',
      reason: 'Henüz analiz için yeterli günlük log yok — son 7 günde 2\'den az kayıt var.',
      action: 'Bu akşam tartına çık, su tüketimini ve uyumunu Takip ekranından gir.',
    };
  }

  const compliances = last7.map((r) => Number(r.compliance) || 0);
  const avgCompliance = Math.round(compliances.reduce((a, b) => a + b, 0) / compliances.length);

  const weights = last7.map((r) => Number(r.weight_kg)).filter(Boolean);
  const weightDelta = weights.length >= 2 ? weights[weights.length - 1] - weights[0] : 0;

  const waists = last7.map((r) => Number(r.waist_cm)).filter(Boolean);
  const waistDelta = waists.length >= 2 ? waists[waists.length - 1] - waists[0] : 0;

  const waters = last7.map((r) => Number(r.water_ml) || 0);
  const avgWater = Math.round(waters.reduce((a, b) => a + b, 0) / waters.length);

  // Rule 1: low compliance comes first — fix the foundation before tweaking anything.
  if (avgCompliance > 0 && avgCompliance < 70) {
    return {
      tone: 'warning',
      situation: `7 günlük uyum skorun %${avgCompliance}`,
      reason: 'Plana uyum %70 altında — kalori veya plan ayarı değiştirmeden önce mevcut planı 5 gün uygula.',
      action: 'Yarın sadece öğünleri zamanında işaretle ve su hedefini tut. Kalori değiştirme.',
    };
  }

  // Rule 2: water deficit
  if (avgWater > 0 && avgWater < 2000) {
    return {
      tone: 'warning',
      situation: `Su ortalaman ${avgWater} ml/gün`,
      reason: 'Son 7 günde su alımın 2 L\'nin altında. Düşük su = yüksek açlık sinyali + düşük performans.',
      action: 'Yarın için hedefin 2.5 L — sabah uyanır uyanmaz 500 ml içmekle başla.',
    };
  }

  // Rule 3: protein deficit today
  if (today && user.protein_target > 0) {
    const proteinRatio = (today.protein_eaten || 0) / user.protein_target;
    if (proteinRatio < 0.65) {
      const gap = Math.round(user.protein_target - (today.protein_eaten || 0));
      return {
        tone: 'warning',
        situation: `Protein hedefinin %${Math.round(proteinRatio * 100)}'ündesin`,
        reason: `Bugün ${Math.round(today.protein_eaten || 0)} / ${user.protein_target} g protein aldın. Akşam öğününü atlama.`,
        action: `Bu akşam tavuk + süzme yoğurtla yaklaşık ${gap} g protein tamamla.`,
      };
    }
  }

  // Rule 4a: recomp signal — weight is flat but waist is shrinking. Common for newer
  // users with overlapping fat loss + muscle gain; the worst move here is to cut calories.
  if (
    user.goal === 'fat_loss' &&
    weights.length >= 4 &&
    waists.length >= 4 &&
    Math.abs(weightDelta) < 0.4 &&
    waistDelta <= -0.7
  ) {
    return {
      tone: 'positive',
      situation: 'Recomp sinyali — kilo sabit, bel ölçün düşüyor',
      reason: `Son ${weights.length} log'da kilon ${weights[0].toFixed(1)}→${weights[weights.length - 1].toFixed(1)} kg (sabit) ama bel ${waists[0].toFixed(1)}→${waists[waists.length - 1].toFixed(1)} cm (${Math.abs(waistDelta).toFixed(1)} cm aşağı). Yağ gidip kas geldi.`,
      action: 'Kaloriyi düşürme. Mevcut planı 7 gün daha sürdür, sonra tekrar değerlendir.',
    };
  }

  // Rule 4b: weight dropping but waist isn't — possible water loss / muscle loss
  if (
    user.goal === 'fat_loss' &&
    weights.length >= 4 &&
    waists.length >= 4 &&
    weightDelta <= -0.5 &&
    Math.abs(waistDelta) < 0.4
  ) {
    return {
      tone: 'warning',
      situation: 'Kilo düşüyor ama bel ölçün aynı',
      reason: `Kilon ${Math.abs(weightDelta).toFixed(1)} kg düştü, bel ölçün ${waists[0].toFixed(1)}→${waists[waists.length - 1].toFixed(1)} cm — neredeyse değişmemiş. Bu su veya kas kaybı olabilir.`,
      action: '3 gün daha veri topla; bu hafta protein hedefini eksiksiz tutmaya odaklan.',
    };
  }

  // Rule 4c: fat-loss plateau (weight and waist both flat)
  if (user.goal === 'fat_loss' && weights.length >= 5 && Math.abs(weightDelta) < 0.2) {
    return {
      tone: 'warning',
      situation: 'Kilo değişimi 5 günde duraklamış',
      reason: `Son ${weights.length} log'da kilon ${weights[0].toFixed(1)} → ${weights[weights.length - 1].toFixed(1)} kg, sapma 200 g'ın altında.`,
      action: 'Kaloriyi düşürmeden önce 3 gün günlük adımını 2.000 artır ve su 2.5 L\'yi tut.',
    };
  }

  // Rule 4d: very fast fat loss — could harm muscle / be unsustainable
  if (user.goal === 'fat_loss' && weights.length >= 5 && weightDelta <= -1.5) {
    return {
      tone: 'warning',
      situation: 'Kilo kaybı çok hızlı',
      reason: `Son ${weights.length} günde ${Math.abs(weightDelta).toFixed(1)} kg düştün — sürdürülebilir oran haftada 0.5-1 kg.`,
      action: 'Kaloriyi 150 kcal artır (öğünlerden birine 1 yumurta + 1 dilim ekmek). Hız değil, süreklilik.',
    };
  }

  // Rule 5: muscle-gain plateau
  if (user.goal === 'muscle_gain' && weights.length >= 5 && weightDelta < 0.2) {
    return {
      tone: 'warning',
      situation: 'Kas alımında plato',
      reason: `Son ${weights.length} log'da kilon ${weights[0].toFixed(1)} → ${weights[weights.length - 1].toFixed(1)} kg, yukarı hareket yok.`,
      action: 'Antrenman sonrası ara öğüne 150 kcal karbonhidrat ekle (1 muz + yulaf).',
    };
  }

  // Rule 6: high compliance → reinforce
  if (avgCompliance >= 85) {
    return {
      tone: 'positive',
      situation: `7 günlük uyum %${avgCompliance}`,
      reason: 'Plana sıkı uyuyorsun, sistem çalışıyor. Hedeflerinde momentum var.',
      action: 'Bugün de aynı planı uygula, yeni bir değişken eklemeden 5 gün daha sürdür.',
    };
  }

  // Default neutral
  return {
    tone: 'neutral',
    situation: `7 günlük uyum %${avgCompliance}`,
    reason: 'Veriler karma sinyal veriyor — açık bir plato veya eksiklik yok ama momentum da zayıf.',
    action: 'Bugün öğün tikleri ve su alımını eksiksiz işaretle, yarınki kart daha net olur.',
  };
}

module.exports = { buildInsight };
