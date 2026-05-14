import { Router } from 'express';
import { getDashboardSummary } from '../services/dashboard.js';

export function createDashboardRouter(requireAuth) {
  const r = Router();
  r.use(requireAuth);

  r.get('/dashboard/summary', async (req, res) => {
    try {
      const summary = await getDashboardSummary(req.userId);
      res.json(summary);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao carregar painel' });
    }
  });

  return r;
}
