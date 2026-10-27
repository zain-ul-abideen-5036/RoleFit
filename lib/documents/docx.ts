import 'server-only'

import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
  convertInchesToTwip,
} from 'docx'

import type { ResumeProfile } from '@/lib/domain/types'
import { buildLayout, type LayoutBlock } from '@/lib/documents/layout'
import { resolveTemplate, type ResumeTemplate } from '@/lib/documents/templates'

/**
 * DOCX generation.
 *
 * ATS-friendly by construction: one section, one column, no tables, no text
 * boxes, no images, no headers or footers (content placed there is frequently
 * dropped by parsers), and standard heading names. Styling is limited to
 * weight, size and spacing.
 */

const BODY_SIZE = 21 // half-points => 10.5pt
const NAME_SIZE = 32 // 16pt
const HEADING_SIZE = 22 // 11pt

const INK = '1A1A1A'
const MUTED = '4A4A4A'

/** Right tab stop for dates, at the right margin. */
const RIGHT_TAB = convertInchesToTwip(7.0)

interface RunOptions {
  bold?: boolean
  color?: string
  size?: number
}

/**
 * Renders one block in the template's style.
 *
 * The font comes from the template and is always one installed with Office
 * (Calibri, Arial, Georgia, Cambria), so Word never substitutes a face.
 */
function renderBlock(block: LayoutBlock, template: ResumeTemplate): Paragraph[] {
  const font = template.docxFont
  const headerAlignment =
    template.headerAlign === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT

  const bodyRun = (text: string, options: RunOptions = {}) =>
    new TextRun({
      text,
      font,
      bold: options.bold ?? false,
      color: options.color ?? INK,
      size: options.size ?? BODY_SIZE,
    })

  switch (block.kind) {
    case 'name':
      return [
        new Paragraph({
          alignment: headerAlignment,
          spacing: { after: 40 },
          children: [bodyRun(block.text, { bold: true, size: NAME_SIZE, color: template.accent })],
        }),
      ]

    case 'contact':
      return [
        new Paragraph({
          alignment: headerAlignment,
          spacing: { after: 160 },
          children: [bodyRun(block.parts.join('  |  '), { color: MUTED })],
        }),
      ]

    case 'sectionHeading':
      return [
        new Paragraph({
          // A real heading style, so the document outline is machine-readable.
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 220, after: 90 },
          ...(template.headingStyle === 'rule'
            ? {
                border: {
                  bottom: {
                    style: 'single' as const,
                    size: 6,
                    color: template.accent === INK ? 'C9CDD6' : template.accent,
                    space: 4,
                  },
                },
              }
            : {}),
          children: [
            bodyRun(block.text.toUpperCase(), {
              bold: true,
              size: HEADING_SIZE,
              color: template.accent,
            }),
          ],
        }),
      ]

    case 'paragraph':
      return [
        new Paragraph({
          spacing: { after: 90, line: 264 },
          children: [bodyRun(block.text)],
        }),
      ]

    case 'entryHeader': {
      const children = [bodyRun(block.primary, { bold: true })]
      if (block.secondary) {
        children.push(bodyRun('  —  ', { color: MUTED }), bodyRun(block.secondary))
      }
      if (block.trailing) {
        children.push(
          new TextRun({ text: '', font }),
          bodyRun('\t', { color: MUTED }),
          bodyRun(block.trailing, { color: MUTED }),
        )
      }
      return [
        new Paragraph({
          spacing: { before: 110, after: 40 },
          tabStops: block.trailing ? [{ type: TabStopType.RIGHT, position: RIGHT_TAB }] : undefined,
          children,
        }),
      ]
    }

    case 'entrySubheader':
      return [
        new Paragraph({
          spacing: { after: 50 },
          children: [bodyRun(block.text, { color: MUTED })],
        }),
      ]

    case 'bullet':
      return [
        new Paragraph({
          numbering: { reference: 'rolefit-bullets', level: 0 },
          spacing: { after: 50, line: 264 },
          children: [bodyRun(block.text)],
        }),
      ]

    case 'labelledList':
      return [
        new Paragraph({
          spacing: { after: 60, line: 264 },
          children: block.label
            ? [bodyRun(`${block.label}: `, { bold: true }), bodyRun(block.items.join(', '))]
            : [bodyRun(block.items.join(', '))],
        }),
      ]

    case 'spacer':
      return [new Paragraph({ spacing: { after: 60 }, children: [] })]
  }
}

/** Renders a resume profile to a DOCX buffer. */
export async function generateDocx(
  profile: ResumeProfile,
  template: ResumeTemplate = resolveTemplate(),
): Promise<Uint8Array> {
  const blocks = buildLayout(profile, template)
  const paragraphs = blocks.flatMap((block) => renderBlock(block, template))
  const font = template.docxFont

  const document = new Document({
    creator: 'RoleFit',
    title: profile.personal.fullName ?? 'Resume',
    description: 'Resume generated by RoleFit',
    styles: {
      default: {
        document: {
          run: { font, size: BODY_SIZE, color: INK },
          paragraph: { spacing: { line: 264 } },
        },
        heading1: {
          run: { font, size: HEADING_SIZE, bold: true, color: template.accent },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'rolefit-bullets',
          levels: [
            {
              level: 0,
              // A standard bullet glyph; decorative symbols confuse parsers.
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.17) },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.6),
              right: convertInchesToTwip(0.7),
              bottom: convertInchesToTwip(0.6),
              left: convertInchesToTwip(0.7),
            },
          },
          // Explicitly single-column.
          column: { count: 1 },
        },
        children: paragraphs,
      },
    ],
  })

  const buffer = await Packer.toBuffer(document)
  return new Uint8Array(buffer)
}

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
