import { exportCandidatesCsv, listExportableCandidates } from '../../../../utils/candidateExports'
import { VacancyValidationError } from '../../../../utils/vacancies'

export default defineEventHandler(async (event) => {
  const vacancyId = Number(getRouterParam(event, 'id'))

  try {
    const candidates = await listExportableCandidates(vacancyId)
    const query = getQuery(event)
    if (query.format === 'json') return candidates

    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename="vacancy-${vacancyId}-candidates.csv"`)
    return exportCandidatesCsv(candidates)
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
