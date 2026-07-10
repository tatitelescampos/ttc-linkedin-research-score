import { setCandidateDecision } from '../../../../../utils/candidateDecisions'
import { VacancyValidationError } from '../../../../../utils/vacancies'

export default defineEventHandler(async (event) => {
  const vacancyId = Number(getRouterParam(event, 'id'))
  const evaluationId = Number(getRouterParam(event, 'evaluationId'))

  try {
    if (event.method === 'PUT') {
      return await setCandidateDecision(vacancyId, evaluationId, await readBody(event))
    }

    throw createError({ statusCode: 405, statusMessage: 'Metodo nao permitido.' })
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
