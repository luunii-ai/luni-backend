import mongoose from 'mongoose';

const procedureSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    hasPoints: { type: Boolean, default: false },
    defaultPoints: { type: Number, default: 0 },
    costPerPoint: { type: Number, default: 0 },
    pricePerPoint: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Procedure = mongoose.model('Procedure', procedureSchema);
