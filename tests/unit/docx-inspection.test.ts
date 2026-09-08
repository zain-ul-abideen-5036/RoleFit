import { describe, expect, it } from 'vitest'

import { inspectDocumentXml } from '@/lib/parsing/docx'

/**
 * WordprocessingML inspection.
 *
 * These signals decide whether the ATS report warns about layout, and they
 * cannot be recovered from the parsed profile afterwards — a two-column resume
 * reads as ordinary text once flattened. So the detection has to be right at
 * the point of upload or the finding is lost for good.
 *
 * The markup below is hand-written rather than taken from a fixture file. Real
 * DOCX XML is thousands of attributes wide, and a test that reads as a wall of
 * namespace declarations hides the one element it is actually about.
 */

function body(inner: string): string {
  return `<?xml version="1.0"?><w:document><w:body>${inner}</w:body></w:document>`
}

describe('tables', () => {
  it('finds none in ordinary paragraphs', () => {
    expect(inspectDocumentXml(body('<w:p><w:r><w:t>Engineer</w:t></w:r></w:p>')).tableCount).toBe(0)
  })

  it('counts a bare table element', () => {
    expect(inspectDocumentXml(body('<w:tbl><w:tr><w:tc/></w:tr></w:tbl>')).tableCount).toBe(1)
  })

  it('counts a table element carrying attributes', () => {
    expect(inspectDocumentXml(body('<w:tbl w:rsidR="00A1"><w:tr/></w:tbl>')).tableCount).toBe(1)
  })

  it('does not count table properties as a second table', () => {
    // `<w:tblPr>` is a child of `<w:tbl>`. A prefix match would double every
    // count and report one layout table as two.
    const xml = body('<w:tbl><w:tblPr><w:tblW w:w="5000"/></w:tblPr><w:tr/></w:tbl>')
    expect(inspectDocumentXml(xml).tableCount).toBe(1)
  })

  it('counts sibling tables separately', () => {
    // Written with rows because that is what Word emits — a table element
    // always has content, so the detector only looks for `<w:tbl>` and
    // `<w:tbl `, which is what keeps `<w:tblPr>` from double counting.
    const one = '<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>'
    expect(inspectDocumentXml(body(one + one + one)).tableCount).toBe(3)
  })

  it('does not inflate the count for nested tables beyond what is useful', () => {
    // Nesting is counted, and that is fine: the finding is "this document uses
    // tables for layout", and one is already enough to report.
    const xml = body('<w:tbl><w:tr><w:tc><w:tbl><w:tr/></w:tbl></w:tc></w:tr></w:tbl>')
    expect(inspectDocumentXml(xml).tableCount).toBeGreaterThan(0)
  })
})

describe('text boxes', () => {
  it('finds none in ordinary paragraphs', () => {
    expect(inspectDocumentXml(body('<w:p><w:t>Engineer</w:t></w:p>')).textBoxCount).toBe(0)
  })

  it('finds a DrawingML text box', () => {
    expect(inspectDocumentXml(body('<w:txbxContent><w:p/></w:txbxContent>')).textBoxCount).toBe(1)
  })

  it('finds a legacy VML text box', () => {
    expect(inspectDocumentXml(body('<v:textbox style="x"><w:p/></v:textbox>')).textBoxCount).toBe(1)
  })

  it('finds a WordprocessingShape text box', () => {
    expect(inspectDocumentXml(body('<wps:txbx><w:p/></wps:txbx>')).textBoxCount).toBe(1)
  })

  it('counts all three flavours together', () => {
    // Three markup dialects for the same thing, and a document can mix them.
    // Detecting only one would report a clean layout for a broken document.
    const xml = body(
      '<w:txbxContent><w:p/></w:txbxContent>' +
        '<v:textbox style="x"><w:p/></v:textbox>' +
        '<wps:txbx><w:p/></wps:txbx>',
    )
    expect(inspectDocumentXml(xml).textBoxCount).toBe(3)
  })
})

