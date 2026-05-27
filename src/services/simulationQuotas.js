import { User } from '../models/user.js';
import { isPartnerTestAppLocked } from './partnerTestAccess.js';
import { isSubscriptionAppLocked, getSubscriptionLockState } from './subscriptionAccess.js';

const PARTNER_LOCK_MSG = 'Período de teste encerrado. Contrate um plano em Configurações para continuar.';

// Timezone used to compute the YYYY-MM period key (e.g. first day of a new month
// in Brazil may already be the last of the previous month in UTC).
function getTimezone() {
  return (process.env.SIMULATION_QUOTA_TIMEZONE || 'America/Sao_Paulo').trim();
}

// Returns current period as "YYYY-MM" in the configured timezone.
export function getCurrentQuotaPeriodKey() {
  const tz = getTimezone();
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value || '';
  return `${year}-${month}`;
}

// Parses SIMULATION_QUOTA_BY_PRICE_ID env var.
// Expected format: {"price_xxx": 40, "price_yyy": 140}
function loadQuotaMap() {
  const raw = (process.env.SIMULATION_QUOTA_BY_PRICE_ID || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    console.error('[simulationQuotas] SIMULATION_QUOTA_BY_PRICE_ID is not valid JSON — quotas disabled');
  }
  return {};
}

export function getMonthlyQuotaForPriceId(priceId) {
  const map = loadQuotaMap();
  const id = String(priceId || '').trim();
  if (!id || !(id in map)) return 0;
  const quota = Number(map[id]);
  return Number.isFinite(quota) && quota >= 0 ? Math.floor(quota) : 0;
}

// If the stored period key is stale (new month), reset remaining credits to the
// monthly quota and update the period key. Writes to DB only when needed.
// Accepts either an in-memory Mongoose document or a plain userId (will fetch).
export async function applyQuotaPeriodResetIfNeeded(userDoc) {
  if (userDoc && String(userDoc.accountType || '') === 'partner_test') {
    return userDoc;
  }
  const periodKey = getCurrentQuotaPeriodKey();
  if (!userDoc || String(userDoc.simulationQuotaPeriodKey || '') === periodKey) return userDoc;

  const updated = await User.findByIdAndUpdate(
    userDoc._id,
    {
      $set: {
        simulationCreditsRemaining: userDoc.simulationMonthlyQuota ?? 0,
        simulationQuotaPeriodKey: periodKey,
      },
    },
    { new: true },
  );
  return updated;
}

// Called from the webhook when a subscription is created or updated.
// Reads the price id from the subscription object's first item and updates quota.
export async function syncUserQuotaFromStripeSubscription(userId, subscription) {
  const firstItem = subscription?.items?.data?.[0];
  const rawPrice = firstItem?.price;
  const priceId = typeof rawPrice === 'string' ? rawPrice : (rawPrice?.id ?? '');
  const quota = getMonthlyQuotaForPriceId(priceId);
  const previewQuota = getMonthlyPreviewQuotaForPriceId(priceId);

  const periodKey = getCurrentQuotaPeriodKey();

  await User.findByIdAndUpdate(userId, {
    $set: {
      simulationMonthlyQuota: quota,
      simulationCreditsRemaining: quota,
      simulationQuotaPeriodKey: periodKey,
      previewMonthlyQuota: previewQuota,
      previewCreditsRemaining: previewQuota,
      previewQuotaPeriodKey: periodKey,
    },
  });
}

// Called when the subscription reaches a terminal state (canceled, unpaid, etc.)
export async function zeroUserQuota(userId) {
  await User.findByIdAndUpdate(userId, {
    $set: {
      simulationMonthlyQuota: 0,
      simulationCreditsRemaining: 0,
      previewMonthlyQuota: 0,
      previewCreditsRemaining: 0,
    },
  });
}

/**
 * Tenta consumir 1 crédito de simulação (mês + débito atômico).
 * Usado na rota de enhance; ao salvar no histórico não debita de novo.
 * @param {string|object} userId id do User (ObjectId)
 * @returns {Promise<{ ok: true } | { ok: false, error: string, status: number }>}
 */
