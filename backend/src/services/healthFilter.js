// backend/src/services/healthFilter.js

const HEALTH_RESTRICTIONS = {
  gluten: {
    title: 'Gluten Hassasiyeti / Çölyak',
    // Yalnızca gluten içeren net unlu mamuller (Jenerik "ekmek" yerine türevler)
    bannedIngredients: [
      'buğday', 'beyaz ekmek', 'tam buğday', 'simit', 'makarna',
      'bulgur', 'buğday unu', 'arpa', 'çavdar', 'börek', 'poğaça', 'lavaş', 'pide', 'irmik'
    ],
    safeAlternatives: 'Karabuğday ekmeği, glutensiz ekmek, kinoa, pirinç pilavı, glutensiz yulaf, patates.'
  },
  laktoz: {
    title: 'Laktoz İntoleransı',
    bannedIngredients: [
      'inek sütü', 'kaymak', 'krema', 'dondurma'
    ],
    safeAlternatives: 'Laktozsuz süt, badem sütü, laktozsuz yoğurt, laktozsuz peynir, lor peyniri.'
  },
  insulin: {
    title: 'İnsülin Direnci',
    bannedIngredients: [
      'rafine beyaz şeker', 'sofra şekeri', 'bal', 'reçel', 'pekmez',
      'patates kızartması', 'meyve suları', 'kola', 'gazoz'
    ],
    safeAlternatives: 'Tam tahıllar, lifli sebzeler, kuru baklagiller, çiğ kuruyemişler.'
  },
  diyabet: {
    title: 'Diyabet (Tip 1 / Tip 2)',
    bannedIngredients: [
      'sofra şekeri', 'şerbetli tatlı', 'çikolata', 'meyve suyu konsantresi', 'glikoz şurubu'
    ],
    safeAlternatives: 'Yüksek lifli sebzeler, kuru baklagiller, kompleks karbonhidratlar.'
  },
  tansiyon: {
    title: 'Hipertansiyon (Yüksek Tansiyon)',
    bannedIngredients: [
      'aşırı tuz', 'turşu', 'salamura', 'şalgam', 'sucuk', 'salam', 'sosis', 'bulyon'
    ],
    safeAlternatives: 'Tuzsuz baharatlar, sarımsak, taze sebzeler, çiğ tuzsuz kuruyemiş.'
  },
  kolesterol: {
    title: 'Yüksek Kolesterol',
    bannedIngredients: [
      'kuyruk yağı', 'iç yağı', 'aşırı tereyağı', 'yağlı kuzu eti', 'ciğer', 'kokoreç', 'kızartma'
    ],
    safeAlternatives: 'Zeytinyağı, avokado, somon, derisiz tavuk göğsü.'
  },
  tiroid: {
    title: 'Haşimato / Hipotiroidi',
    bannedIngredients: [
      'çiğ brokoli', 'çiğ karnabahar', 'çiğ lahana', 'soya sosu', 'buğday'
    ],
    safeAlternatives: 'Pişmiş sebzeler, kabak çekirdeği, deniz balıkları.'
  },
  reflu: {
    title: 'Reflü / Gastrit',
    bannedIngredients: [
      'acı biber', 'çiğ soğan', 'çiğ sarımsak', 'sirke', 'kızartma', 'gazlı içecek'
    ],
    safeAlternatives: 'Haşlanmış sebzeler, muz, tatlı patates, ızgara beyaz et.'
  }
};

function generateMedicalConstraints(healthConditionsText) {
  if (!healthConditionsText || typeof healthConditionsText !== 'string' || !healthConditionsText.trim()) {
    return '';
  }

  const lower = healthConditionsText.toLowerCase();
  const matchedRules = [];
  const allBannedFoods = new Set();

  Object.entries(HEALTH_RESTRICTIONS).forEach(([key, data]) => {
    if (lower.includes(key) || lower.includes(data.title.toLowerCase())) {
      matchedRules.push(`- ${data.title}: Kesinlikle "${data.bannedIngredients.join(', ')}" KULLANILAMAZ. (Önerilenler: ${data.safeAlternatives})`);
      data.bannedIngredients.forEach(ing => allBannedFoods.add(ing));
    }
  });

  return `
🚨 KULLANICI TIBBİ DİYET KISITLAMALARI:
Kullanıcının Rahatsızlıkları: "${healthConditionsText.trim()}"
${matchedRules.join('\n')}

YASAKLI LİSTE:
[${Array.from(allBannedFoods).join(', ')}]

ÖNEMLİ KURALLAR:
1. Çölyak/Gluten varsa: Ekmek yerine "Glutensiz Ekmek" veya "Karabuğday Ekmeği", makarna yerine "Glutensiz Makarna" veya "Pirinç" yaz. Normal buğday unlu gıdalar ASLA yazma.
2. Laktoz İntoleransı varsa: Süt ve yoğurt ürünlerinin başına mutlaka "Laktozsuz" ibaresi koy (örn: "Laktozsuz Yoğurt", "Laktozsuz Süt").
3. Hipertansiyon varsa: Yemeklerde "tuzsuz", "az tuzlu" ibareleri kullan; turşu ve salamura ürünler yazma.
`;
}

module.exports = {
  generateMedicalConstraints,
  HEALTH_RESTRICTIONS,
};