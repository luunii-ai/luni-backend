import mongoose from 'mongoose';

const simulationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    patientName: { type: String, required: true, trim: true },
    patientPhone: { type: String, default: '' },
    patientEmail: { type: String, default: '' },
    procedure: { type: String, required: true },
    procedureId: { type: String, default: '' },
    date: { type: Date, required: true },
    intensity: { type: Number, default: 0 },
    points: { type: Number, default: null },
    costPerPoint: { type: Number, default: null },
    image: { type: String, default: '' },
    /** UUID do par original/after no R2 (EnhancePair) */
    enhancePairId: { type: String, default: '' },
    activePointIds: { type: [Number], default: [] },
    /** Indica se a simulação resultou em venda real do procedimento. */
    saleCompleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

simulationSchema.index({ userId: 1, date: -1 });
simulationSchema.index({ userId: 1, patientId: 1 });

export const Simulation = mongoose.model('Simulation', simulationSchema);
