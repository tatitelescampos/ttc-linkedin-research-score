import { stopSourcingRun } from '../../../../../utils/sourcingRuns'
import { VacancyValidationError } from '../../../../../utils/vacancies'

export default defineEventHandler(async (event) => {
  const vacancyId = Number(getRouterParam(event, 'id'))
  const runId = Number(getRouterParam(event, 'runId'))

  try {
    if (event.method === 'POST') {
      const body = await readBody(event).catch(() => ({})) as { reason?: unknown }
      return await stopSourcingRun(vacancyId, runId, body.reason)
    }

    throw createError({ statusCode: 405, statusMessage: 'Metodo nao permitido.' })
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
