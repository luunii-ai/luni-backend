import { Router } from 'express';
import { listProcedures } from '../services/procedures.js';

export function createProceduresRouter(requireAuth) {
  const r = Router();
  r.use(requireAuth);

  r.get('/procedures', async (_req, res) => {
    try {
      const list = await listProcedures();
      res.json(list);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao listar procedimentos' });
    }
  });

  return r;
}
