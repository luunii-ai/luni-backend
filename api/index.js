/**
 * Entrada serverless na Vercel: reutiliza a mesma app Express que no `npm start`.
 * Variáveis de ambiente vêm do painel da Vercel (não use .env em produção).
 */
import { createApp } from '../src/createApp.js';

let cachedApp;
let initPromise;

async function getApp() {
  if (cachedApp) return cachedApp;
  if (!initPromise) {
    initPromise = createApp().then((app) => {
      cachedApp = app;
      return app;
    });
  }
  return initPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
