import { describe, expect, it, vi } from 'vitest'
import { extractDigitalPdfText, PdfExtractionError } from './pdfExtraction'

describe('extractDigitalPdfText', () => {
  it('extracts reviewable text from a valid digital PDF upload', async () => {
    const parsePdfText = vi.fn(async () => 'Head, Last Mile Growth & Ops\n'.repeat(8))

    const result = await extractDigitalPdfText({
      filename: 'amazon-role.pdf',
      type: 'application/pdf',
      data: Buffer.from('%PDF-1.7 fake test bytes')
    }, parsePdfText)

    expect(parsePdfText).toHaveBeenCalledOnce()
    expect(result.filename).toBe('amazon-role.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.characterCount).toBeGreaterThan(120)
    expect(result.extractedText).toContain('Last Mile Growth')
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
