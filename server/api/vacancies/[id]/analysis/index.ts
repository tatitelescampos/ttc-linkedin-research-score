import { generateMockVacancyAnalysis, generateOpenRouterVacancyAnalysis, getVacancyAnalysis, updateVacancyAnalysis } from '../../../../utils/vacancyAnalysis'
import { VacancyValidationError } from '../../../../utils/vacancies'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  try {
    if (event.method === 'GET') {
      return await getVacancyAnalysis(id)
    }

    if (event.method === 'POST') {
      const body = await readBody(event).catch(() => ({})) as { mode?: string }
      return body.mode === 'openrouter' ? await generateOpenRouterVacancyAnalysis(id) : await generateMockVacancyAnalysis(id)
    }

    if (event.method === 'PUT') {
      return await updateVacancyAnalysis(id, await readBody(event))
    }

    throw createError({ statusCode: 405, statusMessage: 'Metodo nao permitido.' })
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
