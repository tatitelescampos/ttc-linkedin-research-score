import { getVacancy, VacancyValidationError } from '../../utils/vacancies'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  try {
    const vacancy = await getVacancy(id)

    if (!vacancy) {
      throw createError({ statusCode: 404, statusMessage: 'Vaga nao encontrada.' })
    }

    return vacancy
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
