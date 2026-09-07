import { describe, expect, it } from 'vitest'

import { emptyResumeProfile } from '@/lib/domain/types'
import {
  buildSourceIndex,
  checkForFabrication,
  verifyEvidenceQuotes,
  verifyImmutableSections,
} from '@/lib/optimization/anti-fabrication'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * The anti-fabrication guarantee.
 *
 * These tests exist because the promise "we never invent qualifications" is
 * only worth something if it holds when the model misbehaves. Every case below
 * feeds the validator output a cooperative model would never produce, and
 * asserts it is caught.
 */

const profile = demoResumeProfile()
const index = buildSourceIndex(profile)

describe('source index', () => {
  it('records only the skills the resume actually contains', () => {
    expect(index.skills.has('python')).toBe(true)
    expect(index.skills.has('postgresql')).toBe(true)
    expect(index.skills.has('docker')).toBe(true)

    // Named nowhere in the demo resume.
    expect(index.skills.has('aws')).toBe(false)
    expect(index.skills.has('kubernetes')).toBe(false)
    expect(index.skills.has('terraform')).toBe(false)
  })

  it('records the metrics present in the resume', () => {
    expect(index.numbers.has('35%')).toBe(true)
    expect(index.numbers.has('40%')).toBe(false)
  })

  it('records employers as known entities', () => {
    expect(index.entities.has('northwind logistics')).toBe(true)
  })
})

