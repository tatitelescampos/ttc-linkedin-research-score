import { extractDigitalPdfText, PdfExtractionError } from '../../utils/pdfExtraction'

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file')

  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: 'Selecione um PDF para extrair.' })
  }

  try {
    return await extractDigitalPdfText({
      filename: file.filename,
      type: file.type,
      data: file.data
    })
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
