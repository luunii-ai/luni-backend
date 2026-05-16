/**
 * Disparo único de teste via Resend.
 * Uso: node src/scripts/sendTestEmail.js [destino@email.com]
 * Requer no .env: RESEND_API_KEY, EMAIL_FROM (domínio verificado no Resend).
 */
import 'dotenv/config';
import { Resend } from 'resend';

const to = (process.argv[2] || '').trim() || 'l_campioto@hotmail.com';
const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.EMAIL_FROM?.trim();

if (!apiKey) {
  console.error('Defina RESEND_API_KEY no .env');
  process.exit(1);
}
if (!from) {
  console.error('Defina EMAIL_FROM no .env (ex.: Nome <noreply@seudominio.com>)');
  process.exit(1);
}

const resend = new Resend(apiKey);
const subject = 'Teste Luni — disparo Resend';
const text = [
  'Olá,',
  '',
  'Este é um e-mail de teste enviado pelo backend Luni via Resend.',
  `Destinatário: ${to}`,
  `Remetente configurado: ${from}`,
  '',
  `Enviado em: ${new Date().toISOString()}`,
].join('\n');

try {
  const { data, error } = await resend.emails.send({ from, to, subject, text });
  if (error) {
    console.error('Resend retornou erro:', error);
    process.exit(1);
  }
  console.log('OK — e-mail enviado. id:', data?.id ?? data);
} catch (err) {
  console.error('Falha:', err?.message ?? err);
  process.exit(1);
}
