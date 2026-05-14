/**
 * Copia um usuário do banco local para o banco de produção.
 *
 * Lê o `.env` da pasta do backend. Variáveis:
 *   MONGODB_URI (ou MONGODB_URI_DEV / MONGODB_URI_SOURCE)  — origem (local)
 *   MONGODB_URI_PROD (ou MONGODB_URI_TARGET)              — destino (Atlas, etc.)
 *   USER_EMAIL ou USER_ID                                 — opcional: se houver 1 usuário na origem, usa esse
 *   OVERWRITE=1, DRY_RUN=1
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models/user.js';

const overwrite = process.env.OVERWRITE === '1' || process.env.OVERWRITE === 'true';
const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

let emailParam = (process.env.USER_EMAIL || '').trim().toLowerCase() || null;
const idParam = (process.env.USER_ID || '').trim() || null;

const rawSource =
  process.env.MONGODB_URI_SOURCE || process.env.MONGODB_URI || process.env.MONGODB_URI_DEV;
const rawTarget =
  process.env.MONGODB_URI_TARGET || process.env.MONGODB_URI_PROD;

function databaseNameFromSourceUri(source) {
  const noQ = String(source).split('?')[0];
  const m = noQ.match(/:[0-9]+\/([^/?]+)\/?$/);
  if (m) return m[1];
  const m2 = noQ.match(/\.mongodb\.net\/([^/?]+)(?:\/?)?$/i);
  if (m2 && m2[1] && m2[1] !== 'mongodb.net') return m2[1];
  return 'beleza_estrategica';
}

/** Atlas às vezes vem sem nome do banco: ...mongodb.net/?appName= */
function ensureTargetDatabaseUri(target, dbName) {
  if (!dbName) return target;
  const t = String(target);
  if (/\.mongodb\.net\/\?/i.test(t)) {
    return t.replace(/(\.mongodb\.net)\/\?/i, `$1/${dbName}?`);
  }
  return t;
}

function redactUri(uri) {
  if (!uri) return '';
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return uri.replace(/:[^:@/]+@/, ':***@');
  }
}

if (!rawSource || !rawTarget) {
  console.error('Defina MONGODB_URI (local) e MONGODB_URI_PROD (produção) no .env, ou MONGODB_URI_SOURCE / MONGODB_URI_TARGET.');
  process.exit(1);
}

const sourceUri = rawSource;
const targetUri = ensureTargetDatabaseUri(rawTarget, databaseNameFromSourceUri(sourceUri));

if (idParam && !mongoose.isValidObjectId(idParam)) {
  console.error('USER_ID inválido (não é um ObjectId).');
  process.exit(1);
}

console.log('Origem :', redactUri(sourceUri));
console.log('Destino:', redactUri(targetUri));
console.log('DRY_RUN:', dryRun, '| OVERWRITE no destino:', overwrite);

const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
const targetConn = await mongoose.createConnection(targetUri).asPromise();

const UserSource = sourceConn.model('User', User.schema);
const UserTarget = targetConn.model('User', User.schema);

try {
  if (!emailParam && !idParam) {
    const all = await UserSource.find().select('email name').lean();
    if (all.length === 0) {
      console.error('Nenhum usuário na origem. Crie um usuário no local ou defina USER_EMAIL / USER_ID.');
      process.exit(1);
    }
    if (all.length > 1) {
      console.error('Há mais de um usuário no local. Defina USER_EMAIL (ou USER_ID).');
      for (const u of all) {
        console.error(' -', u.email, u.name || '');
      }
      process.exit(1);
    }
    emailParam = String(all[0].email).toLowerCase();
    console.log('Usuário único na origem; usando e-mail:', emailParam);
  }

  const q = idParam ? { _id: idParam } : { email: emailParam };
  const sourceUser = await UserSource.findOne(q).lean();
  if (!sourceUser) {
    console.error('Usuário não encontrado na origem.');
    process.exit(1);
  }

  console.log('Encontrado na origem:', String(sourceUser._id), sourceUser.email, sourceUser.name);

  const existingTarget = await UserTarget.findOne({ email: sourceUser.email }).lean();

  if (existingTarget && !overwrite) {
    console.error(
      'Já existe no destino o e-mail',
      sourceUser.email,
      '(_id =',
      String(existingTarget._id) + ').',
    );
    console.error('Defina OVERWRITE=1 para atualizar a partir da origem (mantendo o _id de produção).');
    process.exit(1);
  }

  if (dryRun) {
    if (existingTarget) {
      console.log('[DRY_RUN] Atualizaria', String(existingTarget._id), 'com dados da origem.');
    } else {
      console.log('[DRY_RUN] Inseriria no destino sem _id (MongoDB gera um novo), com os demais campos.');
    }
    process.exit(0);
  }

  if (existingTarget) {
    const { _id: _x, __v, ...rest } = sourceUser;
    await UserTarget.updateOne(
      { _id: existingTarget._id },
      { $set: rest },
    );
    console.log('OK: usuário atualizado no destino. _id de produção:', String(existingTarget._id));
  } else {
    const { _id: _ignored, __v, ...dataWithoutId } = sourceUser;
    const [inserted] = await UserTarget.create([dataWithoutId]);
    console.log('OK: usuário inserido no destino. Novo _id (gerado):', String(inserted._id));
  }
} finally {
  await sourceConn.close();
  await targetConn.close();
}

process.exit(0);
