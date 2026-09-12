// backend/src/middleware/checkLimit.js
const db = require('../db');

module.exports = async function checkLimit(req, res, next) {
  const targetUserId = Number(req.body.userId) || 1;

  try {
    const userRes = await db.query(
      `SELECT id, is_premium, created_at FROM users WHERE id = $1`,
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

    // 2. 14 Günlük Deneme Kontrolü
    const userCreatedDate = new Date(user.created_at || Date.now());
    const now = new Date();
    const diffDays = Math.floor(Math.abs(now.getTime() - userCreatedDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 14) {
      return res.status(403).json({
        error: '14 günlük ücretsiz AI Koç deneme süreniz sona erdi. Sınırsız sohbet için PRO üyeliğe geçin.',
        code: 'TRIAL_EXPIRED',
        isPro: false,
        remainingQuestions: 0,
      });
    }

    // 3. Günlük 3 Soru Limiti (Bugün gönderilen mesaj sayısı)
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS count 
       FROM chat_messages 
       WHERE user_id = $1 
         AND sender = 'user' 
         AND created_at >= CURRENT_DATE`,
      [targetUserId]
    );

    const todayUsed = countRes.rows[0]?.count || 0;
    const DAILY_LIMIT = 3;

    console.log(`[Limit Kontrolü] Kullanıcı: ${targetUserId} | Bugün Kullanılan: ${todayUsed} / ${DAILY_LIMIT}`);

    if (todayUsed >= DAILY_LIMIT) {
      return res.status(429).json({
        error: 'Bugünkü 3 ücretsiz AI Koç hakkınızı doldurdunuz. Haklarınız yarın yenilenecektir.',
        code: 'DAILY_LIMIT_REACHED',
        isPro: false,
        remainingQuestions: 0,
      });
    }

    req.userIsPro = false;
    req.remainingQuestions = Math.max(0, DAILY_LIMIT - (todayUsed + 1));
    next();
  } catch (error) {
    console.error('[checkLimit Kritik Hata]:', error);
    return res.status(500).json({ error: 'Limit kontrolü yapılamadı: ' + error.message });
  }
};