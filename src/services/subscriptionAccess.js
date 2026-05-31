import { isSubscriptionBypassUser } from './subscriptionBypass.js';

/** Status Stripe com bloqueio imediato por inadimplência. */
const PAYMENT_OVERDUE_STATUSES = new Set(['past_due', 'unpaid']);

/** Status Stripe cancelados — bloqueio após currentPeriodEnd. */
const CANCELED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'cancelled', 'incomplete_expired']);

export const PAYMENT_OVERDUE_MESSAGE =
  'Pagamento pendente. Regularize sua assinatura para continuar.';

export const SUBSCRIPTION_CANCELED_MESSAGE =
  'Sua assinatura encerrou. Renove o plano para continuar.';

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Record<string, unknown> | null | undefined} userDoc
 * @returns {{ locked: boolean, code?: string, message?: string }}
 */
export function getSubscriptionLockState(userDoc) {
  if (!userDoc) return { locked: false };
  if (isSubscriptionBypassUser(userDoc)) return { locked: false };

  if (String(userDoc.accountType || '') === 'partner_test') {
    if (!String(userDoc.stripeSubscriptionId || '').trim()) return { locked: false };
  }

  const status = String(userDoc.subscriptionStatus || '').toLowerCase();

  if (PAYMENT_OVERDUE_STATUSES.has(status)) {
    return { locked: true, code: 'PAYMENT_OVERDUE', message: PAYMENT_OVERDUE_MESSAGE };
  }

  if (CANCELED_SUBSCRIPTION_STATUSES.has(status)) {
    const periodEnd = toDate(userDoc.currentPeriodEnd);
    if (periodEnd && Date.now() < periodEnd.getTime()) {
      return { locked: false };
    }
    return { locked: true, code: 'SUBSCRIPTION_CANCELED', message: SUBSCRIPTION_CANCELED_MESSAGE };
  }

  return { locked: false };
}

/** @param {Record<string, unknown> | null | undefined} userDoc */
export function isSubscriptionAppLocked(userDoc) {
  return getSubscriptionLockState(userDoc).locked;
}

/** @deprecated use getSubscriptionLockState */
export const SUBSCRIPTION_LOCK_MESSAGE = SUBSCRIPTION_CANCELED_MESSAGE;
