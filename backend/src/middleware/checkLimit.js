// backend/src/middleware/checkLimit.js
const db = require('../db');

module.exports = async function checkLimit(req, res, next) {
  const targetUserId = Number(req.body?.userId || req.user?.id);

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

    // 2. Ücretsiz Kullanıcı Günlük Soru Sayımı (Gece 03:00 kuralına tam uyumlu temiz SQL)
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS count 
       FROM chat_messages 
       WHERE user_id = $1 
         AND sender = 'user' 
         AND ((created_at AT TIME ZONE 'Europe/Istanbul') - INTERVAL '3 hours')::date = 
             ((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul') - INTERVAL '3 hours')::date`,
      [targetUserId]
    );

    const todayUsed = Number(countRes.rows[0]?.count || 0);
    const DAILY_FREE_QUESTIONS = 3;

    console.log(`[Limit Kontrolü] User: ${targetUserId} | Bugün Gönderilen: ${todayUsed} / ${DAILY_FREE_QUESTIONS}`);

    // Kullanıcı 3 sorusunu doldurduysa 4. soruda 429 döndür
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
    console.error('🚨 [checkLimit Kritik Hata]:', error.message || error);
    // Hata durumunda chat akışını tamamen kesmemek için ücretsiz kullanıcıyı devam ettir
    req.userIsPro = false;
    req.remainingQuestions = 1;
    next();
  }
};