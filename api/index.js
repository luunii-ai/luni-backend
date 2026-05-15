/**
 * Entrada serverless na Vercel: reutiliza a mesma app Express que no `npm start`.
 * Variáveis de ambiente vêm do painel da Vercel (não use .env em produção).
 *
 * Importante: o handler precisa aguardar o fim da resposta — se a função async
 * resolver antes do Express enviar o body, a Vercel encerra o runtime e dá 500.
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
  try {
    const app = await getApp();
    await new Promise((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      res.once('finish', done);
      res.once('close', done);
      try {
        app(req, res, (err) => {
          if (err) fail(err);
        });
      } catch (e) {
        fail(e);
      }
    });
  } catch (err) {
    console.error('[api] handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        message: 'Erro ao processar o pedido',
        detail: process.env.VERCEL ? undefined : String(err?.message ?? err),
      });
    }
  }
}
