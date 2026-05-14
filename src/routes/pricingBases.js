import { Router } from 'express';
import { getPricingBase, upsertPricingBase } from '../services/pricingBases.js';

export function createPricingBasesRouter(requireAuth) {
  const r = Router();
  r.use(requireAuth);

  r.get('/pricing-bases/:procedureId', async (req, res) => {
    try {
      const { procedureId } = req.params;
      if (!procedureId || !procedureId.trim()) {
        res.status(400).json({ message: 'procedureId é obrigatório' });
        return;
      }
      const pricingBase = await getPricingBase(req.userId, procedureId.trim());
      res.json({ pricingBase });
    } catch (e) {
      console.error('[pricing-bases GET]', e);
      res.status(500).json({ message: 'Erro ao buscar simulação base' });
    }
  });

  r.put('/pricing-bases/:procedureId', async (req, res) => {
    try {
      const { procedureId } = req.params;
      if (!procedureId || !procedureId.trim()) {
        res.status(400).json({ message: 'procedureId é obrigatório' });
        return;
      }
      const pricingBase = await upsertPricingBase(req.userId, procedureId.trim(), req.body || {});
      res.json({ pricingBase });
    } catch (e) {
      console.error('[pricing-bases PUT]', e);
      res.status(500).json({ message: 'Erro ao salvar simulação base' });
    }
  });

  return r;
}
