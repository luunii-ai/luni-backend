import { EnhancePair } from '../models/enhancePair.js';
import { getObjectBuffer, resolveReadUrl } from './r2Storage.js';

export async function createEnhancePairDoc({
  pairId,
  userId,
  originalKey,
  afterKey,
  originalContentType,
  afterContentType,
}) {
  await EnhancePair.create({
    pairId,
    userId,
    originalKey,
    afterKey,
    originalContentType,
    afterContentType,
  });
}

export async function getPairUrlsForUser(pairId, userId) {
  const doc = await EnhancePair.findOne({ pairId, userId }).lean();
  if (!doc) return null;
  const originalUrl = await resolveReadUrl(doc.originalKey);
  const afterUrl = await resolveReadUrl(doc.afterKey);
  return { originalUrl, afterUrl, originalKey: doc.originalKey, afterKey: doc.afterKey };
}

/**
 * Lê a imagem "after" direto do R2 (GetObject) para o browser baixar via /api, sem CORS.
 */
export async function getAfterBufferForUser(pairId, userId) {
  const doc = await EnhancePair.findOne({ pairId, userId }).lean();
  if (!doc) return null;
  const { buffer, contentType } = await getObjectBuffer(doc.afterKey);
  const ct = (contentType || doc.afterContentType || 'image/png').trim();
  return { buffer, contentType: ct };
}
