import { listProfileEvaluations, scoreProfilesForVacancy } from '../../../../utils/profileScoring'
import { VacancyValidationError } from '../../../../utils/vacancies'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  try {
    if (event.method === 'GET') {
      return await listProfileEvaluations(id)
    }

    if (event.method === 'POST') {
      const body = await readBody(event).catch(() => ({})) as { profileIds?: number[] }
      return await scoreProfilesForVacancy(id, { profileIds: body.profileIds })
    }

    throw createError({ statusCode: 405, statusMessage: 'Metodo nao permitido.' })
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
