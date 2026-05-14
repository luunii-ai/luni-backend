/**
 * Copia todos os dados do banco em MONGODB_URI para o banco em MONGODB_URI_LUNI.
 *
 * Variáveis (.env):
 *   MONGODB_URI          — origem
 *   MONGODB_URI_LUNI     — destino
 *   DRY_RUN=1            — só lista collections e contagens; não escreve
 *   DROP_TARGET=1        — antes de copiar cada collection, apaga a collection no destino (use com DB vazio ou aceitando perda)
 *   COPY_BATCH_SIZE=500  — tamanho do lote (máx. 1000)
 *
 * Por padrão faz upsert por _id (pode rodar de novo sem duplicar documentos). Índices não são copiados;
 * em Atlas você pode clonar índices pelo app ou definindo schemas Mongoose.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const rawSource = process.env.MONGODB_URI;
const rawTarget = process.env.MONGODB_URI_LUNI;

const dryRun =
  process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const dropTarget =
  process.env.DROP_TARGET === '1' || process.env.DROP_TARGET === 'true';
const batchSize = Math.min(
  Math.max(1, parseInt(process.env.COPY_BATCH_SIZE || '500', 10)),
  1000,
);

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
  console.error(
    'Defina MONGODB_URI (origem) e MONGODB_URI_LUNI (destino) no .env.',
  );
  process.exit(1);
}

const sourceUri = rawSource;
const targetUri = ensureTargetDatabaseUri(
  rawTarget,
  databaseNameFromSourceUri(sourceUri),
);

if (sourceUri === targetUri) {
  console.error('Origem e destino são a mesma URI. Abortando.');
  process.exit(1);
}

console.log('Origem :', redactUri(sourceUri));
console.log('Destino:', redactUri(targetUri));
console.log(
  'DRY_RUN:',
  dryRun,
  '| DROP_TARGET:',
  dropTarget,
  '| batch:',
  batchSize,
);

const sourceClient = new MongoClient(sourceUri);
const targetClient = new MongoClient(targetUri);

try {
  await sourceClient.connect();
  await targetClient.connect();

  const sourceDb = sourceClient.db();
  const targetDb = targetClient.db();

  const colls = await sourceDb
    .listCollections({ type: 'collection' })
    .toArray();

  const names = colls
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'));

  if (names.length === 0) {
    console.log('Nenhuma collection de usuário na origem.');
    process.exit(0);
  }

  for (const name of names) {
    const src = sourceDb.collection(name);
    const total = await src.countDocuments();
    console.log(`\n[${name}] documentos na origem: ${total}`);

    if (dryRun) continue;

    const dst = targetDb.collection(name);

    if (dropTarget) {
      await dst.drop().catch(() => {});
    }

    let copied = 0;
    const cursor = src.find({});

    let batch = [];
    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= batchSize) {
        const ops = batch.map((d) => ({
          replaceOne: {
            filter: { _id: d._id },
            replacement: d,
            upsert: true,
          },
        }));
        await dst.bulkWrite(ops, { ordered: false });
        copied += batch.length;
        batch = [];
      }
    }
    if (batch.length > 0) {
      const ops = batch.map((d) => ({
        replaceOne: {
          filter: { _id: d._id },
          replacement: d,
          upsert: true,
        },
      }));
      await dst.bulkWrite(ops, { ordered: false });
      copied += batch.length;
    }

    const destCount = await dst.countDocuments();
    console.log(`[${name}] escritos (replaceOne upsert): ${copied} | no destino agora: ${destCount}`);
  }

  console.log('\nConcluído.');
} finally {
  await sourceClient.close();
  await targetClient.close();
}

process.exit(0);
