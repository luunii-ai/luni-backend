import { User } from '../models/user.js';
import { verifyUserToken } from '../services/jwt.js';

function pathname(url) {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function skipTermsGuardAlways(p) {
  if (p.startsWith('/api/auth')) return true;
  if (p.startsWith('/api/admin')) return true;
  if (p.startsWith('/api/demo')) return true;
  if (p === '/api/subscriptions/plans') return true;
  if (p.startsWith('/api/subscriptions/checkout-session')) return true;
  if (p === '/api/subscriptions/checkout') return true;
  if (p === '/api/stripe/webhook') return true;
  return false;
}

function exemptWhenTermsPending(p) {
  if (p === '/api/me' || p.startsWith('/api/me/')) return true;
  if (p.startsWith('/api/subscriptions/')) return true;
  return false;
}

const LOCK_MESSAGE =
  'Aceite os Termos de Uso e a Política de Privacidade em Configurações para continuar usando a plataforma.';

export function userHasAcceptedTerms(user) {
  return Boolean(user?.termsAcceptedAt && user?.privacyAcceptedAt && user?.patientDataResponsibilityAckAt);
}

export function createTermsAcceptanceGuard(jwtSecret) {
  return async function termsAcceptanceGuard(req, res, next) {
    const p = pathname(req.originalUrl || req.url || '');
    if (skipTermsGuardAlways(p)) return next();

    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) return next();

    const userId = verifyUserToken(m[1].trim(), jwtSecret);
    if (!userId) return next();

    const user = await User.findById(userId).lean();
    if (!user || userHasAcceptedTerms(user)) return next();
    if (exemptWhenTermsPending(p)) return next();

    res.status(403).json({ message: LOCK_MESSAGE, code: 'TERMS_NOT_ACCEPTED' });
  };
}
