import 'server-only'

import { AppError, ERROR_CODES } from '@/lib/errors'
import { cleanDocumentText } from '@/lib/matching/normalize'
import type { SourceDocumentSignals } from '@/lib/ats/types'
import { logger } from '@/lib/logger'

/**
 * PDF text extraction.
 *
 * pdf.js is used in its legacy (non-worker) build so it runs inside a
 * serverless function. Beyond the text itself, this module reports layout
 * signals the ATS analyzer needs — most importantly whether the document is
 * laid out in columns, which is invisible once text has been flattened.
 */

interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

interface PositionedItem {
  text: string
  x: number
  y: number
  width: number
}

export interface PdfExtractionResult {
  text: string
  signals: SourceDocumentSignals
}

/** Vertical tolerance, in PDF units, for treating items as the same line. */
const LINE_TOLERANCE = 3.2

/**
 * A gap wider than this share of page width, recurring at a consistent x
 * position, indicates a column break rather than tabbed alignment.
 */
const COLUMN_GAP_RATIO = 0.14
/** Share of lines that must show the gap before we call it multi-column. */
const COLUMN_LINE_SHARE = 0.28

let pdfjsModule: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null

async function loadPdfjs(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  if (pdfjsModule) return pdfjsModule
  // The legacy build detects Node and falls back to an in-process "fake worker"
  // on its own. `workerSrc` is deliberately left untouched: assigning it — even
  // an empty string — defeats that detection and the fake-worker setup then
  // fails with "No GlobalWorkerOptions.workerSrc specified".
  pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjsModule
}

/** Groups positioned items into visual lines, top to bottom. */
function groupIntoLines(items: readonly PositionedItem[]): PositionedItem[][] {
  const sorted = [...items].sort((a, b) =>
    Math.abs(a.y - b.y) <= LINE_TOLERANCE ? a.x - b.x : b.y - a.y,
  )

  const lines: PositionedItem[][] = []
  let current: PositionedItem[] = []
  let currentY: number | null = null

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= LINE_TOLERANCE) {
      current.push(item)
      currentY = currentY === null ? item.y : (currentY + item.y) / 2
    } else {
      if (current.length > 0) lines.push(current)
      current = [item]
      currentY = item.y
    }
  }
  if (current.length > 0) lines.push(current)

  return lines.map((line) => line.sort((a, b) => a.x - b.x))
}

/**
 * Detects a two-column layout by looking for a wide horizontal gap that recurs
 * at a stable x position across many lines. Tab-aligned dates produce gaps too,
 * but they sit far right and appear on fewer lines than a real column break.
 */
function detectMultiColumn(lines: readonly PositionedItem[][], pageWidth: number): boolean {
  if (pageWidth <= 0 || lines.length < 8) return false

  const minGap = pageWidth * COLUMN_GAP_RATIO
  const gapPositions: number[] = []

  for (const line of lines) {
    if (line.length < 2) continue
    for (let i = 1; i < line.length; i += 1) {
      const previous = line[i - 1]!
      const currentItem = line[i]!
      const gapStart = previous.x + previous.width
      const gap = currentItem.x - gapStart
      if (gap >= minGap) {
        gapPositions.push(gapStart + gap / 2)
        break
      }
    }
  }

  if (gapPositions.length < lines.length * COLUMN_LINE_SHARE) return false

  // The gaps must agree on where the split is; scattered gaps are just tabs.
  const sortedGaps = [...gapPositions].sort((a, b) => a - b)
  const median = sortedGaps[Math.floor(sortedGaps.length / 2)]!
  const consistent = gapPositions.filter(
    (position) => Math.abs(position - median) <= pageWidth * 0.08,
  ).length

  // A split near the page centre is a column layout; one at the far right is a
  // right-aligned date column, which parses fine.
  const relative = median / pageWidth
  const isCentral = relative > 0.25 && relative < 0.75

  return isCentral && consistent >= gapPositions.length * 0.7
}

/** Joins a line's items, inserting a space where the horizontal gap implies one. */
function renderLine(line: readonly PositionedItem[]): string {
  let out = ''
  for (let i = 0; i < line.length; i += 1) {
    const item = line[i]!
    if (i > 0) {
      const previous = line[i - 1]!
      const gap = item.x - (previous.x + previous.width)
      // pdf.js splits runs mid-word; only insert a space for a real gap.
      if (gap > 1.2) out += ' '
    }
    out += item.text
  }
  return out
}

/**
 * Extracts text and layout signals from a PDF.
 * Throws user-safe `AppError`s; the underlying parser error is logged, not shown.
 */
export async function extractPdf(bytes: Uint8Array): Promise<PdfExtractionResult> {
  const pdfjs = await loadPdfjs()

  let document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
  try {
    document = await pdfjs.getDocument({
      // pdf.js takes ownership of the buffer, so hand it a copy.
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
      // Untrusted input: never fetch anything referenced by the document.
      disableFontFace: true,
      stopAtErrors: false,
      // Errors only: pdf.js otherwise logs a warning per page about font data
      // that is irrelevant to text extraction.
      verbosity: 0,
    }).promise
  } catch (cause) {
    const name = (cause as { name?: string } | null)?.name
    if (name === 'PasswordException') {
      throw new AppError(ERROR_CODES.DOCUMENT_ENCRYPTED, { cause })
    }
    logger.warn('pdf.open_failed', { errorName: name })
    throw new AppError(ERROR_CODES.DOCUMENT_UNREADABLE, { cause })
  }

  const pageTexts: string[] = []
  let imageCount = 0
  let multiColumnPages = 0
  const pageCount = document.numPages

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()

      const positioned: PositionedItem[] = []
      for (const raw of content.items) {
        const item = raw as unknown as TextItemLike
        if (typeof item.str !== 'string' || item.str.length === 0) continue
        const transform = item.transform
        if (!Array.isArray(transform) || transform.length < 6) continue
        positioned.push({
          text: item.str,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          width: item.width ?? 0,
        })
      }

      const lines = groupIntoLines(positioned)
      if (detectMultiColumn(lines, viewport.width)) multiColumnPages += 1

      pageTexts.push(lines.map(renderLine).join('\n'))

      // Count embedded images without rendering them.
      try {
        const operatorList = await page.getOperatorList()
        const { OPS } = pdfjs
        for (const op of operatorList.fnArray) {
          if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject) imageCount += 1
        }
      } catch {
        // Operator inspection is best-effort; a failure must not fail the upload.
      }

      page.cleanup()
    }
  } finally {
    await document.destroy().catch(() => undefined)
  }

  const text = cleanDocumentText(pageTexts.join('\n\n'))

  if (text.length === 0) {
    throw new AppError(ERROR_CODES.DOCUMENT_EMPTY)
  }

  return {
    text,
    signals: {
      multiColumnSuspected: multiColumnPages > 0,
      // Tables are not represented in a PDF content stream, so they cannot be
      // detected reliably here. Reporting 0 is honest; DOCX can do better.
      tableCount: 0,
      imageCount,
      textBoxCount: 0,
      extractedCharacters: text.length,
      pageCount,
    },
  }
}

export const __testing = { groupIntoLines, detectMultiColumn, renderLine }
