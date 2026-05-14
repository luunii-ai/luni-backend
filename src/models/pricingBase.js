import mongoose from 'mongoose';

const additionalCostsSchema = new mongoose.Schema(
  {
    supplies: { type: Number, default: 0 },
    ppeAndHygiene: { type: Number, default: 0 },
    cardFee: { type: Number, default: 0 },
    fixedClinicShare: { type: Number, default: 0 },
  },
  { _id: false },
);

const pricingBaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    procedureId: { type: String, required: true, trim: true },
    desiredMargin: { type: Number, default: 35 },
    estimatedUnits: { type: Number, default: 20 },
    actualUnits: { type: Number, default: 20 },
    costPerUnit: { type: Number, default: 15 },
    botoxVialPrice: { type: Number, default: null },
    botoxPointsPerVial: { type: Number, default: null },
    monthlyPatients: { type: Number, default: 30 },
    additionalCosts: { type: additionalCostsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

// One base per user+procedure pair.
pricingBaseSchema.index({ userId: 1, procedureId: 1 }, { unique: true });

export const PricingBase = mongoose.model('PricingBase', pricingBaseSchema);
