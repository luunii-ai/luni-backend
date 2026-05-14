import { User } from '../models/user.js';
import { verifyUserToken } from '../services/jwt.js';
import { isPartnerTestAppLocked } from '../services/partnerTestAccess.js';

function pathname(url) {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/** Rotas que nunca passam pela lógica de bloqueio (públicas ou antes do JWT). */
function skipPartnerLockAlways(p) {
  if (p.startsWith('/api/auth')) return true;
  if (p.startsWith('/api/admin')) return true;
  if (p === '/api/subscriptions/plans') return true;
  if (p.startsWith('/api/subscriptions/checkout-session')) return true;
  if (p === '/api/subscriptions/checkout') return true;
  return false;
}

/** Com conta parceira bloqueada, estas rotas continuam permitidas. */
function exemptWhenPartnerLocked(p) {
  if (p === '/api/me' || p.startsWith('/api/me/')) return true;
  if (p === '/api/subscriptions/checkout-official') return true;
  if (p === '/api/subscriptions/current') return true;
  if (p === '/api/subscriptions/portal') return true;
  return false;
}

const LOCK_MESSAGE = 'Período de teste encerrado. Contrate um plano em Configurações para continuar.';

export function createPartnerTestLockGuard(jwtSecret) {
  return async function partnerTestLockGuard(req, res, next) {
    const p = pathname(req.originalUrl || req.url || '');
    if (skipPartnerLockAlways(p)) return next();

    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) return next();

    const userId = verifyUserToken(m[1].trim(), jwtSecret);
    if (!userId) return next();

    const user = await User.findById(userId).lean();
    if (!user || user.accountType !== 'partner_test') return next();
    if (String(user.stripeSubscriptionId || '').trim()) return next();
    if (!isPartnerTestAppLocked(user)) return next();
    if (exemptWhenPartnerLocked(p)) return next();

    res.status(403).json({ message: LOCK_MESSAGE, code: 'PARTNER_TEST_LOCKED' });
  };
}
