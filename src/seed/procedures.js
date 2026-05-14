import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../adapters/db.js';
import { seedProceduresIfEmpty } from '../services/procedures.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI ausente');
  process.exit(1);
}

await connectDb(uri);
await seedProceduresIfEmpty();
console.log('Seed de procedimentos OK');
await mongoose.disconnect();
process.exit(0);
