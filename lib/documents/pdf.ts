import 'server-only'

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import type { ResumeProfile } from '@/lib/domain/types'
import { toWinAnsi } from '@/lib/documents/encoding'
import { buildLayout, type LayoutBlock } from '@/lib/documents/layout'

/**
 * PDF generation.
 *
 * Real text is drawn with the standard Type 1 fonts, so every character stays
 * selectable, searchable and extractable — this is a typeset document, never a
 * rasterised screenshot. Layout is a single column with no tables or graphics,
 * matching the DOCX export block for block.
 */

/* --------------------------------------------------------------- geometry */

const PAGE_WIDTH = 612 // US Letter, 8.5in x 72
const PAGE_HEIGHT = 792
const MARGIN_X = 50
const MARGIN_TOP = 46
const MARGIN_BOTTOM = 46
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

/* ------------------------------------------------------------ typography */

const SIZE_NAME = 17
const SIZE_HEADING = 10.5
const SIZE_BODY = 9.6
const SIZE_CONTACT = 9

const LINE_HEIGHT = 1.34
const BULLET_INDENT = 12

const INK = rgb(0.1, 0.1, 0.11)
const MUTED = rgb(0.36, 0.38, 0.43)
const RULE = rgb(0.79, 0.81, 0.85)

/* ----------------------------------------------------------------- engine */

