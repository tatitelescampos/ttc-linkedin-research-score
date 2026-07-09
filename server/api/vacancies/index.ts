import { createVacancy, listVacancies, VacancyValidationError } from '../../utils/vacancies'

export default defineEventHandler(async (event) => {
  if (event.method === 'GET') {
    const query = getQuery(event)
    return listVacancies({ search: query.search })
  }

  if (event.method === 'POST') {
    try {
      return await createVacancy(await readBody(event))
    } catch (error) {
      if (error instanceof VacancyValidationError) {
        throw createError({ statusCode: error.statusCode, statusMessage: error.message })
      }

      throw error
    }
  }

  throw createError({ statusCode: 405, statusMessage: 'Metodo nao permitido.' })
})