describe('skill fabrication', () => {
  const original = 'Built REST APIs in Node.js and Express for the customer portal.'

  it('accepts a rewrite that only uses skills already in the resume', () => {
    const result = checkForFabrication(
      'Designed and shipped REST APIs in Node.js and Express powering the customer portal.',
      index,
      { originalText: original },
    )
    expect(result.findings).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('rejects a rewrite that introduces AWS', () => {
    const result = checkForFabrication(
      'Designed and shipped REST APIs in Node.js deployed on AWS Lambda.',
      index,
      { originalText: original },
    )

    expect(result.ok).toBe(false)
    expect(result.findings.some((finding) => finding.kind === 'skill')).toBe(true)
    expect(result.findings.map((finding) => finding.token)).toContain('AWS')
  })

  it('rejects a rewrite that introduces Kubernetes', () => {
    const result = checkForFabrication(
      'Deployed the customer portal to Kubernetes across three regions.',
      index,
      { originalText: original },
    )
    expect(result.ok).toBe(false)
    expect(result.findings.map((finding) => finding.token)).toContain('Kubernetes')
  })

  it('allows aligning a synonym the resume already evidences', () => {
    // The resume says "Postgres"; the posting says "PostgreSQL". Same skill.
    const sparse = {
      ...emptyResumeProfile(),
      skills: [{ id: 's1', category: 'Skills', items: ['Postgres'] }],
    }
    const sparseIndex = buildSourceIndex(sparse)

    const result = checkForFabrication('Tuned PostgreSQL query performance.', sparseIndex, {
      originalText: 'Tuned Postgres query performance.',
    })
    expect(result.ok).toBe(true)
  })

  it('does not confuse Java with JavaScript', () => {
    const jsOnly = {
      ...emptyResumeProfile(),
      skills: [{ id: 's1', category: 'Skills', items: ['JavaScript'] }],
    }
    const jsIndex = buildSourceIndex(jsOnly)

    const result = checkForFabrication('Built backend services in Java.', jsIndex, {
      originalText: 'Built backend services in JavaScript.',
    })
    expect(result.ok).toBe(false)
    expect(result.findings.map((finding) => finding.token)).toContain('Java')
  })
})

describe('metric fabrication', () => {
  it('preserves a metric that was already present', () => {
    const original =
      'Helped migrate the reporting database to PostgreSQL, which reduced query times by 35%.'
    const result = checkForFabrication(
      'Migrated the reporting database to PostgreSQL, cutting query times by 35%.',
      index,
      { originalText: original },
    )
    expect(result.findings.filter((finding) => finding.kind === 'metric')).toEqual([])
  })

  it('rejects a metric invented from nothing', () => {
    const result = checkForFabrication('Improved application performance by 40%.', index, {
      originalText: 'Improved application performance.',
    })
    expect(result.ok).toBe(false)
    expect(result.findings.some((finding) => finding.kind === 'metric')).toBe(true)
    expect(result.findings.map((finding) => finding.token)).toContain('40%')
  })

  it('rejects a metric altered from the original value', () => {
    const result = checkForFabrication('Reduced query times by 55%.', index, {
      originalText: 'Reduced query times by 35%.',
    })
    expect(result.ok).toBe(false)
    expect(result.findings.map((finding) => finding.token)).toContain('55%')
  })

  it('rejects a metric borrowed from a different role', () => {
    // 35% exists in the resume, but under a different employer. Moving it
    // attributes someone's achievement to the wrong job.
    const result = checkForFabrication(
      'Maintained a React frontend, improving load times by 35%.',
      index,
      { originalText: 'Maintained a React frontend for a content publishing tool.' },
    )
    expect(result.ok).toBe(false)
    expect(result.findings.some((finding) => finding.kind === 'metric')).toBe(true)
  })

  it('rejects an invented team size', () => {
    const result = checkForFabrication(
      'Led a team of 6 engineers building the tracking service.',
      index,
      { originalText: 'Worked on the shipment tracking service.' },
    )
    expect(result.ok).toBe(false)
  })
})

describe('entity fabrication', () => {
  it('rejects an employer that never appears in the resume', () => {
    const result = checkForFabrication(
      'Built REST APIs at Google for the customer portal.',
      index,
      { originalText: 'Built REST APIs for the customer portal.' },
    )
    expect(result.ok).toBe(false)
    expect(result.findings.some((finding) => finding.kind === 'entity')).toBe(true)
  })

  it('allows an entity the resume already contains', () => {
    const result = checkForFabrication(
      'Delivered the shipment tracking service at Northwind Logistics.',
      index,
      {
        originalText: 'Worked on the shipment tracking service used by internal operations teams.',
      },
    )
    expect(result.findings.filter((finding) => finding.kind === 'entity')).toEqual([])
  })
})

describe('scope escalation', () => {
  it('rejects promoting "helped" to "led"', () => {
    const result = checkForFabrication(
      'Led the migration of the reporting database to PostgreSQL.',
      index,
      { originalText: 'Helped migrate the reporting database to PostgreSQL.' },
    )
    expect(result.ok).toBe(false)
    expect(result.findings.some((finding) => finding.kind === 'scope')).toBe(true)
  })

  it('allows a stronger verb that does not change ownership', () => {
    const result = checkForFabrication(
      'Migrated the reporting database to PostgreSQL, reducing query times by 35%.',
      index,
      {
        originalText:
          'Helped migrate the reporting database to PostgreSQL, which reduced query times by 35%.',
      },
    )
    expect(result.findings.filter((finding) => finding.kind === 'scope')).toEqual([])
  })
})

describe('evidence verification', () => {
  it('accepts quotes that occur in the resume', () => {
    const result = verifyEvidenceQuotes(
      ['Built REST APIs in Node.js and Express for the customer portal.'],
      index,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a fabricated quote', () => {
    const result = verifyEvidenceQuotes(
      ['Architected a multi-region AWS platform serving millions of users.'],
      index,
    )
    expect(result.ok).toBe(false)
    expect(result.unverified).toHaveLength(1)
  })
})

describe('immutable sections', () => {
  it('accepts a profile whose facts are unchanged', () => {
    const proposed = demoResumeProfile()
    proposed.experience[0]!.bullets[0] = 'Rewritten bullet text describing the same work.'

    const result = verifyImmutableSections(profile, proposed)
    expect(result.violations).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('rejects an altered employer name', () => {
    const proposed = demoResumeProfile()
    proposed.experience[0]!.company = 'Northwind Logistics International'

    const result = verifyImmutableSections(profile, proposed)
    expect(result.ok).toBe(false)
    expect(result.violations).toContain('experience.exp-1.company')
  })

  it('rejects an altered job title', () => {
    const proposed = demoResumeProfile()
    proposed.experience[0]!.title = 'Senior Staff Engineer'

    const result = verifyImmutableSections(profile, proposed)
    expect(result.violations).toContain('experience.exp-1.title')
  })

  it('rejects altered employment dates', () => {
    const proposed = demoResumeProfile()
    proposed.experience[1]!.dates.start = 'Jan 2018'

    const result = verifyImmutableSections(profile, proposed)
    expect(result.violations).toContain('experience.exp-2.dates')
  })

  it('rejects an added degree', () => {
    const proposed = demoResumeProfile()
    proposed.education.push({
      id: 'edu-2',
      institution: 'Stanford University',
      degree: 'M.S. Computer Science',
      field: null,
      location: null,
      dates: { start: '2020', end: '2022', isCurrent: false },
      details: [],
    })

    const result = verifyImmutableSections(profile, proposed)
    expect(result.ok).toBe(false)
    expect(result.violations).toContain('education')
  })

  it('rejects an added certification', () => {
    const proposed = demoResumeProfile()
    proposed.certifications.push({
      id: 'cert-2',
      name: 'AWS Certified Solutions Architect',
      issuer: 'Amazon Web Services',
      issued: '2024',
      expires: null,
      credentialId: null,
    })

    const result = verifyImmutableSections(profile, proposed)
    expect(result.violations).toContain('certifications')
  })

  it('rejects an altered contact email', () => {
    const proposed = demoResumeProfile()
    proposed.personal.email = 'someone.else@example.com'

    const result = verifyImmutableSections(profile, proposed)
    expect(result.violations).toContain('personal')
  })

  it('allows reordering experience without flagging it', () => {
    const proposed = demoResumeProfile()
    proposed.experience.reverse()

    const result = verifyImmutableSections(profile, proposed)
    expect(result.ok).toBe(true)
  })
})
