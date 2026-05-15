import 'dotenv/config';
import { createApp } from './createApp.js';

const PORT = Number(process.env.PORT) || 3001;

try {
  const app = await createApp();
  app.listen(PORT, () => {
    console.log(`API em http://localhost:${PORT}`);
  });
} catch (e) {
  console.error(e?.message ?? e);
  process.exit(1);
}
