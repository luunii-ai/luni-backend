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
  };
}

export async function listProcedures() {
  const docs = await Procedure.find().sort({ slug: 1 }).lean();
  return docs.map((d) => procedureToDto(d));
}

/** Garante catálogo se a collection estiver vazia. */
export async function seedProceduresIfEmpty() {
  const count = await Procedure.countDocuments();
  if (count > 0) return;
  await Procedure.insertMany(proceduresCatalog);
}
