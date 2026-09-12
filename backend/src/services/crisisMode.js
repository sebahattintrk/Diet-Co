// Premium feature: Kriz Modu.
//
// Six common "slipped from the plan" scenarios. For each, a deterministic Turkish
// guidance string PLUS (optionally) a Gemini-generated specific food suggestion
// tuned to the user's remaining macros for the day.
//
// The deterministic message is the source of truth — Gemini just adds a concrete
// next-meal idea. If Gemini fails, we still return the deterministic advice.

const TIMEOUT_MS = 10_000;

const SCENARIOS = {
  ate_out: {
    title: 'Dışarıda yedim, makro takibi yapamadım',
    advice:
      'Önce panik yapma — bir öğün veriyi bozmaz, tutarlılık bozar. Bugünün geri kalanını tahmini olarak hesapla, kalan kalori varsa hafif protein-ağırlıklı bir öğün, yoksa sadece su ve sebze ile günü kapat.',
    action: 'Yarın olağan plana dön; ekstra "telafi" için aç kalma.',
  },
  cheat_meal: {
    title: 'Tatlı / cheat kaçtı',
    advice:
      'Bir tatlı haftalık ilerlemeyi geri almaz — yıkıcı olan bunu "günüm gitti, devam edeyim" diye sürdürmek. Şu an mide doluysa hareket et (15-20 dk yürüyüş). Bir sonraki öğünü protein + sebze yap, karbonhidrat hafif tut.',
    action: 'Aynı gün ikinci tatlıya gitme. Yarın plana dön.',
  },
  late_hungry: {
    title: 'Geç saatte acıktım',
    advice:
      'Gece acıkmak normal — özellikle yağ kaybı hedefindeyseniz. Aç yatmak da kötü uyku = kötü hormon. 200-250 kcal civarı bir öğün: süzme yoğurt + 1 yemek kaşığı bal, lor peyniri + domates, ya da 1 yumurta + 1 dilim ekmek.',
    action: 'Hafif protein + biraz karbonhidrat, sonra direkt yat.',
  },
  protein_low: {
    title: 'Protein hedefim çok aşağıda',
    advice:
      'Bir gün düşük protein bir hafta üzerinde fark yaratmaz, ama tekrarlarsa kas/uyum bozulur. Şu an hızlı kapatma kaynakları: süzme yoğurt (1 kase ~25 g), whey shake (1 ölçek ~24 g), 3 yumurtalı omlet (~21 g), 100 g tavuk göğüs (~31 g).',
    action: 'Akşam öğününe protein eklemekten kaçınma, yarın da öncelikle protein.',
  },
  skipped_meal: {
    title: 'Bir öğünü atlattım',
    advice:
      'Bir öğün atlamak kalori açığını derinleştirir ama bunu "kazanç" sanmak hata — bir sonraki öğünü AŞIRI yeme riskini artırır. Bir sonraki öğüne **normalde yiyeceğinden biraz daha fazla protein** ekle, kaloriyi ikiye katlama.',
    action: 'Sonraki öğüne git, planı sürdür.',
  },
  post_workout: {
    title: 'Antrenmandan çıktım, ne yiyeyim?',
    advice:
      'İdeal: 30-60 dk içinde protein + karbonhidrat. Pratik: tavuk + bulgur, somon + pirinç, whey + muz + yulaf. Yağsız değil — kompleks karbonhidratla kasa glikojen geri yüklensin.',
    action: 'Eğer kalori hedefin bittiyse ara öğünü düşür (200-300 kcal yeter).',
  },
};

async function buildCrisisResponse({ user, kind, remainingCal, remainingProtein }) {
  const base = SCENARIOS[kind];
  if (!base) return { error: 'invalid_kind' };

  // Try to enrich with a specific Turkish food suggestion based on remaining macros.
  let suggested = null;
  let source = 'rule_engine';
  try {
    const ai = await geminiSuggestion(user, kind, base, remainingCal, remainingProtein);
    if (ai) {
      suggested = ai;
      source = 'gemini';
    }
  } catch {
    /* silently fall back */
  }

  return {
    kind,
    title: base.title,
    advice: base.advice,
    action: base.action,
    suggested_food: suggested,
    source,
    context: { remaining_kcal: remainingCal, remaining_protein_g: remainingProtein },
  };
}

async function geminiSuggestion(user, kind, base, remainingCal, remainingProtein) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const disliked = Array.isArray(user.disliked_foods) && user.disliked_foods.length
    ? user.disliked_foods.join(', ')
    : 'yok';

  const prompt = [
    'Sen Diet-Co uygulamasının "Kriz Modu" yardımcısısın. Kullanıcı şu durumda:',
    `- Durum: ${base.title}`,
    `- Bugünün kalan kalorisi: ~${remainingCal} kcal`,
    `- Bugünün kalan proteini: ~${remainingProtein} g`,
    `- Sevmediği yiyecekler: ${disliked}`,
    '',
    'Bu duruma uygun TEK bir Türk mutfağı ürünü/öğün öner (1 cümle):',
    '- Spesifik isim ver: "1 kase süzme yoğurt + 1 tatlı kaşığı bal" gibi.',
    '- ~kcal ve ~protein tahmini ekle.',
    '- Sevmediği yiyecekleri içerme.',
    '- Tek cümle, en fazla 25 kelime.',
    '- Sade Türkçe yaz, sayıyı parantez içinde göster: "1 kase süzme yoğurt + 1 yk bal (~210 kcal, 24 g protein)".',
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 120 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text ? text.slice(0, 200) : null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { buildCrisisResponse, SCENARIOS };
