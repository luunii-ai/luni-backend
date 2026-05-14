import { verifyUserToken } from '../services/jwt.js';

export function createRequireAuth(jwtSecret) {
  return function requireAuth(req, res, next) {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    const token = m ? m[1].trim() : '';
    const userId = token ? verifyUserToken(token, jwtSecret) : null;
    if (!userId) {
      res.status(401).json({ message: 'Não autorizado' });
      return;
    }
    req.userId = userId;
    next();
  };
}
