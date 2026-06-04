/**
 * Atualiza conta partner_test → official após pagamento Stripe sem webhook.
 * Apenas $set — não apaga pacientes, simulações nem a conta.
 *
 * Uso (Nycolli — valores acordados):
 *   node src/scripts/reconcilePartnerSubscription.js --dry-run
 *   node src/scripts/reconcilePartnerSubscription.js
 *
 * Genérico:
 *   node src/scripts/reconcilePartnerSubscription.js \
 *     --email cliente@email.com \
 *     --customer-id cus_xxx \
 *     --subscription-id sub_xxx \
 *     --status active \
 *     --price-id price_xxx \
 *     --period-end 2026-07-04T19:21:57.000Z
 *
 * Produção: defina MONGODB_URI para o cluster correto ou use --use-prod (MONGODB_URI_PROD).
 * Sem rede/DNS: --print-atlas gera o updateOne para colar no Atlas → Browse Collections → mongosh.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../adapters/db.js';
import { User } from '../models/user.js';
import { findUserByEmail, userToPublic } from '../services/users.js';
import {
  getCurrentQuotaPeriodKey,
  getMonthlyQuotaForPriceId,
  getMonthlyPreviewQuotaForPriceId,
} from '../services/simulationQuotas.js';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function parsePeriodEnd(rawIso, rawUnix) {
  const iso = String(rawIso || '').trim();
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const unix = Number(rawUnix);
  if (Number.isFinite(unix) && unix > 0) {
    const d = new Date(unix > 1e12 ? unix : unix * 1000);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

const dryRun = hasFlag('dry-run');
const useProd = hasFlag('use-prod');
const printAtlas = hasFlag('print-atlas');

const email = String(process.env.RECONCILE_EMAIL || arg('email', 'dranycollip.peroni@gmail.com'))
  .toLowerCase()
  .trim();
const stripeCustomerId = String(
  process.env.RECONCILE_CUSTOMER_ID || arg('customer-id', 'cus_UdvxCG4uZDMCTP'),
).trim();
const stripeSubscriptionId = String(
  process.env.RECONCILE_SUBSCRIPTION_ID || arg('subscription-id', 'sub_1Tee5LAW8irGMIsUDzDEUQcf'),
).trim();
const subscriptionStatus = String(
  process.env.RECONCILE_STATUS || arg('status', 'active'),
).trim();
const priceId = String(
  process.env.RECONCILE_PRICE_ID || arg('price-id', 'price_1TXUs8AW8irGMIsUwF9gzxhq'),
).trim();
const cancelAtPeriodEnd =
  String(process.env.RECONCILE_CANCEL_AT_PERIOD_END || arg('cancel-at-period-end', 'false')).toLowerCase() ===
  'true';

const periodEnd = parsePeriodEnd(
  process.env.RECONCILE_PERIOD_END || arg('period-end', '2026-07-04T19:21:57.000Z'),
  process.env.RECONCILE_PERIOD_END_UNIX || arg('period-end-unix', ''),
);

if (!email || !stripeCustomerId || !stripeSubscriptionId || !subscriptionStatus || !priceId) {
  console.error('Parâmetros obrigatórios: --email, --customer-id, --subscription-id, --status, --price-id');
  process.exit(1);
}

if (!periodEnd) {
  console.error('Defina --period-end (ISO) ou --period-end-unix');
  process.exit(1);
}

const simulationQuota = getMonthlyQuotaForPriceId(priceId);
const previewQuota = getMonthlyPreviewQuotaForPriceId(priceId);
const periodKey = getCurrentQuotaPeriodKey();

const $set = {
  stripeCustomerId,
  stripeSubscriptionId,
  subscriptionStatus,
  trialEndsAt: null,
  currentPeriodEnd: periodEnd,
  cancelAtPeriodEnd,
  accountType: 'official',
  partnerTestExpiresAt: null,
  simulationMonthlyQuota: simulationQuota,
  simulationCreditsRemaining: simulationQuota,
  simulationQuotaPeriodKey: periodKey,
  previewMonthlyQuota: previewQuota,
  previewCreditsRemaining: previewQuota,
  previewQuotaPeriodKey: periodKey,
};

const mongoUri = String(arg('uri', '') || process.env.RECONCILE_MONGODB_URI || '').trim()
  || (useProd ? process.env.MONGODB_URI_PROD?.trim() : process.env.MONGODB_URI?.trim());

function printAtlasShell() {
  const periodIso = periodEnd.toISOString();
  console.log('\n--- Cole no MongoDB Atlas (Database → Connect → Shell) ---\n');
  console.log('use beleza_estrategica');
  const updateBody = `{
    $set: {
      stripeCustomerId: ${JSON.stringify(stripeCustomerId)},
      stripeSubscriptionId: ${JSON.stringify(stripeSubscriptionId)},
      subscriptionStatus: ${JSON.stringify(subscriptionStatus)},
      trialEndsAt: null,
      currentPeriodEnd: ISODate(${JSON.stringify(periodIso)}),
      cancelAtPeriodEnd: ${cancelAtPeriodEnd},
      accountType: "official",
      partnerTestExpiresAt: null,
      simulationMonthlyQuota: ${simulationQuota},
      simulationCreditsRemaining: ${simulationQuota},
      simulationQuotaPeriodKey: ${JSON.stringify(periodKey)},
      previewMonthlyQuota: ${previewQuota},
      previewCreditsRemaining: ${previewQuota},
      previewQuotaPeriodKey: ${JSON.stringify(periodKey)}
    }
  }`;
  console.log(`db.users.updateOne(
  { email: ${JSON.stringify(email)} },
  ${updateBody}
);`);
  console.log('\n--- Ou filtro por _id ---\n');
  console.log(`db.users.updateOne(
  { _id: ObjectId("6a1a1ee44abe82fbf1946f61") },
  ${updateBody}
);`);
}

console.log('--- reconcilePartnerSubscription ---');
console.log('Modo:', printAtlas ? 'PRINT-ATLAS (sem conexão)' : dryRun ? 'DRY-RUN (sem gravar)' : 'APLICAR');
if (!printAtlas) {
  console.log('Mongo:', arg('uri', '') ? '--uri' : useProd ? 'MONGODB_URI_PROD' : 'MONGODB_URI');
}
console.log('E-mail:', email);
console.log('$set:', JSON.stringify($set, null, 2));

if (printAtlas) {
  printAtlasShell();
  process.exit(0);
}

if (!mongoUri) {
  console.error('Defina MONGODB_URI (ou --use-prod com MONGODB_URI_PROD, ou --uri "mongodb+srv://...")');
  process.exit(1);
}

try {
  await connectDb(mongoUri);
} catch (e) {
  console.error('\nFalha ao conectar ao MongoDB:', e?.message || e);
  console.error(`
Dicas:
  1) Rede/DNS: querySrv ECONNREFUSED = firewall, VPN ou DNS bloqueando Atlas.
     Tente outra rede, desligar VPN ou DNS 8.8.8.8.
  2) Cluster errado: confira se a conta está em MONGODB_URI (luni) ou MONGODB_URI_PROD (aviva).
     Teste sem --use-prod: node src/scripts/reconcilePartnerSubscription.js --dry-run
  3) Sem terminal: node src/scripts/reconcilePartnerSubscription.js --print-atlas
     e cole o comando no Atlas Shell (interface web).
`);
  printAtlasShell();
  process.exit(1);
}

const user = await findUserByEmail(email);
if (!user) {
  console.error(`Usuário não encontrado: ${email}`);
  await mongoose.disconnect();
  process.exit(1);
}

console.log('\nAntes:', JSON.stringify(userToPublic(user), null, 2));
console.log('accountType antes:', user.accountType);

const otherWithSub = await User.findOne({
  _id: { $ne: user._id },
  stripeSubscriptionId,
}).lean();
if (otherWithSub) {
  console.error(
    `Erro: stripeSubscriptionId já pertence a outro usuário (${otherWithSub.email}). Abortando.`,
  );
  await mongoose.disconnect();
  process.exit(1);
}

const otherWithCust = await User.findOne({
  _id: { $ne: user._id },
  stripeCustomerId,
}).lean();
if (otherWithCust) {
  console.error(
    `Erro: stripeCustomerId já pertence a outro usuário (${otherWithCust.email}). Abortando.`,
  );
  await mongoose.disconnect();
  process.exit(1);
}

if (dryRun) {
  console.log('\nDry-run concluído. Nenhuma alteração gravada.');
  await mongoose.disconnect();
  process.exit(0);
}

const updated = await User.findByIdAndUpdate(user._id, { $set }, { new: true });

console.log('\nDepois:', JSON.stringify(userToPublic(updated), null, 2));
console.log('Atualização concluída com sucesso.');

await mongoose.disconnect();
