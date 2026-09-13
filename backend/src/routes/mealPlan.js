// backend/src/routes/mealPlan.js
const router = require('express').Router();
const db = require('../db');
const { generateMeals, turkishLower } = require('../services/mealGenerator');
const { generateMedicalConstraints } = require('../services/healthFilter');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const RECENT_NAMES_TO_EXCLUDE = 16;

// backend/src/routes/mealPlan.js
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const targetUserId = Number(userId) || 1;

  try {
    const userR = await db.query(
      'SELECT id, name, goal, calorie_target, protein_target, carbs_target, fats_target, health_conditions, is_premium, created_at FROM users WHERE id = $1',
      [targetUserId]
    );
    if (userR.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }
    const user = userR.rows[0];

    // 14 Günlük Süre Hesabı
    const userCreatedAt = new Date(user.created_at || Date.now());
    const diffDays = Math.floor((Date.now() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24));
    const trialDaysLeft = Math.max(0, 14 - diffDays);
    const isPro = Boolean(user.is_premium);

    // 🛑 KİLİT KONTROLÜ: PRO değilse ve 14 gün dolduysa HİÇBİR ŞEY dönme, doğrudan 403 ver!
    if (!isPro && diffDays > 14) {
      return res.status(403).json({
        error: '14 günlük ücretsiz beslenme planı süreniz doldu. Yeni öğünler için lütfen PRO üyeliğe geçin.',
        code: 'TRIAL_EXPIRED',
        isPro: false,
        trialDaysLeft: 0,
        meals: [],
      });
    }

    const dateRes = await db.query(
      "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date AS today"
    );
    const today = dateRes.rows[0].today;

    let planRes = await db.query(
      'SELECT * FROM meal_plans WHERE user_id = $1 AND plan_date = $2 ORDER BY id DESC LIMIT 1',
      [targetUserId, today]
    );

    let planData;
    if (planRes.rows.length === 0) {
      console.log(`\n📅 [YENİ PLAN]: ${user.name || targetUserId} için ${today} tarihi AI beslenme planı üretiliyor...\n`);
      planData = await generatePlan(user);
    } else {
      planData = planRes.rows[0];
    }

    return res.status(200).json({
      ...planData,
      isPro,
      trialDaysLeft,
    });
  } catch (error) {
    console.error('MealPlan Hatası:', error);
    return res.status(500).json({ error: 'Plan yüklenemedi' });
  }
});

