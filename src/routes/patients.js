import { Router } from 'express';
import {
  listPatients,
  getPatientById,
  createPatient,
  updatePatient,
  findOrCreatePatientByContact,
  findPatientByPhone,
  deletePatient,
  recordPatientPhotoConsent,
} from '../services/patients.js';
import { listSimulations } from '../services/simulations.js';

export function createPatientsRouter(requireAuth) {
  const r = Router();
  r.use(requireAuth);

  r.get('/patients', async (req, res) => {
    try {
      const q = req.query.q;
      const list = await listPatients(req.userId, q);
      res.json(list);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao listar pacientes' });
    }
  });

  r.post('/patients', async (req, res) => {
    try {
      const created = await createPatient(req.userId, req.body || {});
      res.status(201).json(created);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao criar paciente' });
    }
  });

  /** Busca por e-mail ou cria paciente (fluxo nova simulação). */
  r.post('/patients/ensure', async (req, res) => {
    try {
      const { name, email, phone, recordPhotoConsent } = req.body || {};
      const id = await findOrCreatePatientByContact(req.userId, { name, email, phone, recordPhotoConsent: recordPhotoConsent === true });
      if (recordPhotoConsent === true) {
        await recordPatientPhotoConsent(req.userId, String(id));
      }
      const p = await getPatientById(req.userId, String(id));
      res.json(p);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao garantir paciente' });
    }
  });

  r.post('/patients/:id/photo-consent', async (req, res) => {
    try {
      const { consentVersion } = req.body || {};
      const result = await recordPatientPhotoConsent(req.userId, req.params.id, { consentVersion });
      if (result.error) {
        res.status(result.status || 400).json({ message: result.error });
        return;
      }
      res.json(result.patient);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao registrar consentimento' });
    }
  });

  r.get('/patients/phone-lookup', async (req, res) => {
    try {
      const phone = String(req.query.phone || '').trim();
      if (!phone) {
        res.json({ exists: false });
        return;
      }
      const patient = await findPatientByPhone(req.userId, phone);
      res.json({ exists: Boolean(patient), patient: patient || undefined });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao verificar telefone' });
    }
  });

  r.get('/patients/:id', async (req, res) => {
    try {
      const p = await getPatientById(req.userId, req.params.id);
      if (!p) {
        res.status(404).json({ message: 'Paciente não encontrado' });
        return;
      }
      res.json(p);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao buscar paciente' });
    }
  });

  r.patch('/patients/:id', async (req, res) => {
    try {
      const p = await updatePatient(req.userId, req.params.id, req.body || {});
      if (!p) {
        res.status(404).json({ message: 'Paciente não encontrado' });
        return;
      }
      res.json(p);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao atualizar paciente' });
    }
  });

  r.delete('/patients/:id', async (req, res) => {
    try {
      const result = await deletePatient(req.userId, req.params.id);
      if (result.error) {
        res.status(result.status || 400).json({ message: result.error });
        return;
      }
      res.status(204).send();
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao excluir paciente' });
    }
  });

  r.get('/patients/:id/simulations', async (req, res) => {
    try {
      const list = await listSimulations(req.userId, { patientId: req.params.id });
      res.json(list);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao listar simulações do paciente' });
    }
  });

  return r;
}