export async function tryDebitSimulationCredit(userId) {
  let userDoc = await User.findById(userId).lean();
  if (!userDoc) return { ok: false, error: 'Usuário não encontrado', status: 404 };

  if (isPartnerTestAppLocked(userDoc)) {
    return { ok: false, error: PARTNER_LOCK_MSG, status: 403, code: 'PARTNER_TEST_LOCKED' };
  }

  if (isSubscriptionAppLocked(userDoc)) {
    const subLock = getSubscriptionLockState(userDoc);
    return {
      ok: false,
      error: subLock.message || 'Assinatura inativa.',
      status: 403,
      code: subLock.code || 'SUBSCRIPTION_CANCELED',
    };
  }

  if (String(userDoc.simulationQuotaPeriodKey || '') !== getCurrentQuotaPeriodKey()) {
    userDoc = await applyQuotaPeriodResetIfNeeded(userDoc);
  }

  const debited = await User.findOneAndUpdate(
    { _id: userId, simulationCreditsRemaining: { $gt: 0 } },
    { $inc: { simulationCreditsRemaining: -1 } },
    { new: true },
  );
  if (!debited) {
    return { ok: false, error: 'Limite de simulações do mês atingido', status: 403 };
  }
  return { ok: true };
}

/** Devolve 1 crédito após falha do agente (débito feito antes da chamada). */
export async function refundSimulationCredit(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { simulationCreditsRemaining: 1 } });
}

// --- Preview quota ---

function loadPreviewQuotaMap() {
  const raw = (process.env.PREVIEW_QUOTA_BY_PRICE_ID || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    console.error('[simulationQuotas] PREVIEW_QUOTA_BY_PRICE_ID is not valid JSON — preview quotas disabled');
  }
  return {};
}

export function getMonthlyPreviewQuotaForPriceId(priceId) {
  const map = loadPreviewQuotaMap();
  const id = String(priceId || '').trim();
  if (!id || !(id in map)) return 0;
  const quota = Number(map[id]);
  return Number.isFinite(quota) && quota >= 0 ? Math.floor(quota) : 0;
}

/**
 * Tenta consumir 1 crédito de pré-visualização (mês + débito atômico).
 * @param {string|object} userId
 * @returns {Promise<{ ok: true } | { ok: false, error: string, status: number, code?: string }>}
 */
export async function tryDebitPreviewCredit(userId) {
  let userDoc = await User.findById(userId).lean();
  if (!userDoc) return { ok: false, error: 'Usuário não encontrado', status: 404 };

  if (isPartnerTestAppLocked(userDoc)) {
    return { ok: false, error: PARTNER_LOCK_MSG, status: 403, code: 'PARTNER_TEST_LOCKED' };
  }

  if (isSubscriptionAppLocked(userDoc)) {
    const subLock = getSubscriptionLockState(userDoc);
    return {
      ok: false,
      error: subLock.message || 'Assinatura inativa.',
      status: 403,
      code: subLock.code || 'SUBSCRIPTION_CANCELED',
    };
  }

  /** Parceiro: cota fixa de pré-visualização (igual às simulações), sem recarga pelo mês civil. */
  const isPartner = String(userDoc.accountType || '') === 'partner_test';
  if (!isPartner) {
    const periodKey = getCurrentQuotaPeriodKey();
    if (String(userDoc.previewQuotaPeriodKey || '') !== periodKey) {
      const updated = await User.findByIdAndUpdate(
        userDoc._id,
        {
          $set: {
            previewCreditsRemaining: userDoc.previewMonthlyQuota ?? 0,
            previewQuotaPeriodKey: periodKey,
          },
        },
        { new: true },
      );
      userDoc = updated;
    }
  }

  const debited = await User.findOneAndUpdate(
    { _id: userId, previewCreditsRemaining: { $gt: 0 } },
    { $inc: { previewCreditsRemaining: -1 } },
    { new: true },
  );
  if (!debited) {
    return {
      ok: false,
      error: 'Limite de pré-visualizações do mês atingido',
      status: 403,
      code: 'PREVIEW_LIMIT_REACHED',
    };
  }
  return { ok: true };
}

/** Devolve 1 crédito de preview após falha do agente. */
export async function refundPreviewCredit(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { previewCreditsRemaining: 1 } });
}
