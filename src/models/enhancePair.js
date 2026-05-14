import mongoose from 'mongoose';

const enhancePairSchema = new mongoose.Schema(
  {
    pairId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalKey: { type: String, required: true },
    afterKey: { type: String, required: true },
    originalContentType: { type: String, default: 'image/jpeg' },
    afterContentType: { type: String, default: 'image/png' },
  },
  { timestamps: true },
);

enhancePairSchema.index({ userId: 1, pairId: 1 });

export const EnhancePair = mongoose.model('EnhancePair', enhancePairSchema);
