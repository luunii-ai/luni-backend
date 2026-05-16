import { Router } from 'express';
import { createPartnerTestUser, findUserByEmail, userToPublic } from '../services/users.js';
import { sendPartnerTestWelcomeEmail } from '../services/email.js';

export function createAdminRouter(requireAdmin) {
  const r = Router();
  r.use(requireAdmin);

  r.post('/partner-users', async (req, res) => {
    try {
      const {
        email,
        name,
        clinic,
        password,
        simulationCredits,
        previewCredits,
        partnerTestExpiresAt,
        partnerTestDurationDays,
      } = req.body || {};
      const em = String(email || '').toLowerCase().trim();
      const nm = String(name || '').trim();
      if (!em || !nm) {
        res.status(400).json({ message: 'email e name são obrigatórios' });
        return;
      }
      const existing = await findUserByEmail(em);
      if (existing) {
        res.status(409).json({ message: 'Já existe uma conta com este e-mail' });
        return;
      }
      const { user, plainPassword } = await createPartnerTestUser({
        name: nm,
        clinic,
        email: em,
        password: password != null && String(password).length > 0 ? password : undefined,
        simulationCredits,
        previewCredits,
        partnerTestExpiresAt,
        partnerTestDurationDays,
      });
      if (plainPassword) {
        await sendPartnerTestWelcomeEmail({
          to: em,
          tempPassword: plainPassword,
          loginUrl: process.env.SUBSCRIPTION_WELCOME_LOGIN_URL?.trim() || undefined,
        });
      }
      res.status(201).json({ user: userToPublic(user) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao criar conta parceiro' });
    }
  });

  return r;
}