// POST /meal-plan/:userId/custom-slot - Elindeki malzemelere göre güvenli öğün uyarlama
router.post('/:userId/custom-slot', async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { slot, ingredients } = req.body;
    if (!userId || !SLOTS.includes(slot) || !ingredients?.trim()) {
      return res.status(400).json({ error: 'Geçersiz parametreler veya boş malzeme listesi.' });
    }

    const userR = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userR.rows.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const user = userR.rows[0];

    const userCreatedAt = new Date(user.created_at || Date.now());
    const diffDays = Math.floor((Date.now() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24));
    if (!user.is_premium && diffDays > 14) {
      return res.status(403).json({
        error: 'Öğün uyarlama özelliği için 14 günlük deneme süreniz doldu. Lütfen PRO üyeliğe geçin.',
        code: 'TRIAL_EXPIRED',
      });
    }

    let planRow = await getTodayPlan(userId);
    if (!planRow) planRow = await generatePlan(user);

    const slotShare = { breakfast: 0.25, lunch: 0.32, dinner: 0.33, snack: 0.10 };
    const targetKcal = Math.round((user.calorie_target || 2500) * (slotShare[slot] || 0.25));
    const targetPro = Math.round((user.protein_target || 120) * (slotShare[slot] || 0.25));

    const medicalBlock = generateMedicalConstraints(user.health_conditions);

    const prompt = `
Sen Diet-Co kişisel beslenme koçusun.
Danışanın: ${user.name} | Hedef: ${user.goal}
Öğün: ${slot}
Hedef Değerler: Yaklaşık ${targetKcal} kcal, ${targetPro}g Protein.

${medicalBlock}

Danışanın elinde bulunan malzemeler:
"${ingredients}"

GÖREV:
Danışanının evinde bulunan bu malzemeleri kullanarak hedefine ve makrolarına uygun 1 Türk öğünü oluştur.
ÇOK ÖNEMLİ KURAL: Eğer kullanıcının girdiği malzemelerden herhangi biri sağlık durumuna/alerjisine aykırıysa, o zararlı malzemeyi KESİNLİKLE kullanma! Onu güvenli bir alternatifle değiştir ve 'rationale' alanında kullanıcının sağlığını korumak için bu değişikliği yaptığını nazikçe belirt.

SADECE aşağıdaki JSON formatında geçerli bir JSON döndür:
{
  "name": "Yemek Adı",
  "description": "Yemeğin kısa ve pratik hazırlanış açıklaması",
  "calories": ${targetKcal},
  "protein_g": ${targetPro},
  "carbs_g": 35,
  "fats_g": 14,
  "serving_size_g": 300,
  "prep_time_min": 15,
  "ingredients": ["malzeme 1", "malzeme 2"],
  "rationale": "Sağlık durumuna ve hedeflerine uygun olarak uyarlandı."
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    let cleanJson = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const newMeal = JSON.parse(cleanJson);
    newMeal.slot = slot;
    newMeal.category = slot;
    newMeal.tags = ['sana-özel', 'evdeki-malzemeler'];

    const snapshot = mealToSnapshot(newMeal, 'ai_customized');

    const updateRes = await db.query(
      `UPDATE meal_plans
       SET ${slot}_snapshot = $1
       WHERE user_id = $2 AND plan_date = CURRENT_DATE
       RETURNING *`,
      [snapshot, userId]
    );

    return res.json(serializePlan(user, updateRes.rows[0]));
  } catch (err) {
    console.error('Custom slot error:', err);
    next(err);
  }
});

router.patch('/:userId/meal', async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { slot, done } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'invalid_user_id' });
    if (!SLOTS.includes(slot)) return res.status(400).json({ error: 'invalid_slot' });
    if (typeof done !== 'boolean') return res.status(400).json({ error: 'invalid_done' });

    const column = `${slot}_done`;
    const r = await db.query(
      `UPDATE meal_plans
          SET ${column} = $1
        WHERE user_id = $2 AND plan_date = CURRENT_DATE
        RETURNING *`,
      [done, userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'plan_not_found' });

    const plan = r.rows[0];
    const snap = plan[`${slot}_snapshot`];
    const cal = Math.round(Number(snap?.calories || 0));
    const pro = Math.round(Number(snap?.protein_g || 0));

    const calDiff = done ? cal : -cal;
    const proDiff = done ? pro : -pro;

    await db.query(
      `INSERT INTO daily_logs (user_id, log_date, calories_eaten, protein_eaten)
       VALUES ($1, CURRENT_DATE, GREATEST(0, $2), GREATEST(0, $3))
       ON CONFLICT (user_id, log_date)
       DO UPDATE SET 
         calories_eaten = GREATEST(0, daily_logs.calories_eaten + $2),
         protein_eaten = GREATEST(0, daily_logs.protein_eaten + $3);`,
      [userId, calDiff, proDiff]
    );

    res.json({ slot, done, calDiff, proDiff });
  } catch (err) { next(err); }
});

async function getTodayPlan(userId) {
  const r = await db.query(
    `SELECT * FROM meal_plans WHERE user_id = $1 AND plan_date = CURRENT_DATE`,
    [userId]
  );
  return r.rows[0] || null;
}

async function generatePlan(user) {
  const exclude = await recentMealNames(user.id, RECENT_NAMES_TO_EXCLUDE);
  const aiMeals = await generateMeals({ user, excludeNames: exclude });

  let bySlot = {};
  let idsBySlot = { breakfast: null, lunch: null, dinner: null, snack: null };

  if (aiMeals && aiMeals.length === 4) {
    for (const m of aiMeals) {
      bySlot[m.slot] = mealToSnapshot(m, 'ai');
    }
  }

  const r = await db.query(
    `INSERT INTO meal_plans (
        user_id, plan_date,
        breakfast_id, lunch_id, dinner_id, snack_id,
        breakfast_snapshot, lunch_snapshot, dinner_snapshot, snack_snapshot
     ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, plan_date) DO UPDATE SET
       breakfast_id       = EXCLUDED.breakfast_id,
       lunch_id           = EXCLUDED.lunch_id,
       dinner_id          = EXCLUDED.dinner_id,
       snack_id           = EXCLUDED.snack_id,
       breakfast_snapshot = EXCLUDED.breakfast_snapshot,
       lunch_snapshot     = EXCLUDED.lunch_snapshot,
       dinner_snapshot    = EXCLUDED.dinner_snapshot,
       snack_snapshot     = EXCLUDED.snack_snapshot,
       breakfast_done     = FALSE,
       lunch_done         = FALSE,
       dinner_done        = FALSE,
       snack_done         = FALSE
     RETURNING *`,
    [
      user.id,
      idsBySlot.breakfast, idsBySlot.lunch, idsBySlot.dinner, idsBySlot.snack,
      bySlot.breakfast ?? null, bySlot.lunch ?? null, bySlot.dinner ?? null, bySlot.snack ?? null,
    ]
  );
  return r.rows[0];
}

async function recentMealNames(userId, limit) {
  const r = await db.query(
    `SELECT DISTINCT name FROM (
        SELECT COALESCE(mp.breakfast_snapshot->>'name', '') AS name
          FROM meal_plans mp WHERE mp.user_id = $1 AND mp.plan_date >= CURRENT_DATE - INTERVAL '14 days'
        UNION
        SELECT COALESCE(mp.lunch_snapshot->>'name', '') FROM meal_plans mp WHERE mp.user_id = $1 AND mp.plan_date >= CURRENT_DATE - INTERVAL '14 days'
        UNION
        SELECT COALESCE(mp.dinner_snapshot->>'name', '') FROM meal_plans mp WHERE mp.user_id = $1 AND mp.plan_date >= CURRENT_DATE - INTERVAL '14 days'
        UNION
        SELECT COALESCE(mp.snack_snapshot->>'name', '') FROM meal_plans mp WHERE mp.user_id = $1 AND mp.plan_date >= CURRENT_DATE - INTERVAL '14 days'
     ) t WHERE name IS NOT NULL AND name <> ''
     ORDER BY name LIMIT $2`,
    [userId, limit]
  );
  return r.rows.map((row) => row.name);
}

function mealToSnapshot(m, source) {
  return {
    slot: m.slot,
    category: m.category,
    name: m.name,
    description: m.description,
    calories: m.calories,
    protein_g: m.protein_g,
    carbs_g: m.carbs_g,
    fats_g: m.fats_g,
    tags: m.tags || [],
    image_url: null,
    serving_size_g: m.serving_size_g ?? null,
    prep_time_min:  m.prep_time_min ?? null,
    ingredients:    m.ingredients ?? [],
    rationale:      m.rationale ?? null,
    source,
  };
}

function totalsFor(meals) {
  return meals.reduce(
    (acc, m) => ({
      calories: acc.calories + Number(m.calories  || 0),
      protein:  acc.protein  + Number(m.protein_g || 0),
      carbs:    acc.carbs    + Number(m.carbs_g   || 0),
      fats:     acc.fats     + Number(m.fats_g    || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
}

function serializePlan(user, planRow) {
  const meals = SLOTS
    .map((slot) => {
      const snap = planRow[`${slot}_snapshot`];
      const done = !!planRow[`${slot}_done`];
      const id   = planRow[`${slot}_id`];
      if (!snap) return null;
      const effectiveId = id != null ? id : -(planRow.id * 10 + SLOTS.indexOf(slot));
      return {
        slot,
        id: effectiveId,
        category: snap.category,
        name: snap.name,
        description: snap.description,
        calories: snap.calories,
        protein_g: snap.protein_g,
        carbs_g:   snap.carbs_g,
        fats_g:    snap.fats_g,
        image_url: snap.image_url || '',
        tags: snap.tags || [],
        serving_size_g: snap.serving_size_g ?? null,
        prep_time_min:  snap.prep_time_min  ?? null,
        ingredients:    Array.isArray(snap.ingredients) ? snap.ingredients : [],
        rationale:      snap.rationale ?? null,
        done,
      };
    })
    .filter(Boolean);

  return {
    date: planRow.plan_date,
    targets: {
      calories: user.calorie_target,
      protein:  user.protein_target,
      carbs:    user.carbs_target,
      fats:     user.fats_target,
    },
    totals: totalsFor(meals),
    meals,
  };
}

module.exports = router;