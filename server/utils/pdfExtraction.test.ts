import { describe, expect, it, vi } from 'vitest'
import { extractDigitalPdfText, extractPdfText, PdfExtractionError } from './pdfExtraction'

const pdfUpload = (data = Buffer.from('%PDF-1.7 fake test bytes')) => ({
  filename: 'amazon-role.pdf',
  type: 'application/pdf',
  data
})

describe('extractDigitalPdfText', () => {
  it('extracts reviewable text from a valid digital PDF upload', async () => {
    const parsePdfText = vi.fn(async () => 'Head, Last Mile Growth & Ops\n'.repeat(8))

    const result = await extractDigitalPdfText(pdfUpload(), parsePdfText)

    expect(parsePdfText).toHaveBeenCalledOnce()
    expect(result.filename).toBe('amazon-role.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.characterCount).toBeGreaterThan(120)
    expect(result.extractedText).toContain('Last Mile Growth')
    expect(result.extractionMethod).toBe('digital')
  })

  it('rejects non-PDF uploads before parsing', async () => {
    const parsePdfText = vi.fn(async () => 'not used')

    await expect(extractDigitalPdfText({
      filename: 'role.txt',
      type: 'text/plain',
      data: Buffer.from('hello')
    }, parsePdfText)).rejects.toBeInstanceOf(PdfExtractionError)

    expect(parsePdfText).not.toHaveBeenCalled()
  })

  it('rejects scanned or otherwise text-poor PDFs', async () => {
    await expect(extractDigitalPdfText({
      filename: 'scan.pdf',
      type: 'application/pdf',
      data: Buffer.from('%PDF')
    }, async () => 'tiny')).rejects.toMatchObject({
      message: expect.stringContaining('Texto insuficiente')
    })
  })
})

describe('extractPdfText', () => {
  it('keeps digital PDFs on the digital extraction path', async () => {
    const parsePdfText = vi.fn(async () => 'Senior Operations Manager\n'.repeat(8))
    const ocrPdfText = vi.fn(async () => 'not needed')

    const result = await extractPdfText(pdfUpload(), { parsePdfText, ocrPdfText })

    expect(result.extractionMethod).toBe('digital')
    expect(result.extractedText).toContain('Senior Operations Manager')
    expect(parsePdfText).toHaveBeenCalledOnce()
    expect(ocrPdfText).not.toHaveBeenCalled()
  })

  it('falls back to local OCR when a scanned PDF has insufficient digital text', async () => {
    const scannedPdf = Buffer.from('%PDF scanned fixture bytes')
    const parsePdfText = vi.fn(async () => '')
    const ocrPdfText = vi.fn(async () => 'Head of Marketplace Operations\nOwn seller growth, logistics rituals, and weekly marketplace performance reviews.\n'.repeat(2))

    const result = await extractPdfText(pdfUpload(scannedPdf), { parsePdfText, ocrPdfText })

    expect(parsePdfText).toHaveBeenCalledOnce()
    expect(ocrPdfText).toHaveBeenCalledWith(scannedPdf)
    expect(result.extractionMethod).toBe('ocr')
    expect(result.characterCount).toBeGreaterThan(120)
    expect(result.extractedText).toContain('Marketplace Operations')
  })

  it('reports a clear OCR failure when scanned text is still insufficient', async () => {
    await expect(extractPdfText(pdfUpload(Buffer.from('%PDF scan')), {
      parsePdfText: async () => '',
      ocrPdfText: async () => 'blurred'
    })).rejects.toMatchObject({
      message: 'OCR concluido, mas texto legivel insuficiente foi encontrado no PDF escaneado.'
    })
  })

  it('reports a clear failure when the OCR engine cannot process the scan', async () => {
    await expect(extractPdfText(pdfUpload(Buffer.from('%PDF broken scan')), {
      parsePdfText: async () => '',
      ocrPdfText: async () => {
        throw new Error('worker failed')
      }
    })).rejects.toMatchObject({
      message: 'Nao foi possivel concluir o OCR do PDF escaneado. Tente outro arquivo ou cole o texto manualmente.'
    })
  })

  it('does not run OCR for invalid uploads', async () => {
    const ocrPdfText = vi.fn(async () => 'not used')

    await expect(extractPdfText({
      filename: 'role.txt',
      type: 'text/plain',
      data: Buffer.from('hello')
    }, {
      parsePdfText: async () => 'not used',
      ocrPdfText
    })).rejects.toBeInstanceOf(PdfExtractionError)

    expect(ocrPdfText).not.toHaveBeenCalled()
  })
})
