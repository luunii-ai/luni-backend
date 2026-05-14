import mongoose from 'mongoose';

/** Evita processar o mesmo evento Stripe duas vezes (retries). */
const schema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true },
);

export const ProcessedStripeEvent = mongoose.model('ProcessedStripeEvent', schema);
