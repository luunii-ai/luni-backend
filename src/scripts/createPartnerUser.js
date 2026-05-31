/**
 * Cria conta partner_test via MongoDB (usa .env do backend).
 *
 * Uso:
 *   node src/scripts/createPartnerUser.js --email parceiro@email.com --name "Nome" --days 7 --credits 20
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../adapters/db.js';
import { createPartnerTestUser, findUserByEmail, userToPublic } from '../services/users.js';
import { sendPartnerTestWelcomeEmail } from '../services/email.js';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1];
}

const email = String(process.env.PARTNER_EMAIL || arg('email')).toLowerCase().trim();
const name = String(process.env.PARTNER_NAME || arg('name', 'Parceiro')).trim();
const days = Number(process.env.PARTNER_DAYS || arg('days', '0'));
const credits = Number(process.env.PARTNER_CREDITS || arg('credits', '10'));
const preview = Number(process.env.PARTNER_PREVIEW || arg('preview', '5'));
const password = String(process.env.PARTNER_PASSWORD || arg('password', '')).trim();

if (!email) {
  console.error('Uso: node src/scripts/createPartnerUser.js --email EMAIL --name "Nome" [--days 7] [--credits 20]');
  console.error('  ou: $env:PARTNER_EMAIL="..."; $env:PARTNER_NAME="..."; $env:PARTNER_DAYS=7; $env:PARTNER_CREDITS=20; npm run partner:create');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('Defina MONGODB_URI no .env');
  process.exit(1);
}

await connectDb(process.env.MONGODB_URI);

const existing = await findUserByEmail(email);
if (existing) {
  console.error(`Já existe conta (${existing.accountType}) para ${email}`);
  await mongoose.disconnect();
  process.exit(1);
}

const opts = {
  email,
  name,
  simulationCredits: credits,
  previewCredits: preview,
};
if (password) opts.password = password;
if (Number.isFinite(days) && days > 0) opts.partnerTestDurationDays = Math.floor(days);

const { user, plainPassword } = await createPartnerTestUser(opts);

if (plainPassword) {
  try {
    await sendPartnerTestWelcomeEmail({
      to: email,
      tempPassword: plainPassword,
      loginUrl: process.env.SUBSCRIPTION_WELCOME_LOGIN_URL?.trim() || undefined,
    });
    console.log('E-mail de boas-vindas enviado.');
  } catch (e) {
    console.warn('E-mail não enviado:', e?.message || e);
  }
}

console.log(JSON.stringify({ user: userToPublic(user), senhaTemporaria: plainPassword || null }, null, 2));
await mongoose.disconnect();
