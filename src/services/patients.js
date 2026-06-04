import mongoose from 'mongoose';
import { Patient } from '../models/patient.js';
import { Simulation } from '../models/simulation.js';
import { LEGAL_VERSION } from '../legal/version.js';

export function patientToDto(doc, proceduresSimulated = 0) {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email || '',
    phone: doc.phone || '',
    lastVisit: doc.lastVisit ? doc.lastVisit.toISOString().slice(0, 10) : '',
    proceduresSimulated,
    notes: doc.notes || '',
    avatarUrl: doc.avatarUrl || undefined,
    photoConsentAt: doc.photoConsentAt ? doc.photoConsentAt.toISOString() : undefined,
    photoConsentVersion: doc.photoConsentVersion || undefined,
  };
}

export function patientHasPhotoConsent(patient, version = LEGAL_VERSION) {
  if (!patient?.photoConsentAt) return false;
  const v = String(patient.photoConsentVersion || '').trim();
  return !v || v === String(version).trim();
}

export async function recordPatientPhotoConsent(userId, patientId, { consentVersion = LEGAL_VERSION } = {}) {
  if (!mongoose.isValidObjectId(patientId)) return { error: 'Paciente inválido', status: 400 };
  const now = new Date();
  const doc = await Patient.findOneAndUpdate(
    { _id: patientId, userId },
    {
      $set: {
        photoConsentAt: now,
        photoConsentVersion: String(consentVersion).trim() || LEGAL_VERSION,
        photoConsentMethod: 'attested_by_professional',
        photoConsentedByUserId: userId,
      },
    },
    { new: true },
  ).lean();
  if (!doc) return { error: 'Paciente não encontrado', status: 404 };
  const n = await Simulation.countDocuments({ userId, patientId: doc._id });
  return { patient: patientToDto(doc, n) };
}

export async function countSimulationsForPatient(userId, patientId) {
  return Simulation.countDocuments({ userId, patientId });
}

export async function listPatients(userId, q) {
  const filter = { userId };
  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const patients = await Patient.find(filter).sort({ updatedAt: -1 }).lean();
  const out = [];
  for (const p of patients) {
    const pid = p._id;
    const n = await Simulation.countDocuments({ userId, patientId: pid });
    out.push(patientToDto(p, n));
  }
  return out;
}

export async function getPatientById(userId, patientId) {
  if (!mongoose.isValidObjectId(patientId)) return null;
  const p = await Patient.findOne({ _id: patientId, userId }).lean();
  if (!p) return null;
  const n = await Simulation.countDocuments({ userId, patientId: p._id });
  return patientToDto(p, n);
}

/** Paciente existente com o mesmo telefone (apenas dígitos), para aviso antes de agrupar simulações. */
export async function findPatientByPhone(userId, phone) {
  const ph = String(phone || '').trim();
  if (!ph) return null;
  const p = await Patient.findOne({ userId, phone: ph }).lean();
  if (!p) return null;
  const n = await Simulation.countDocuments({ userId, patientId: p._id });
  return patientToDto(p, n);
}

export async function createPatient(userId, body) {
  const doc = await Patient.create({
    userId,
    name: String(body.name || '').trim(),
    email: String(body.email || '').toLowerCase().trim(),
    phone: String(body.phone || '').trim(),
    notes: String(body.notes || ''),
    avatarUrl: String(body.avatarUrl || ''),
    lastVisit: body.lastVisit ? new Date(body.lastVisit) : null,
  });
  return getPatientById(userId, doc._id);
}

export async function updatePatient(userId, patientId, body) {
  if (!mongoose.isValidObjectId(patientId)) return null;
  const patch = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.email !== undefined) patch.email = String(body.email).toLowerCase().trim();
  if (body.phone !== undefined) patch.phone = String(body.phone).trim();
  if (body.notes !== undefined) patch.notes = String(body.notes);
  if (body.avatarUrl !== undefined) patch.avatarUrl = String(body.avatarUrl);
  if (body.lastVisit !== undefined) patch.lastVisit = body.lastVisit ? new Date(body.lastVisit) : null;

  const doc = await Patient.findOneAndUpdate({ _id: patientId, userId }, { $set: patch }, { new: true }).lean();
  if (!doc) return null;
  const n = await Simulation.countDocuments({ userId, patientId: doc._id });
  return patientToDto(doc, n);
}

/**
 * Busca por email (mesmo user) ou cria novo paciente.
 */
export async function findOrCreatePatientByContact(userId, { name, email, phone, recordPhotoConsent = false }) {
  const em = String(email || '').toLowerCase().trim();
  const ph = String(phone || '').trim();
  if (em) {
    const existing = await Patient.findOne({ userId, email: em });
    if (existing) {
      const patch = {};
      if (name && String(name).trim()) patch.name = String(name).trim();
      if (phone !== undefined) patch.phone = ph;
      if (Object.keys(patch).length) {
        await Patient.updateOne({ _id: existing._id }, { $set: patch });
      }
      return existing._id;
    }
  }
  if (ph) {
    const byPhone = await Patient.findOne({ userId, phone: ph });
    if (byPhone) {
      const patch = {};
      if (name && String(name).trim()) patch.name = String(name).trim();
      if (em) patch.email = em;
      if (Object.keys(patch).length) {
        await Patient.updateOne({ _id: byPhone._id }, { $set: patch });
      }
      return byPhone._id;
    }
  }
  const doc = await Patient.create({
    userId,
    name: String(name || 'Paciente').trim() || 'Paciente',
    email: em,
    phone: String(phone || '').trim(),
    notes: '',
    lastVisit: new Date(),
    ...(recordPhotoConsent
      ? {
          photoConsentAt: new Date(),
          photoConsentVersion: LEGAL_VERSION,
          photoConsentMethod: 'attested_by_professional',
          photoConsentedByUserId: userId,
        }
      : {}),
  });
  return doc._id;
}

export async function deletePatient(userId, patientId) {
  if (!mongoose.isValidObjectId(patientId)) return { error: 'Paciente inválido', status: 400 };
  const p = await Patient.findOne({ _id: patientId, userId });
  if (!p) return { error: 'Paciente não encontrado', status: 404 };
  await Simulation.deleteMany({ userId, patientId: p._id });
  await Patient.deleteOne({ _id: p._id, userId });
  return { ok: true };
}
