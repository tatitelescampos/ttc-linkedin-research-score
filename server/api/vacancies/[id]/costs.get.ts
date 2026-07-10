import { getVacancyCostSummary } from '../../../utils/costs'
import { VacancyValidationError } from '../../../utils/vacancies'

export default defineEventHandler(async (event) => {
  const vacancyId = Number(getRouterParam(event, 'id'))

  try {
    return await getVacancyCostSummary(vacancyId)
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
