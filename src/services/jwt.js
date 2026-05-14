import jwt from 'jsonwebtoken';

export function signUserToken(userId, secret) {
  return jwt.sign({ sub: String(userId) }, secret, { expiresIn: '7d' });
}

export function verifyUserToken(token, secret) {
  try {
    const payload = jwt.verify(token, secret);
    return payload?.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}
