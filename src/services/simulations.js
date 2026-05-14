import mongoose from 'mongoose';
import { Simulation } from '../models/simulation.js';
import { Patient } from '../models/patient.js';
import { findOrCreatePatientByContact } from './patients.js';

const MAX_IMAGE_LEN = 120_000;

function trimImage(s) {
  if (!s || typeof s !== 'string') return '';
  return s.length > MAX_IMAGE_LEN ? '' : s;
}

export function simulationToDto(doc) {
  return {
    id: String(doc._id),
    patientId: String(doc.patientId),
    patientName: doc.patientName,
    patientPhone: doc.patientPhone || undefined,
    patientEmail: doc.patientEmail || undefined,
    procedure: doc.procedure,
    procedureId: doc.procedureId || undefined,
    date: doc.date instanceof Date ? doc.date.toISOString() : new Date(doc.date).toISOString(),
    intensity: doc.intensity,
    points: doc.points != null ? doc.points : undefined,
    costPerPoint: doc.costPerPoint != null ? doc.costPerPoint : undefined,
    image: doc.image || undefined,
    enhancePairId: doc.enhancePairId || undefined,
    activePointIds: Array.isArray(doc.activePointIds) && doc.activePointIds.length ? doc.activePointIds : undefined,
    saleCompleted: doc.saleCompleted === true,
  };
}

export async function listSimulations(userId, { patientId, procedure, from, to }) {
  const filter = { userId };
  if (patientId && mongoose.isValidObjectId(patientId)) filter.patientId = patientId;
  if (procedure && String(procedure).trim()) filter.procedure = String(procedure).trim();

  if (from || to) {
    filter.date = {};
    if (from) {
      const [y, m, d] = String(from).split('-').map(Number);
      if (y && m && d) filter.date.$gte = new Date(y, m - 1, d);
    }
    if (to) {
      const [y, m, d] = String(to).split('-').map(Number);
      if (y && m && d) filter.date.$lte = new Date(y, m - 1, d, 23, 59, 59, 999);
    }
  }

  const docs = await Simulation.find(filter).sort({ date: -1 }).lean();
  return docs.map(simulationToDto);
}

export async function createSimulation(userId, body) {
  /** Crédito já é consumido em POST /v1/enhance ao gerar a IA. Salvar no histórico não debita de novo. */

  let patientObjectId = null;
  if (body.patientId && mongoose.isValidObjectId(body.patientId)) {
    const p = await Patient.findOne({ _id: body.patientId, userId });
    if (!p) return { error: 'Paciente não encontrado', status: 404 };
    patientObjectId = p._id;
  } else if (body.patient && (body.patient.name || body.patient.email || body.patient.phone)) {
    patientObjectId = await findOrCreatePatientByContact(userId, {
      name: body.patient.name,
      email: body.patient.email,
      phone: body.patient.phone,
    });
  } else if (
    String(body.patientName || '').trim() ||
    String(body.patientEmail || '').trim() ||
    String(body.patientPhone || '').trim()
  ) {
    patientObjectId = await findOrCreatePatientByContact(userId, {
      name: body.patientName,
      email: body.patientEmail,
      phone: body.patientPhone,
    });
  } else {
    return { error: 'Informe patientId ou dados do paciente (patient)', status: 400 };
  }

  const patient = await Patient.findById(patientObjectId).lean();
  if (!patient || String(patient.userId) !== String(userId)) {
    return { error: 'Paciente inválido', status: 400 };
  }

  const date = body.date ? new Date(body.date) : new Date();
  const snapName = String(body.patientName ?? '').trim() || String(patient.name ?? '').trim();
  const snapPhone = String(body.patientPhone ?? '').trim() || String(patient.phone ?? '').trim();
  const snapEmail = String(body.patientEmail ?? '').trim() || String(patient.email ?? '').trim();
  const doc = await Simulation.create({
    userId,
    patientId: patientObjectId,
    patientName: snapName,
    patientPhone: snapPhone,
    patientEmail: snapEmail,
    procedure: String(body.procedure || '').trim(),
    procedureId: String(body.procedureId || '').trim(),
    date,
    intensity: Number(body.intensity) || 0,
    points: body.points != null ? Number(body.points) : null,
    costPerPoint: body.costPerPoint != null ? Number(body.costPerPoint) : null,
    image: trimImage(body.image),
    enhancePairId: String(body.enhancePairId || '').trim(),
    activePointIds: Array.isArray(body.activePointIds) ? body.activePointIds.map(Number).filter((n) => !Number.isNaN(n)) : [],
  });

  await Patient.updateOne({ _id: patientObjectId }, { $set: { lastVisit: date } });

  return { simulation: simulationToDto(doc.toObject()) };
}

export async function deleteSimulation(userId, simulationId) {
  if (!mongoose.isValidObjectId(simulationId)) return { error: 'Simulação inválida', status: 400 };
  const doc = await Simulation.findOneAndDelete({ _id: simulationId, userId });
  if (!doc) return { error: 'Simulação não encontrada', status: 404 };
  return { ok: true };
}

/** Atualiza campos permitidos de uma simulação (allowlist: saleCompleted). */
export async function patchSimulation(userId, simulationId, patch) {
  if (!mongoose.isValidObjectId(simulationId)) return { error: 'Simulação inválida', status: 400 };
  const allowed = ['saleCompleted'];
  const update = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  if (Object.keys(update).length === 0) return { error: 'Nenhum campo válido para atualizar', status: 400 };
  const doc = await Simulation.findOneAndUpdate(
    { _id: simulationId, userId },
    { $set: update },
    { new: true },
  );
  if (!doc) return { error: 'Simulação não encontrada', status: 404 };
  return { simulation: simulationToDto(doc.toObject()) };
}
