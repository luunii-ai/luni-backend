import { Simulation } from '../models/simulation.js';
import { Patient } from '../models/patient.js';

/**
 * Agregados para o painel. Taxa de conversão baseada em vendas reais (saleCompleted).
 */
export async function getDashboardSummary(userId) {
  const [totalSimulations, totalPatients, proceduresThisMonth, totalSales] = await Promise.all([
    Simulation.countDocuments({ userId }),
    Patient.countDocuments({ userId }),
    Simulation.countDocuments({
      userId,
      date: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    }),
    Simulation.countDocuments({ userId, saleCompleted: true }),
  ]);

  const totalNoSales = totalSimulations - totalSales;
  const conversionRate = totalSimulations > 0 ? Math.round((totalSales / totalSimulations) * 100) : 0;

  const recent = await Simulation.find({ userId })
    .sort({ date: -1 })
    .limit(5)
    .lean();

  const recentDtos = recent.map((doc) => ({
    id: String(doc._id),
    patientName: doc.patientName,
    procedure: doc.procedure,
    date: doc.date instanceof Date ? doc.date.toISOString() : new Date(doc.date).toISOString(),
    points: doc.points != null ? doc.points : undefined,
    saleCompleted: doc.saleCompleted === true,
  }));

  return {
    totalSimulations,
    totalPatients,
    proceduresThisMonth,
    totalSales,
    totalNoSales,
    conversionRate,
    recentSimulations: recentDtos,
  };
}
