import { eq } from 'drizzle-orm'
import { sourcingRuns, vacancyAnalysisRuns } from '../database/schema'
import { db as defaultDb } from './db'
import { VacancyValidationError } from './vacancies'

type Database = typeof defaultDb

const toCents = (value: string | null) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}

export const getVacancyCostSummary = async (vacancyId: number, database: Database = defaultDb) => {
  if (!Number.isInteger(vacancyId) || vacancyId < 1) {
    throw new VacancyValidationError('Identificador da vaga invalido.')
  }

  const analysisRuns = await database.select().from(vacancyAnalysisRuns).where(eq(vacancyAnalysisRuns.vacancyId, vacancyId))
  const runs = await database.select().from(sourcingRuns).where(eq(sourcingRuns.vacancyId, vacancyId))
  const analysisCents = analysisRuns.reduce((sum, run) => sum + toCents(run.costUsd), 0)
  const apifyEstimatedCents = runs.filter(run => run.mode === 'apify').reduce((sum, run) => sum + Math.max(run.returnedCount, run.profileLimit) * 2, 0)
  const totalCents = analysisCents + apifyEstimatedCents

  return {
    currency: 'USD',
    totalUsd: (totalCents / 100).toFixed(2),
    analysisUsd: (analysisCents / 100).toFixed(2),
    apifyEstimatedUsd: (apifyEstimatedCents / 100).toFixed(2),
    events: [
      ...analysisRuns.map(run => ({ source: `analysis:${run.source}`, status: run.status, amountUsd: run.costUsd ?? '0.00', createdAt: run.createdAt })),
      ...runs.filter(run => run.mode === 'apify').map(run => ({ source: 'apify:sourcing', status: run.status, amountUsd: ((Math.max(run.returnedCount, run.profileLimit) * 2) / 100).toFixed(2), createdAt: run.createdAt }))
    ]
  }
}
