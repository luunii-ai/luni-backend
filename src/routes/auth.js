import { createHash, randomBytes } from 'crypto';
import { Router } from 'express';
import {
  findUserByEmail,
  verifyPassword,
  userToPublic,
  findUserById,
  findUserByIdWithQuotaReset,
  updateUserById,
  updateUserPassword,
  acceptUserTerms,
} from '../services/users.js';
import { LEGAL_VERSION } from '../legal/version.js';
import { signUserToken } from '../services/jwt.js';
import { PasswordResetToken } from '../models/passwordResetToken.js';
import { sendPasswordResetEmail } from '../services/email.js';

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

export function createAuthRouter(jwtSecret) {
  const r = Router();

  r.post('/signup', async (_req, res) => {
    res.status(403).json({
      message:
        'Cadastro público desativado. Assine um plano em nosso site ou utilize a conta criada pelo administrador.',
    });
  });

  r.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ message: 'E-mail e senha são obrigatórios' });
        return;
      }
      const user = await findUserByEmail(email);
      if (!user || !(await verifyPassword(user, password))) {
        res.status(401).json({ message: 'E-mail ou senha inválidos' });
        return;
      }
      const token = signUserToken(user._id, jwtSecret);
      const userWithQuota = (await findUserByIdWithQuotaReset(user._id)) || user;
      res.json({ token, user: userToPublic(userWithQuota) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao entrar' });
    }
  });

  r.post('/forgot-password', async (req, res) => {
    const GENERIC_OK = { message: 'Se este e-mail estiver cadastrado, você receberá as instruções.' };
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== 'string') {
        res.status(400).json({ message: 'E-mail é obrigatório' });
        return;
      }
      const user = await findUserByEmail(email);
      if (!user) {
        // Do not reveal whether the e-mail exists.
        res.json(GENERIC_OK);
        return;
      }

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Remove any existing token for this user before creating a new one.
      await PasswordResetToken.deleteMany({ userId: user._id });
      await PasswordResetToken.create({ userId: user._id, token: tokenHash, expiresAt });

      const baseUrl = (process.env.FRONTEND_RESET_PASSWORD_URL || '').replace(/\/$/, '');
      const resetUrl = `${baseUrl}?token=${rawToken}`;

      await sendPasswordResetEmail({ to: user.email, resetUrl });

      res.json(GENERIC_OK);
    } catch (e) {
      console.error('[forgot-password]', e);
      res.status(500).json({ message: 'Erro ao processar solicitação' });
    }
  });

  r.post('/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body || {};
      if (!token || !newPassword) {
        res.status(400).json({ message: 'Token e nova senha são obrigatórios' });
        return;
      }
      if (String(newPassword).length < 8) {
        res.status(400).json({ message: 'A senha deve ter pelo menos 8 caracteres' });
        return;
      }

      const tokenHash = hashToken(String(token));
      const record = await PasswordResetToken.findOne({
        token: tokenHash,
        expiresAt: { $gt: new Date() },
      });

      if (!record) {
        res.status(400).json({ message: 'Link inválido ou expirado.' });
        return;
      }

      await updateUserPassword(record.userId, newPassword, { firstAccess: false });
      await PasswordResetToken.deleteOne({ _id: record._id });

      res.json({ message: 'Senha redefinida com sucesso.' });
    } catch (e) {
      console.error('[reset-password]', e);
      res.status(500).json({ message: 'Erro ao redefinir senha' });
    }
  });

  return r;
}

/**
 * Campos que nunca podem ser alterados por PATCH /me (cota, Stripe, assinatura).
 * Quem pode mudar: webhooks, jobs, serviço interno — não o cliente/Postman.
 */
const PATCH_ME_FORBIDDEN_KEYS = new Set([
  'accountType',
  'partnerTestExpiresAt',
  'simulationMonthlyQuota',
  'simulationCreditsRemaining',
  'simulationQuotaPeriodKey',
  'subscriptionStatus',
  'trialEndsAt',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'passwordHash',
  'firstAccess',
  'termsAcceptedAt',
  'privacyAcceptedAt',
  'termsVersion',
  'patientDataResponsibilityAckAt',
]);

export function createMeRouter(jwtSecret, requireAuth) {
  const r = Router();
  r.use(requireAuth);

  r.get('/me', async (req, res) => {
    try {
      const user = await findUserByIdWithQuotaReset(req.userId);
      if (!user) {
        res.status(404).json({ message: 'Usuário não encontrado' });
        return;
      }
      res.json(userToPublic(user));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao carregar perfil' });
    }
  });

  r.patch('/me', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const blockedKeys = Object.keys(body).filter((k) => PATCH_ME_FORBIDDEN_KEYS.has(k));
      if (blockedKeys.length > 0) {
        res.status(400).json({
          message:
            'Não é permitido alterar cota de simulações, assinatura, Stripe ou identificadores de faturamento por esta rota.',
          blockedFields: blockedKeys,
        });
        return;
      }
      const user = await updateUserById(req.userId, body);
      if (!user) {
        res.status(404).json({ message: 'Usuário não encontrado' });
        return;
      }
      res.json(userToPublic(user));
    } catch (e) {
      if (e.code === 11000) {
        res.status(409).json({ message: 'E-mail já em uso' });
        return;
      }
      console.error(e);
      res.status(500).json({ message: 'Erro ao atualizar perfil' });
    }
  });

  r.post('/me/accept-terms', async (req, res) => {
    try {
      const { termsVersion, acceptTerms, acceptPrivacy, acceptPatientResponsibility } = req.body || {};
      const version = String(termsVersion || '').trim();
      if (version !== LEGAL_VERSION) {
        res.status(400).json({ message: 'Versão dos termos desatualizada. Recarregue a página e tente novamente.' });
        return;
      }
      const result = await acceptUserTerms(req.userId, {
        termsVersion: version,
        acceptTerms: acceptTerms === true,
        acceptPrivacy: acceptPrivacy === true,
        acceptPatientResponsibility: acceptPatientResponsibility === true,
      });
      if (result.error) {
        res.status(result.status || 400).json({ message: result.error });
        return;
      }
      res.json(userToPublic(result.user));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao registrar aceite dos termos' });
    }
  });

  r.post('/me/password', async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) {
        res.status(400).json({ message: 'Senha atual e nova senha são obrigatórias' });
        return;
      }
      if (String(newPassword).length < 8) {
        res.status(400).json({ message: 'A nova senha deve ter pelo menos 8 caracteres' });
        return;
      }

      const user = await findUserById(req.userId);
      if (!user) {
        res.status(404).json({ message: 'Usuário não encontrado' });
        return;
      }
      if (!(await verifyPassword(user, currentPassword))) {
        res.status(401).json({ message: 'Senha atual inválida' });
        return;
      }

      const updated = await updateUserPassword(user._id, newPassword, { firstAccess: false });
      if (!updated) {
        res.status(404).json({ message: 'Usuário não encontrado' });
        return;
      }

      res.json(userToPublic(updated));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Erro ao alterar senha' });
    }
  });

  return r;
}
