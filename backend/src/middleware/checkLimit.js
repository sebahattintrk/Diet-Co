// backend/src/middleware/checkLimit.js
const db = require('../db');

// Gece 03:00 kuralı (chat ve dashboard ile birebir aynı)
const ACTIVE_DATE_SQL = `((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul') - INTERVAL '3 hours')::date`;

module.exports = async function checkLimit(req, res, next) {
  const targetUserId = Number(req.body.userId || req.user?.id);

  if (!targetUserId || isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Geçersiz kullanıcı oturumu.' });
  }

  try {
    const userRes = await db.query(
      `SELECT id, is_premium FROM users WHERE id = $1`,
      [targetUserId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const user = userRes.rows[0];

    // 1. PRO Kullanıcılar Sınırsız
    if (user.is_premium) {
      req.userIsPro = true;
      req.remainingQuestions = 999;
      return next();
    }

    // 2. Ücretsiz Kullanıcılar İçin Günlük 3 Soru Limiti Kontrolü
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS count 
       FROM chat_messages 
       WHERE user_id = $1 
         AND sender = 'user' 
         AND (created_at AT TIME ZONE 'Europe/Istanbul' - INTERVAL '3 hours')::date = ${ACTIVE_DATE_SQL}`,
      [targetUserId]
    );

    const todayUsed = Number(countRes.rows[0]?.count || 0);
    const DAILY_FREE_QUESTIONS = 3;

    console.log(`[Limit Kontrolü] Kullanıcı: ${targetUserId} | Bugün Kullanılan: ${todayUsed} / ${DAILY_FREE_QUESTIONS}`);

    // Kullanıcı 3 sorusunu tamamladıysa 4. soruda doğrudan 429 döndür ve engelle
    if (todayUsed >= DAILY_FREE_QUESTIONS) {
      return res.status(429).json({
        error: 'Bugünkü 3 ücretsiz AI Koç hakkınızı doldurdunuz. Sınırsız koçluk için PRO üyeliğe geçin.',
        code: 'DAILY_LIMIT_REACHED',
        isPro: false,
        remainingQuestions: 0,
      });
    }

    req.userIsPro = false;
    req.remainingQuestions = Math.max(0, DAILY_FREE_QUESTIONS - (todayUsed + 1));
    next();
  } catch (error) {
    console.error('[checkLimit Kritik Hata]:', error);
    return res.status(500).json({ error: 'Limit kontrolü yapılamadı: ' + error.message });
  }
};