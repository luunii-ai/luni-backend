import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    clinic: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    notifEmail: { type: Boolean, default: true },
    notifSms: { type: Boolean, default: false },
    firstAccess: { type: Boolean, default: true },
    stripeCustomerId: { type: String, trim: true, sparse: true, unique: true },
    stripeSubscriptionId: { type: String, trim: true, sparse: true, unique: true },
    subscriptionStatus: { type: String, default: '', trim: true },
    trialEndsAt: { type: Date, default: null },
    simulationMonthlyQuota: { type: Number, default: 0 },
    simulationCreditsRemaining: { type: Number, default: 0 },
    simulationQuotaPeriodKey: { type: String, default: '' },
    previewMonthlyQuota: { type: Number, default: 0 },
    previewCreditsRemaining: { type: Number, default: 0 },
    previewQuotaPeriodKey: { type: String, default: '' },
    /** official: cliente normal; partner_test: conta parceiro/influenciador (cota fixa, sem assinatura). */
    accountType: {
      type: String,
      enum: ['official', 'partner_test'],
      default: 'official',
    },
    /** Só partner_test: fim do período de teste (UTC). null = sem limite de tempo, só cota. */
    partnerTestExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
