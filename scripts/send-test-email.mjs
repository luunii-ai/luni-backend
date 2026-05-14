import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const to = process.argv[2]?.trim();
if (!to) {
  console.error('Uso: node scripts/send-test-email.mjs <email-destino>');
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.EMAIL_FROM?.trim();

if (!apiKey || !from) {
  console.error('Defina RESEND_API_KEY e EMAIL_FROM no .env');
  process.exit(1);
}

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send({
  from,
  to,
  subject: '[Aviva] E-mail de teste',
  text: 'Este é um envio de teste do backend (Resend). Se você recebeu, a configuração está ok.',
});

if (error) {
  console.error('Resend error:', error);
  process.exit(1);
}

console.log('Enviado:', data);
