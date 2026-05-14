import { PricingBase } from '../models/pricingBase.js';

const ALLOWED_FIELDS = [
  'desiredMargin',
  'estimatedUnits',
  'actualUnits',
  'costPerUnit',
  'botoxVialPrice',
  'botoxPointsPerVial',
  'monthlyPatients',
  'additionalCosts',
];

function sanitize(payload) {
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (payload[key] !== undefined) {
      out[key] = payload[key];
    }
  }
  return out;
}

export async function getPricingBase(userId, procedureId) {
  const doc = await PricingBase.findOne({ userId, procedureId }).lean();
  return doc ?? null;
}

export async function upsertPricingBase(userId, procedureId, payload) {
  const data = sanitize(payload);
  const doc = await PricingBase.findOneAndUpdate(
    { userId, procedureId },
    { $set: data },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return doc.toObject();
}
