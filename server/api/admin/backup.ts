import { createBackup, restoreBackup } from '../../utils/backups'
import { VacancyValidationError } from '../../utils/vacancies'

export default defineEventHandler(async (event) => {
  try {
    if (event.method === 'GET') {
      setHeader(event, 'content-type', 'application/json; charset=utf-8')
      setHeader(event, 'content-disposition', `attachment; filename="ttc-linkedin-backup-${Date.now()}.json"`)
      return await createBackup()
    }

    if (event.method === 'POST') {
      return await restoreBackup(await readBody(event))
    }

    throw createError({ statusCode: 405, statusMessage: 'Metodo nao permitido.' })
  } catch (error) {
    if (error instanceof VacancyValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
