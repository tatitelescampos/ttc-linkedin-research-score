import { PDFParse } from 'pdf-parse'

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MIN_EXTRACTED_TEXT_LENGTH = 120
const MAX_EXTRACTED_TEXT_LENGTH = 100_000

type PdfUpload = {
  filename?: string
  type?: string
  data: Buffer | Uint8Array
}

type ParsePdfText = (data: Buffer | Uint8Array) => Promise<string>

export class PdfExtractionError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message)
  }
}

const defaultParsePdfText: ParsePdfText = async (data) => {
  const parser = new PDFParse({ data })

  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

const hasPdfExtension = (filename?: string) => Boolean(filename && filename.toLowerCase().endsWith('.pdf'))

export const extractDigitalPdfText = async (upload: PdfUpload, parsePdfText: ParsePdfText = defaultParsePdfText) => {
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

  const extractedText = (await parsePdfText(upload.data)).replace(/\r\n/g, '\n').trim()

  if (extractedText.length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new PdfExtractionError('Texto insuficiente extraido do PDF. Se for um PDF escaneado, use o fluxo de OCR quando ele estiver disponivel.')
  }

  if (extractedText.length > MAX_EXTRACTED_TEXT_LENGTH) {
    throw new PdfExtractionError('Texto extraido excede o limite de 100.000 caracteres.')
  }

  return {
    filename: upload.filename,
    mimeType: upload.type || 'application/pdf',
    sizeBytes: upload.data.byteLength,
    extractedText,
    characterCount: extractedText.length
  }
}
