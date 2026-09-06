import 'server-only'

import JSZip from 'jszip'
import mammoth from 'mammoth'

import type { SourceDocumentSignals } from '@/lib/ats/types'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { cleanDocumentText, normalizeBulletGlyphs } from '@/lib/matching/normalize'

/**
 * DOCX text extraction and layout inspection.
 *
 * Two passes: mammoth produces readable text (it understands numbering, styles
 * and nested lists), while a direct read of `word/document.xml` reports the
 * structural features that make a resume hostile to an ATS — tables used for
 * layout, text boxes, embedded images and multi-column sections. Those are
 * invisible once the document has been flattened to text.
 */

export interface DocxExtractionResult {
  text: string
  signals: SourceDocumentSignals
}

const DOCUMENT_PART = 'word/document.xml'

/** Counts non-overlapping occurrences of a literal marker. */
function countMarker(xml: string, marker: string): number {
  let count = 0
  let from = 0
  for (;;) {
    const at = xml.indexOf(marker, from)
    if (at === -1) break
    count += 1
    from = at + marker.length
  }
  return count
}

interface XmlSignals {
  tableCount: number
  textBoxCount: number
  imageCount: number
  multiColumn: boolean
}

/**
 * Inspects WordprocessingML for ATS-hostile structures.
 *
 * Counts top-level tables only: nested tables inflate the number without adding
 * information, and a single layout table is already the finding worth reporting.
 */
export function inspectDocumentXml(xml: string): XmlSignals {
  // `<w:tbl>` opens a table; `<w:tblPr` is its properties child, so match the
  // element open tag precisely to avoid double counting.
  const tableCount = countMarker(xml, '<w:tbl>') + countMarker(xml, '<w:tbl ')

  // Text boxes appear as VML shapes or as DrawingML text box content.
  const textBoxCount =
    countMarker(xml, '<w:txbxContent>') +
    countMarker(xml, '<v:textbox') +
    countMarker(xml, '<wps:txbx')

  // Images: DrawingML blips and legacy VML image data.
  const imageCount = countMarker(xml, '<a:blip') + countMarker(xml, '<v:imagedata')

  // A section with more than one column.
  const columnMatches = xml.match(/<w:cols[^>]*w:num="(\d+)"/g) ?? []
  const multiColumn = columnMatches.some((match) => {
    const num = /w:num="(\d+)"/.exec(match)?.[1]
    return num !== undefined && Number.parseInt(num, 10) > 1
  })

  return { tableCount, textBoxCount, imageCount, multiColumn }
}

/** Extracts text and layout signals from a DOCX file. */
export async function extractDocx(bytes: Uint8Array): Promise<DocxExtractionResult> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch (cause) {
    logger.warn('docx.zip_open_failed')
    throw new AppError(ERROR_CODES.DOCUMENT_UNREADABLE, { cause })
  }

  const documentPart = zip.file(DOCUMENT_PART)
  if (!documentPart) {
    throw new AppError(ERROR_CODES.UNSUPPORTED_FILE, {
      message: 'That file is not a Word document. Please upload a .docx resume or a PDF.',
    })
  }

  // An encrypted OOXML package keeps the ZIP shell but replaces the parts.
  if (zip.file('EncryptedPackage') || zip.file('EncryptionInfo')) {
    throw new AppError(ERROR_CODES.DOCUMENT_ENCRYPTED)
  }

  let xml: string
  try {
    xml = await documentPart.async('string')
  } catch (cause) {
    throw new AppError(ERROR_CODES.DOCUMENT_UNREADABLE, { cause })
  }

  const xmlSignals = inspectDocumentXml(xml)

  let raw: string
  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    })
    raw = result.value
  } catch (cause) {
    logger.warn('docx.mammoth_failed')
    throw new AppError(ERROR_CODES.DOCUMENT_UNREADABLE, { cause })
  }

  const text = cleanDocumentText(normalizeBulletGlyphs(raw))

  if (text.length === 0) {
    throw new AppError(ERROR_CODES.DOCUMENT_EMPTY)
  }

  return {
    text,
    signals: {
      multiColumnSuspected: xmlSignals.multiColumn,
      tableCount: xmlSignals.tableCount,
      imageCount: xmlSignals.imageCount,
      textBoxCount: xmlSignals.textBoxCount,
      extractedCharacters: text.length,
      pageCount: null,
    },
  }
}