interface Cursor {
  page: PDFPage
  y: number
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

interface RenderContext {
  document: PDFDocument
  fonts: Fonts
  cursor: Cursor
}

function newPage(document: PDFDocument): Cursor {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  return { page, y: PAGE_HEIGHT - MARGIN_TOP }
}

/** Ensures `needed` vertical space exists, starting a new page if it does not. */
function ensureSpace(context: RenderContext, needed: number): void {
  if (context.cursor.y - needed < MARGIN_BOTTOM) {
    context.cursor = newPage(context.document)
  }
}

/** Greedy word wrap against real glyph metrics. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)

    // A single word wider than the column (a long URL) is hard-split so it
    // cannot overflow the page edge.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = ''
      for (const character of word) {
        if (font.widthOfTextAtSize(chunk + character, size) > maxWidth && chunk) {
          lines.push(chunk)
          chunk = character
        } else {
          chunk += character
        }
      }
      current = chunk
    } else {
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}

interface DrawOptions {
  font?: PDFFont
  size?: number
  color?: typeof INK
  indent?: number
  maxWidth?: number
  spacingAfter?: number
}

function drawParagraph(context: RenderContext, text: string, options: DrawOptions = {}): void {
  const font = options.font ?? context.fonts.regular
  const size = options.size ?? SIZE_BODY
  const indent = options.indent ?? 0
  const maxWidth = options.maxWidth ?? CONTENT_WIDTH - indent
  const lineHeight = size * LINE_HEIGHT

  const lines = wrapText(toWinAnsi(text), font, size, maxWidth)

  for (const line of lines) {
    ensureSpace(context, lineHeight)
    context.cursor.page.drawText(line, {
      x: MARGIN_X + indent,
      y: context.cursor.y - size,
      size,
      font,
      color: options.color ?? INK,
    })
    context.cursor.y -= lineHeight
  }

  if (options.spacingAfter) context.cursor.y -= options.spacingAfter
}

function renderBlock(context: RenderContext, block: LayoutBlock): void {
  const { fonts } = context

  switch (block.kind) {
    case 'name': {
      ensureSpace(context, SIZE_NAME * LINE_HEIGHT)
      drawParagraph(context, block.text, {
        font: fonts.bold,
        size: SIZE_NAME,
        spacingAfter: 2,
      })
      break
    }

    case 'contact': {
      drawParagraph(context, block.parts.join('  |  '), {
        size: SIZE_CONTACT,
        color: MUTED,
        spacingAfter: 8,
      })
      break
    }

    case 'sectionHeading': {
      const needed = SIZE_HEADING * LINE_HEIGHT + 16
      ensureSpace(context, needed)
      context.cursor.y -= 8
      drawParagraph(context, block.text.toUpperCase(), {
        font: fonts.bold,
        size: SIZE_HEADING,
      })
      // Rule under the heading. Decorative but harmless: it is a vector line,
      // not an image, and carries no text.
      const ruleY = context.cursor.y + 2
      context.cursor.page.drawLine({
        start: { x: MARGIN_X, y: ruleY },
        end: { x: PAGE_WIDTH - MARGIN_X, y: ruleY },
        thickness: 0.6,
        color: RULE,
      })
      context.cursor.y -= 6
      break
    }

    case 'paragraph':
      drawParagraph(context, block.text, { spacingAfter: 3 })
      break

    case 'entryHeader': {
      const size = SIZE_BODY
      const lineHeight = size * LINE_HEIGHT
      ensureSpace(context, lineHeight + 4)
      context.cursor.y -= 3

      const trailing = block.trailing ? toWinAnsi(block.trailing) : null
      const trailingWidth = trailing ? fonts.regular.widthOfTextAtSize(trailing, size) : 0
      const availableWidth = CONTENT_WIDTH - (trailingWidth > 0 ? trailingWidth + 12 : 0)

      const primary = toWinAnsi(block.primary)
      const secondary = block.secondary ? toWinAnsi(block.secondary) : null

      // Draw the title, then the company inline if it still fits on the line.
      const primaryWidth = fonts.bold.widthOfTextAtSize(primary, size)
      const y = context.cursor.y - size

      context.cursor.page.drawText(primary, {
        x: MARGIN_X,
        y,
        size,
        font: fonts.bold,
        color: INK,
      })

      if (secondary) {
        const separator = '  —  '
        const separatorWidth = fonts.regular.widthOfTextAtSize(separator, size)
        const secondaryWidth = fonts.regular.widthOfTextAtSize(secondary, size)
        if (primaryWidth + separatorWidth + secondaryWidth <= availableWidth) {
          context.cursor.page.drawText(`${separator}${secondary}`, {
            x: MARGIN_X + primaryWidth,
            y,
            size,
            font: fonts.regular,
            color: MUTED,
          })
        }
      }

      if (trailing) {
        context.cursor.page.drawText(trailing, {
          x: PAGE_WIDTH - MARGIN_X - trailingWidth,
          y,
          size,
          font: fonts.regular,
          color: MUTED,
        })
      }

      context.cursor.y -= lineHeight

      // Company did not fit inline: give it its own line rather than clipping.
      if (secondary) {
        const separatorWidth = fonts.regular.widthOfTextAtSize('  —  ', size)
        const secondaryWidth = fonts.regular.widthOfTextAtSize(secondary, size)
        if (primaryWidth + separatorWidth + secondaryWidth > availableWidth) {
          drawParagraph(context, secondary, { color: MUTED })
        }
      }
      break
    }

    case 'entrySubheader':
      drawParagraph(context, block.text, { color: MUTED, spacingAfter: 1 })
      break

    case 'bullet': {
      const size = SIZE_BODY
      const lineHeight = size * LINE_HEIGHT
      const lines = wrapText(
        toWinAnsi(block.text),
        fonts.regular,
        size,
        CONTENT_WIDTH - BULLET_INDENT,
      )

      lines.forEach((line, index) => {
        ensureSpace(context, lineHeight)
        const y = context.cursor.y - size
        if (index === 0) {
          // A hyphen bullet: unambiguous in every PDF text extractor.
          context.cursor.page.drawText('-', {
            x: MARGIN_X + 2,
            y,
            size,
            font: fonts.regular,
            color: MUTED,
          })
        }
        context.cursor.page.drawText(line, {
          x: MARGIN_X + BULLET_INDENT,
          y,
          size,
          font: fonts.regular,
          color: INK,
        })
        context.cursor.y -= lineHeight
      })
      context.cursor.y -= 1.5
      break
    }

    case 'labelledList': {
      const size = SIZE_BODY
      const text = block.label
        ? `${block.label}: ${block.items.join(', ')}`
        : block.items.join(', ')

      if (!block.label) {
        drawParagraph(context, text, { spacingAfter: 2 })
        break
      }

      // Bold label, regular items, wrapping as one paragraph.
      const label = toWinAnsi(`${block.label}: `)
      const labelWidth = fonts.bold.widthOfTextAtSize(label, size)
      const lineHeight = size * LINE_HEIGHT
      const bodyLines = wrapText(
        toWinAnsi(block.items.join(', ')),
        fonts.regular,
        size,
        CONTENT_WIDTH - labelWidth,
      )

      bodyLines.forEach((line, index) => {
        ensureSpace(context, lineHeight)
        const y = context.cursor.y - size
        if (index === 0) {
          context.cursor.page.drawText(label, {
            x: MARGIN_X,
            y,
            size,
            font: fonts.bold,
            color: INK,
          })
        }
        context.cursor.page.drawText(line, {
          x: index === 0 ? MARGIN_X + labelWidth : MARGIN_X,
          y,
          size,
          font: fonts.regular,
          color: INK,
        })
        context.cursor.y -= lineHeight
      })
      context.cursor.y -= 2
      break
    }

    case 'spacer':
      context.cursor.y -= 5
      break
  }
}

/** Renders a resume profile to a PDF buffer with selectable text. */
export async function generatePdf(profile: ResumeProfile): Promise<Uint8Array> {
  const document = await PDFDocument.create()

  document.setTitle(profile.personal.fullName ? `${profile.personal.fullName} — Resume` : 'Resume')
  document.setProducer('RoleFit')
  document.setCreator('RoleFit')

  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  }

  const context: RenderContext = { document, fonts, cursor: newPage(document) }

  for (const block of buildLayout(profile)) {
    renderBlock(context, block)
  }

  // A trailing page with nothing on it fails document validation; drop it.
  const pages = document.getPages()
  if (pages.length > 1 && context.cursor.y >= PAGE_HEIGHT - MARGIN_TOP - 1) {
    document.removePage(pages.length - 1)
  }

  return document.save({ useObjectStreams: false })
}

export const PDF_MIME_TYPE = 'application/pdf'

export { toWinAnsi }

export const __testing = { wrapText }
