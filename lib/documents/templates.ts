/**
 * Resume templates.
 *
 * A template decides presentation only: section order, typeface, accent colour,
 * heading treatment and header alignment. It never decides structure. Every
 * template renders through the same flat, single-column layout model, uses the
 * same standard section names and the same real-text renderers, so every one of
 * them parses as cleanly in an ATS as the default. That is why there is no
 * two-column, sidebar, photo or icon template here: those are the layouts
 * parsers get wrong, and offering one would be offering a worse resume.
 *
 * Shared by the server renderers and the client preview, so it must stay free
 * of server-only imports.
 */

export type SectionKey =
  'summary' | 'skills' | 'experience' | 'projects' | 'education' | 'certifications' | 'achievements'

export const TEMPLATE_IDS = [
  'classic',
  'modern',
  'executive',
  'technical',
  'graduate',
  'minimal',
] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const DEFAULT_TEMPLATE_ID: TemplateId = 'classic'

export interface ResumeTemplate {
  id: TemplateId
  name: string
  description: string
  /** Who the template suits, shown in the picker. */
  bestFor: string
  /** Every section key, in the order it is rendered. Custom sections follow. */
  sectionOrder: readonly SectionKey[]
  /** Sans for Helvetica/Calibri-style faces, serif for Times/Georgia-style. */
  typeface: 'sans' | 'serif'
  /** DOCX font, chosen from faces installed with every copy of Office. */
  docxFont: string
  /** Hex colour without `#`, used for the name and section headings. */
  accent: string
  /** `rule` draws a line under each heading; `plain` does not. */
  headingStyle: 'rule' | 'plain'
  headerAlign: 'left' | 'center'
}

const INK = '1A1A1A'

const STANDARD_ORDER: readonly SectionKey[] = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'achievements',
]

export const TEMPLATES: Readonly<Record<TemplateId, ResumeTemplate>> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'Clean sans-serif with ruled section headings.',
    bestFor: 'Any role. The safe default.',
    sectionOrder: STANDARD_ORDER,
    typeface: 'sans',
    docxFont: 'Calibri',
    accent: INK,
    headingStyle: 'rule',
    headerAlign: 'left',
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Navy accent on the name and headings, otherwise restrained.',
    bestFor: 'Product, design, marketing and tech roles.',
    sectionOrder: STANDARD_ORDER,
    typeface: 'sans',
    docxFont: 'Arial',
    accent: '1F3A68',
    headingStyle: 'rule',
    headerAlign: 'left',
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    description: 'Serif type, centred header, experience ahead of skills.',
    bestFor: 'Senior, management, finance and legal roles.',
    sectionOrder: [
      'summary',
      'experience',
      'achievements',
      'skills',
      'education',
      'certifications',
      'projects',
    ],
    typeface: 'serif',
    docxFont: 'Georgia',
    accent: INK,
    headingStyle: 'rule',
    headerAlign: 'center',
  },
  technical: {
    id: 'technical',
    name: 'Technical',
    description: 'Skills and projects up front, teal accent.',
    bestFor: 'Engineering, data and IT roles.',
    sectionOrder: [
      'summary',
      'skills',
      'projects',
      'experience',
      'certifications',
      'education',
      'achievements',
    ],
    typeface: 'sans',
    docxFont: 'Calibri',
    accent: '0F5F5C',
    headingStyle: 'rule',
    headerAlign: 'left',
  },
  graduate: {
    id: 'graduate',
    name: 'Graduate',
    description: 'Education first, then skills and projects.',
    bestFor: 'Students, new graduates and internships.',
    sectionOrder: [
      'summary',
      'education',
      'skills',
      'projects',
      'experience',
      'certifications',
      'achievements',
    ],
    typeface: 'sans',
    docxFont: 'Calibri',
    accent: '2B3A55',
    headingStyle: 'rule',
    headerAlign: 'center',
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Serif type with no rules. Quiet and dense.',
    bestFor: 'Academic, writing and research roles.',
    sectionOrder: STANDARD_ORDER,
    typeface: 'serif',
    docxFont: 'Cambria',
    accent: INK,
    headingStyle: 'plain',
    headerAlign: 'left',
  },
}

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as readonly string[]).includes(value)
}

/** Resolves an id from untrusted input, falling back to the default. */
export function resolveTemplate(id?: string | null): ResumeTemplate {
  return TEMPLATES[isTemplateId(id) ? id : DEFAULT_TEMPLATE_ID]
}
