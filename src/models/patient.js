import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    notes: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    lastVisit: { type: Date, default: null },
    photoConsentAt: { type: Date, default: null },
    photoConsentVersion: { type: String, default: '' },
    photoConsentMethod: {
      type: String,
      enum: ['attested_by_professional'],
      default: 'attested_by_professional',
    },
    photoConsentedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

patientSchema.index({ userId: 1, email: 1 });

export const Patient = mongoose.model('Patient', patientSchema);
