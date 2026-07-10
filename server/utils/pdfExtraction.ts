import { PDFParse } from 'pdf-parse'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createWorker } from 'tesseract.js'

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MIN_EXTRACTED_TEXT_LENGTH = 120
const MAX_EXTRACTED_TEXT_LENGTH = 100_000
const OCR_PAGE_LIMIT = 5

type PdfUpload = {
  filename?: string
  type?: string
  data: Buffer | Uint8Array
}

type ParsePdfText = (data: Buffer | Uint8Array) => Promise<string>
type OcrPdfText = (data: Buffer | Uint8Array) => Promise<string>

type PdfExtractionOptions = {
  parsePdfText?: ParsePdfText
  ocrPdfText?: OcrPdfText
}

export class PdfExtractionError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message)
  }
}

class InsufficientPdfTextError extends PdfExtractionError {}

const defaultParsePdfText: ParsePdfText = async (data) => {
  const parser = new PDFParse({ data })

  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

const require = createRequire(import.meta.url)

const defaultOcrPdfText: OcrPdfText = async (data) => {
  const parser = new PDFParse({ data })

  try {
    const screenshotResult = await parser.getScreenshot({
      first: OCR_PAGE_LIMIT,
      desiredWidth: 1600,
      imageBuffer: true,
      imageDataUrl: false
    })

    if (screenshotResult.pages.length === 0) {
      throw new PdfExtractionError('Nao foi possivel renderizar o PDF escaneado para OCR.')
    }

    const tessdataEntry = require.resolve('@tesseract.js-data/eng')
    const langPath = join(dirname(tessdataEntry), '4.0.0_best_int')
    const worker = await createWorker('eng', 1, {
      langPath,
      cacheMethod: 'none',
      gzip: true
    })

    try {
      const pageTexts: string[] = []

      for (const page of screenshotResult.pages) {
        if (!page.data) {
          continue
        }

        const result = await worker.recognize(Buffer.from(page.data))
        pageTexts.push(result.data.text)
      }

      return pageTexts.join('\n\n')
    } finally {
      await worker.terminate()
    }
  } finally {
    await parser.destroy()
  }
}

const hasPdfExtension = (filename?: string) => Boolean(filename && filename.toLowerCase().endsWith('.pdf'))
const normalizeText = (text: string) => text.replace(/\r\n/g, '\n').trim()

const validatePdfUpload = (upload: PdfUpload) => {
  if (!upload.filename || !hasPdfExtension(upload.filename)) {
    throw new PdfExtractionError('Envie um arquivo PDF valido.')
  }

  if (upload.type && upload.type !== 'application/pdf') {
    throw new PdfExtractionError('O arquivo enviado precisa ser um PDF.')
  }

  if (!upload.data?.byteLength) {
    throw new PdfExtractionError('O arquivo PDF esta vazio.')
  }

  if (upload.data.byteLength > MAX_PDF_BYTES) {
    throw new PdfExtractionError('O PDF deve ter no maximo 10 MB.')
  }
}

const assertReviewableText = (extractedText: string, message: string) => {
  if (extractedText.length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new InsufficientPdfTextError(message)
  }

  if (extractedText.length > MAX_EXTRACTED_TEXT_LENGTH) {
    throw new PdfExtractionError('Texto extraido excede o limite de 100.000 caracteres.')
  }
}

export const extractDigitalPdfText = async (upload: PdfUpload, parsePdfText: ParsePdfText = defaultParsePdfText) => {
  validatePdfUpload(upload)

  const extractedText = normalizeText(await parsePdfText(upload.data))

  assertReviewableText(extractedText, 'Texto insuficiente extraido do PDF.')

  return {
    filename: upload.filename,
    mimeType: upload.type || 'application/pdf',
    sizeBytes: upload.data.byteLength,
    extractedText,
    characterCount: extractedText.length,
    extractionMethod: 'digital' as const
  }
}

export const extractPdfText = async (upload: PdfUpload, options: PdfExtractionOptions = {}) => {
  const parsePdfText = options.parsePdfText ?? defaultParsePdfText
  const ocrPdfText = options.ocrPdfText ?? defaultOcrPdfText

  try {
    return await extractDigitalPdfText(upload, parsePdfText)
  } catch (error) {
    if (!(error instanceof InsufficientPdfTextError)) {
      throw error
    }
  }

  let extractedText: string

  try {
    extractedText = normalizeText(await ocrPdfText(upload.data))
  } catch {
    throw new PdfExtractionError('Nao foi possivel concluir o OCR do PDF escaneado. Tente outro arquivo ou cole o texto manualmente.')
  }

  try {
    assertReviewableText(extractedText, 'OCR concluido, mas texto legivel insuficiente foi encontrado no PDF escaneado.')
  } catch (error) {
    if (error instanceof InsufficientPdfTextError) {
      throw new PdfExtractionError(error.message)
    }

    throw error
  }

  return {
    filename: upload.filename,
    mimeType: upload.type || 'application/pdf',
    sizeBytes: upload.data.byteLength,
    extractedText,
    characterCount: extractedText.length,
    extractionMethod: 'ocr' as const
  }
}
