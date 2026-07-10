import { getSourcingRuns, runMockSourcing } from '../../../../utils/sourcingRuns'
import { VacancyValidationError } from '../../../../utils/vacancies'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  try {
    if (event.method === 'GET') {
      return await getSourcingRuns(id)
    }

    if (event.method === 'POST') {
      return await runMockSourcing(id, await readBody(event))
    }

    throw createError({ statusCode: 405, statusMessage: 'Metodo nao permitido.' })
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