describe('images', () => {
  it('finds none in ordinary paragraphs', () => {
    expect(inspectDocumentXml(body('<w:p><w:t>Engineer</w:t></w:p>')).imageCount).toBe(0)
  })

  it('finds a DrawingML image', () => {
    expect(inspectDocumentXml(body('<a:blip r:embed="rId4"/>')).imageCount).toBe(1)
  })

  it('finds a legacy VML image', () => {
    expect(inspectDocumentXml(body('<v:imagedata r:id="rId5"/>')).imageCount).toBe(1)
  })

  it('counts both flavours together', () => {
    // `<a:blip` and `<v:imagedata` are matched as open-tag prefixes, so the
    // self-closing form these genuinely take in Word is counted.
    expect(
      inspectDocumentXml(
        body('<a:blip r:embed="rId1"/><a:blip r:embed="rId2"/><v:imagedata r:id="rId3"/>'),
      ).imageCount,
    ).toBe(3)
  })
})

describe('columns', () => {
  it('treats a single-column section as single-column', () => {
    expect(inspectDocumentXml(body('<w:sectPr><w:cols w:num="1"/></w:sectPr>')).multiColumn).toBe(
      false,
    )
  })

  it('treats a section with no column element as single-column', () => {
    // Absent means default, and the default is one column. Guessing "multi"
    // here would warn about every ordinary resume.
    expect(inspectDocumentXml(body('<w:sectPr/>')).multiColumn).toBe(false)
  })

  it('detects two columns', () => {
    expect(inspectDocumentXml(body('<w:sectPr><w:cols w:num="2"/></w:sectPr>')).multiColumn).toBe(
      true,
    )
  })

  it('detects columns declared alongside other attributes', () => {
    const xml = body('<w:sectPr><w:cols w:space="425" w:num="3" w:equalWidth="1"/></w:sectPr>')
    expect(inspectDocumentXml(xml).multiColumn).toBe(true)
  })

  it('detects a multi-column section anywhere in the document', () => {
    // Word allows per-section columns. A resume with a single two-column band
    // is still misread by a parser.
    const xml = body(
      '<w:sectPr><w:cols w:num="1"/></w:sectPr><w:p/><w:sectPr><w:cols w:num="2"/></w:sectPr>',
    )
    expect(inspectDocumentXml(xml).multiColumn).toBe(true)
  })

  it('ignores a non-numeric column count rather than throwing', () => {
    expect(inspectDocumentXml(body('<w:sectPr><w:cols w:num="two"/></w:sectPr>')).multiColumn).toBe(
      false,
    )
  })
})

describe('degenerate input', () => {
  it.each([
    ['empty', ''],
    ['not XML at all', 'this is not markup'],
    ['truncated mid-element', '<w:document><w:body><w:tbl'],
    ['only a declaration', '<?xml version="1.0"?>'],
  ])('returns all-clear for %s rather than throwing', (_label, xml) => {
    // A malformed document part must not fail the whole upload. The text
    // extraction is separate and may still succeed.
    expect(inspectDocumentXml(xml)).toEqual({
      tableCount: 0,
      textBoxCount: 0,
      imageCount: 0,
      multiColumn: false,
    })
  })

  it('reports a clean single-column document with no findings', () => {
    const xml = body(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Experience</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Built the payments service</w:t></w:r></w:p>' +
        '<w:sectPr><w:cols w:num="1"/></w:sectPr>',
    )

    expect(inspectDocumentXml(xml)).toEqual({
      tableCount: 0,
      textBoxCount: 0,
      imageCount: 0,
      multiColumn: false,
    })
  })

  it('reports every finding at once for a hostile document', () => {
    const xml = body(
      '<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>' +
        '<w:txbxContent><w:p/></w:txbxContent>' +
        '<a:blip r:embed="rId1"/>' +
        '<w:sectPr><w:cols w:num="2"/></w:sectPr>',
    )

    expect(inspectDocumentXml(xml)).toEqual({
      tableCount: 1,
      textBoxCount: 1,
      imageCount: 1,
      multiColumn: true,
    })
  })
})
