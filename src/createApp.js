import express from 'express';
import cors from 'cors';
import { connectDb } from './adapters/db.js';
import { createRequireAuth } from './middleware/auth.js';
import { createAuthRouter, createMeRouter } from './routes/auth.js';
import { createProceduresRouter } from './routes/procedures.js';
import { createPatientsRouter } from './routes/patients.js';
import { createSimulationsRouter } from './routes/simulations.js';
import { createPricingBasesRouter } from './routes/pricingBases.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createEnhancePostRouter } from './routes/enhance.js';
import { createEnhancePairsRouter } from './routes/enhancePairs.js';
import { createDemoRouter } from './routes/demo.js';
import { createSubscriptionsRouter } from './routes/subscriptions.js';
import { createAdminRouter } from './routes/admin.js';
import { createRequireAdmin } from './middleware/admin.js';
import { createPartnerTestLockGuard } from './middleware/partnerTestLock.js';
import { stripeWebhookHandler } from './routes/stripeWebhook.js';
import { seedProceduresIfEmpty } from './services/procedures.js';

/**
 * Monta a app Express (Mongo + rotas). Usada em `server.js` (local) e em `api/index.js` (Vercel).
 */
export async function createApp() {
  const MONGODB_URI = process.env.MONGODB_URI;
  const JWT_SECRET = process.env.JWT_SECRET;
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080,http://localhost:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!MONGODB_URI || !JWT_SECRET) {
    throw new Error('Defina MONGODB_URI e JWT_SECRET');
  }

  await connectDb(MONGODB_URI);
  // Upsert idempotente do catálogo (novos slugs em bases já populadas).
  await seedProceduresIfEmpty();

  const app = express();
  if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }
  app.use(
    cors({
      origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
      credentials: true,
    }),
  );

  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    (req, res) => {
      void stripeWebhookHandler(req, res);
    },
  );

  app.use(express.json({ limit: '2mb' }));

  const requireAuth = createRequireAuth(JWT_SECRET);
  const requireAdmin = createRequireAdmin();
  const partnerTestLockGuard = createPartnerTestLockGuard(JWT_SECRET);
  app.use(partnerTestLockGuard);

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/demo', createDemoRouter());

  app.use(createEnhancePostRouter(requireAuth));

  app.use('/api/admin', createAdminRouter(requireAdmin));
  app.use('/api/subscriptions', createSubscriptionsRouter(requireAuth));
  app.use('/api/auth', createAuthRouter(JWT_SECRET));
  app.use('/api', createMeRouter(JWT_SECRET, requireAuth));
  app.use('/api', createProceduresRouter(requireAuth));
  app.use('/api', createPatientsRouter(requireAuth));
  app.use('/api', createSimulationsRouter(requireAuth));
  app.use('/api', createPricingBasesRouter(requireAuth));
  app.use('/api', createDashboardRouter(requireAuth));
  app.use('/api', createEnhancePairsRouter(requireAuth));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: 'Erro interno' });
  });

  return app;
}
