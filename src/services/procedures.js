import { Procedure } from '../models/procedure.js';
import { proceduresCatalog } from '../seed/proceduresCatalog.js';

export function procedureToDto(doc) {
  return {
    id: doc.slug,
    name: doc.name,
    description: doc.description,
    icon: doc.icon,
    hasPoints: doc.hasPoints,
    defaultPoints: doc.defaultPoints,
    costPerPoint: doc.costPerPoint,
    pricePerPoint: doc.pricePerPoint,
    practiceProfileScope: doc.practiceProfileScope,
    defaultEnhanceRegions: doc.defaultEnhanceRegions || '',
  };
}

/**
 * @param {{ practiceProfile?: string }} [opts]
 * `practiceProfile`: `clinic` | `surgeon` — filtra a lista; omitido = todos (precificação, histórico).
 */
export async function listProcedures(opts = {}) {
  const pp = opts.practiceProfile;
  const filter =
    pp === 'clinic' || pp === 'surgeon' ? { practiceProfileScope: pp } : {};
  const docs = await Procedure.find(filter).sort({ slug: 1 }).lean();
  return docs.map((d) => procedureToDto(d));
}

/** Upsert idempotente por `slug` — bases já populadas recebem novos itens do catálogo. */
export async function upsertProceduresFromCatalog() {
  for (const item of proceduresCatalog) {
    await Procedure.updateOne(
      { slug: item.slug },
      {
        $set: {
          slug: item.slug,
          name: item.name,
          description: item.description,
          icon: item.icon,
          hasPoints: item.hasPoints,
          defaultPoints: item.defaultPoints,
          costPerPoint: item.costPerPoint,
          pricePerPoint: item.pricePerPoint,
          practiceProfileScope: item.practiceProfileScope,
          defaultEnhanceRegions: item.defaultEnhanceRegions ?? '',
        },
      },
      { upsert: true },
    );
  }
}

/** Garante catálogo completo (inclui slugs novos sem apagar documentos existentes). */
export async function seedProceduresIfEmpty() {
  await upsertProceduresFromCatalog();
}
