import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { User } from '../models/user.js';
import { applyQuotaPeriodResetIfNeeded } from './simulationQuotas.js';

export function userToPublic(doc) {
  const out = {
    name: doc.name,
    email: doc.email,
    clinic: doc.clinic,
    phone: doc.phone || '',
    notifEmail: doc.notifEmail !== false,
    notifSms: doc.notifSms === true,
    firstAccess: doc.firstAccess === true,
    simulationCreditsRemaining: doc.simulationCreditsRemaining ?? 0,
    simulationMonthlyQuota: doc.simulationMonthlyQuota ?? 0,
    previewCreditsRemaining: doc.previewCreditsRemaining ?? 0,
    previewMonthlyQuota: doc.previewMonthlyQuota ?? 0,
    accountType: doc.accountType === 'partner_test' ? 'partner_test' : 'official',
  };
  if (doc.subscriptionStatus) out.subscriptionStatus = doc.subscriptionStatus;
  if (doc.trialEndsAt) out.trialEndsAt = doc.trialEndsAt.toISOString();
  if (doc.partnerTestExpiresAt) out.partnerTestExpiresAt = doc.partnerTestExpiresAt.toISOString();
  return out;
}

function resolvePartnerTestExpiresAt({ partnerTestExpiresAt, partnerTestDurationDays }) {
  const raw = partnerTestExpiresAt != null ? String(partnerTestExpiresAt).trim() : '';
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const days = Number(partnerTestDurationDays);
  if (Number.isFinite(days) && days > 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + Math.floor(days));
    return d;
  }
  return null;
}

// Same as findUserById but applies a lazy monthly quota reset before returning.
export async function findUserByIdWithQuotaReset(userId) {
  let user = await User.findById(userId);
  if (!user) return null;
  user = await applyQuotaPeriodResetIfNeeded(user);
  return user;
}

export async function findUserByEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) return null;
  return User.findOne({ email: e });
}

export async function createUser({ name, clinic, email, password }) {
  return createUserWithPassword({ name, clinic, email, password, firstAccess: false });
}

export async function createUserWithPassword({ name, clinic, email, password, firstAccess = true }) {
  const e = String(email).toLowerCase().trim();
  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = await User.create({
    email: e,
    passwordHash,
    name: String(name).trim(),
    clinic: String(clinic || '').trim(),
    phone: '',
    notifEmail: true,
    notifSms: false,
    firstAccess: firstAccess === true,
  });
  return user;
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(String(password), user.passwordHash);
}

/** Só estes campos vêm de PATCH /me; cota, Stripe e assinatura são rejeitados na rota. */
export async function updateUserById(userId, patch) {
  const allowed = ['name', 'email', 'clinic', 'phone', 'notifEmail', 'notifSms'];
  const update = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  if (update.email) update.email = String(update.email).toLowerCase().trim();
  const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true });
  return user;
}

export async function updateUserPassword(userId, newPassword, { firstAccess = false } = {}) {
  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  return User.findByIdAndUpdate(
    userId,
    { $set: { passwordHash, firstAccess: firstAccess === true } },
    { new: true },
  );
}

export async function findUserById(userId) {
  return User.findById(userId);
}

export async function findUserByStripeCustomerId(customerId) {
  const id = String(customerId || '').trim();
  if (!id) return null;
  return User.findOne({ stripeCustomerId: id });
}

export async function findUserByStripeSubscriptionId(subscriptionId) {
  const id = String(subscriptionId || '').trim();
  if (!id) return null;
  return User.findOne({ stripeSubscriptionId: id });
}

export async function updateUserStripeFields(userId, fields) {
  const set = {};
  if (fields.stripeCustomerId !== undefined) set.stripeCustomerId = String(fields.stripeCustomerId || '').trim();
  if (fields.stripeSubscriptionId !== undefined) set.stripeSubscriptionId = String(fields.stripeSubscriptionId || '').trim();
  if (fields.subscriptionStatus !== undefined) set.subscriptionStatus = String(fields.subscriptionStatus || '').trim();
  if (fields.trialEndsAt !== undefined) set.trialEndsAt = fields.trialEndsAt;
  if (fields.accountType !== undefined) set.accountType = fields.accountType;
  if (fields.partnerTestExpiresAt !== undefined) set.partnerTestExpiresAt = fields.partnerTestExpiresAt;
  if (Object.keys(set).length === 0) return User.findById(userId);
  return User.findByIdAndUpdate(userId, { $set: set }, { new: true });
}

/**
 * Cont parceiro: cota fixa (sem reposição mensal), sem Stripe até upgrade.
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.email
 * @param {string} [opts.clinic]
 * @param {string} [opts.password] — se omitido, gera temporária
 * @param {number} [opts.simulationCredits=10]
 * @param {number} [opts.previewCredits=5]
 * @param {string} [opts.partnerTestExpiresAt] — ISO
 * @param {number} [opts.partnerTestDurationDays] — dias a partir de agora (UTC)
 */
export async function createPartnerTestUser({
  name,
  clinic,
  email,
  password,
  simulationCredits = 10,
  previewCredits = 5,
  partnerTestExpiresAt,
  partnerTestDurationDays,
}) {
  const raw = Number(simulationCredits);
  const credits = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 10;
  const rawPreview = Number(previewCredits);
  const previewPts = Number.isFinite(rawPreview) && rawPreview >= 0 ? Math.floor(rawPreview) : 5;
  const pwd =
    password != null && String(password).length > 0
      ? String(password)
      : randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(pwd, 10);
  const e = String(email).toLowerCase().trim();
  const expiresAt = resolvePartnerTestExpiresAt({ partnerTestExpiresAt, partnerTestDurationDays });
  const user = await User.create({
    email: e,
    passwordHash,
    name: String(name).trim(),
    clinic: String(clinic || '').trim(),
    phone: '',
    notifEmail: true,
    notifSms: false,
    firstAccess: true,
    accountType: 'partner_test',
    simulationMonthlyQuota: 0,
    simulationCreditsRemaining: credits,
    simulationQuotaPeriodKey: '',
    previewMonthlyQuota: previewPts,
    previewCreditsRemaining: previewPts,
    previewQuotaPeriodKey: '',
    partnerTestExpiresAt: expiresAt,
  });
  return { user, plainPassword: password != null && String(password).length > 0 ? null : pwd };
}
