import { Router } from 'express';
import { listProcedures } from '../services/procedures.js';

export function createProceduresRouter(requireAuth) {
  const r = Router();
  r.use(requireAuth);

  r.get('/procedures', async (req, res) => {
    try {
      const raw = req.query?.practiceProfile;
      const practiceProfile =
        typeof raw === 'string' && (raw === 'clinic' || raw === 'surgeon') ? raw : undefined;
      const list = await listProcedures({ practiceProfile });
      res.json(list);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao listar procedimentos' });
    }
  });

  return r;
}
