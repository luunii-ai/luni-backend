import mongoose from 'mongoose';

/**
 * Conecta ao MongoDB (MONGODB_URI).
 * @param {string} uri
 */
export async function connectDb(uri) {
  await mongoose.connect(uri);
}
