import { describe, expect, it } from 'vitest'

import { canonicalize, expandImplications, resolveSkill } from '@/lib/matching/aliases'
import { matchResumeToJob, missingRequirements } from '@/lib/matching/matcher'
import {
  containsPhrase,
  coverageRatio,
  countPhrase,
  normalizeText,
  tokenize,
  tokenSimilarity,
} from '@/lib/matching/normalize'
import { parseJobDescription } from '@/lib/parsing/job-description-parser'
import type { JobDescriptionProfile, Requirement, ResumeProfile } from '@/lib/domain/types'
import { emptyJobDescriptionProfile, emptyResumeProfile } from '@/lib/domain/types'
import {
  DEMO_EXPECTED_MISSING,
  DEMO_EXPECTED_PRESENT,
  DEMO_JOB_DESCRIPTION_TEXT,
  demoResumeProfile,
} from '@/tests/fixtures/demo-data'

/* ==========================================================================
   Normalization
   ========================================================================== */

describe('normalizeText', () => {
  it('folds case, accents and typographic punctuation', () => {
    expect(normalizeText('Café — Zürich’s Naïve Résumé')).toBe('cafe zurich naive resume')
  })

  it('drops possessives and contractions rather than splitting on them', () => {
    // A stray "s" token would be noise; "teammate's" must stay one token.
    expect(tokenize("reviewed my teammate's pull requests")).toEqual([
      'reviewed',
      'my',
      'teammate',
      'pull',
      'requests',
    ])
    expect(tokenize("don't repeat yourself")).toEqual(['dont', 'repeat', 'yourself'])
  })

  it('preserves technology names whose punctuation is meaningful', () => {
    expect(normalizeText('C++')).toBe('cplusplus')
    expect(normalizeText('C#')).toBe('csharp')
    expect(normalizeText('Node.js')).toBe('nodejs')
    expect(normalizeText('.NET Core')).toBe('dotnetcore')
    expect(normalizeText('ASP.NET')).toBe('aspnet')
    expect(normalizeText('CI/CD')).toBe('cicd')
  })

  it('does not let C++ collapse into the C language', () => {
    expect(tokenize('C++ and C')).toEqual(['cplusplus', 'and', 'c'])
  })
})

describe('containsPhrase', () => {
  it('matches on token boundaries, not substrings', () => {
    // The canonical false positive this engine exists to prevent.
    expect(containsPhrase('Expert in JavaScript and TypeScript', 'Java')).toBe(false)
    expect(containsPhrase('Expert in Java and Spring Boot', 'Java')).toBe(true)
  })

  it('matches multi-word phrases in order only', () => {
    expect(containsPhrase('machine learning pipelines', 'machine learning')).toBe(true)
    expect(containsPhrase('learning machine operation', 'machine learning')).toBe(false)
  })

  it('is unaffected by punctuation and casing differences', () => {
    expect(containsPhrase('Built REST APIs, quickly.', 'rest apis')).toBe(true)
  })
})

describe('countPhrase', () => {
  it('counts non-overlapping occurrences', () => {
    expect(countPhrase('python, python and Python', 'Python')).toBe(3)
    expect(countPhrase('no mention here', 'Python')).toBe(0)
  })
})

describe('similarity helpers', () => {
  it('scores coverage asymmetrically in favour of the shorter requirement', () => {
    const requirement = 'design REST APIs'
    const bullet = 'Designed and maintained REST APIs for the internal customer portal at scale'
    expect(coverageRatio(requirement, bullet)).toBeGreaterThan(0.6)
    // Jaccard is penalised by the length difference; coverage is not.
    expect(tokenSimilarity(requirement, bullet)).toBeLessThan(coverageRatio(requirement, bullet))
  })

  it('returns zero for unrelated text', () => {
    expect(coverageRatio('kubernetes orchestration', 'wrote marketing copy')).toBe(0)
  })
})

/* ==========================================================================
   Alias dictionary
   ========================================================================== */

describe('skill aliases', () => {
  it('resolves common abbreviations to their canonical skill', () => {
    expect(canonicalize('JS')).toBe('javascript')
    expect(canonicalize('Postgres')).toBe('postgresql')
    expect(canonicalize('ML')).toBe('machinelearning')
    expect(canonicalize('k8s')).toBe('kubernetes')
    expect(canonicalize('Golang')).toBe('go')
  })

  it('keeps unrelated technologies distinct', () => {
    expect(canonicalize('Java')).toBe('java')
    expect(canonicalize('JavaScript')).toBe('javascript')
    expect(canonicalize('Java')).not.toBe(canonicalize('JavaScript'))
  })

  it('treats unknown skills as their normalized form rather than guessing', () => {
    expect(resolveSkill('Blorptron 9000')).toBeNull()
    expect(canonicalize('Blorptron 9000')).toBe('blorptron 9000')
  })

  it('expands implications in one direction only', () => {
    // Knowing PostgreSQL evidences SQL.
    expect(expandImplications('postgresql').has('sql')).toBe(true)
    // Knowing SQL does not evidence PostgreSQL.
    expect(expandImplications('sql').has('postgresql')).toBe(false)
  })

  it('does not treat cloud providers as interchangeable', () => {
    expect(expandImplications('gcp').has('aws')).toBe(false)
    expect(expandImplications('azure').has('aws')).toBe(false)
    expect(expandImplications('aws').has('gcp')).toBe(false)
  })

  it('expands transitively', () => {
    // Next.js implies React, which implies JavaScript.
    const implied = expandImplications('nextjs')
    expect(implied.has('react')).toBe(true)
    expect(implied.has('javascript')).toBe(true)
  })
})

/* ==========================================================================
   Matching
   ========================================================================== */

function skillRequirement(
  canonical: string,
  priority: Requirement['priority'] = 'required',
): Requirement {
  return { id: `req-${canonical}`, text: canonical, canonical, priority, category: 'skill' }
}

function jobWithSkills(canonicals: string[]): JobDescriptionProfile {
  return {
    ...emptyJobDescriptionProfile(),
    requiredSkills: canonicals.map((canonical) => skillRequirement(canonical)),
    keywords: canonicals,
  }
}

function resumeWithSkills(items: string[]): ResumeProfile {
  return {
    ...emptyResumeProfile(),
    skills: [{ id: 'skill-1', category: 'Skills', items }],
  }
}

describe('matchResumeToJob', () => {
  it('marks a requirement missing when the resume has no evidence for it', () => {
    const result = matchResumeToJob(
      resumeWithSkills(['Python', 'Docker', 'PostgreSQL']),
      jobWithSkills(['aws']),
    )

    const aws = result.matches.find((match) => match.canonical === 'aws')
    expect(aws?.status).toBe('missing')
    expect(aws?.confidence).toBe(0)
    expect(aws?.evidence).toEqual([])
  })

  it('does not match Java against a JavaScript resume', () => {
    const result = matchResumeToJob(
      resumeWithSkills(['JavaScript', 'TypeScript', 'React']),
      jobWithSkills(['java']),
    )
    expect(result.matches.find((match) => match.canonical === 'java')?.status).toBe('missing')
  })

  it('matches an alias spelling as a strong match', () => {
    const result = matchResumeToJob(resumeWithSkills(['Postgres']), jobWithSkills(['postgresql']))
    const match = result.matches.find((entry) => entry.canonical === 'postgresql')
    expect(match?.status).toBe('strong')
    expect(match?.evidence).toHaveLength(1)
  })

  it('credits an implied skill and cites the span that implies it', () => {
    const result = matchResumeToJob(resumeWithSkills(['PostgreSQL']), jobWithSkills(['sql']))
    const match = result.matches.find((entry) => entry.canonical === 'sql')
    expect(match?.status).toBe('strong')
    expect(match?.method).toBe('normalized')
    expect(match?.evidence[0]?.excerpt).toBe('PostgreSQL')
  })

  it('does not credit the reverse implication', () => {
    const result = matchResumeToJob(resumeWithSkills(['SQL']), jobWithSkills(['postgresql']))
    expect(result.matches.find((entry) => entry.canonical === 'postgresql')?.status).toBe('missing')
  })

  it('finds skills demonstrated in experience bullets, not just skill lists', () => {
    const resume: ResumeProfile = {
      ...emptyResumeProfile(),
      experience: [
        {
          id: 'exp-1',
          title: 'Engineer',
          company: 'Acme',
          location: null,
          dates: { start: '2021', end: 'Present', isCurrent: true },
          bullets: ['Deployed services to Kubernetes across three regions.'],
        },
      ],
    }
    const result = matchResumeToJob(resume, jobWithSkills(['kubernetes']))
    expect(result.matches[0]?.status).toBe('strong')
    expect(result.matches[0]?.evidence[0]?.section).toBe('experience')
  })

  it('weights a demonstrated skill above a merely listed one', () => {
    const listed = matchResumeToJob(resumeWithSkills(['Docker']), jobWithSkills(['docker']))
    const demonstrated = matchResumeToJob(
      {
        ...emptyResumeProfile(),
        experience: [
          {
            id: 'exp-1',
            title: 'Engineer',
            company: 'Acme',
            location: null,
            dates: { start: '2021', end: null, isCurrent: false },
            bullets: ['Containerised the build pipeline with Docker.'],
          },
        ],
      },
      jobWithSkills(['docker']),
    )

    expect(demonstrated.matches[0]!.confidence).toBeGreaterThan(listed.matches[0]!.confidence)
  })

  it('reports keyword coverage with occurrence counts', () => {
    const result = matchResumeToJob(
      resumeWithSkills(['Python', 'Docker']),
      jobWithSkills(['python', 'aws']),
    )
    const python = result.keywordCoverage.find((entry) => entry.keyword === 'python')
    const aws = result.keywordCoverage.find((entry) => entry.keyword === 'aws')

    expect(python?.present).toBe(true)
    expect(python?.occurrences).toBeGreaterThan(0)
    expect(aws?.present).toBe(false)
    expect(aws?.occurrences).toBe(0)
  })

  it('handles an empty resume without throwing', () => {
    const result = matchResumeToJob(emptyResumeProfile(), jobWithSkills(['python']))
    expect(result.matches[0]?.status).toBe('missing')
  })

  it('handles an empty job description without throwing', () => {
    const result = matchResumeToJob(demoResumeProfile(), emptyJobDescriptionProfile())
    expect(result.matches).toEqual([])
    expect(result.keywordCoverage).toEqual([])
  })
})

/* ==========================================================================
   End-to-end against the demo fixtures
   ========================================================================== */

describe('demo resume against demo job description', () => {
  const job = parseJobDescription(DEMO_JOB_DESCRIPTION_TEXT)
  const result = matchResumeToJob(demoResumeProfile(), job)

  it('identifies every skill the candidate genuinely has', () => {
    for (const canonical of DEMO_EXPECTED_PRESENT) {
      const match = result.matches.find((entry) => entry.canonical === canonical)
      expect(match, `expected a requirement for ${canonical}`).toBeDefined()
      expect(match!.status, `${canonical} should be evidenced`).not.toBe('missing')
    }
  })

  it('reports the skills the candidate does not have as missing', () => {
    for (const canonical of DEMO_EXPECTED_MISSING) {
      const match = result.matches.find((entry) => entry.canonical === canonical)
      expect(match, `expected a requirement for ${canonical}`).toBeDefined()
      expect(match!.status, `${canonical} must not be claimed`).toBe('missing')
    }
  })

  it('lists the gaps explicitly', () => {
    const missingCanonicals = missingRequirements(result.matches)
      .map((match) => match.canonical)
      .filter(Boolean)

    expect(missingCanonicals).toContain('aws')
    expect(missingCanonicals).toContain('kubernetes')
  })

  it('is deterministic across runs', () => {
    const second = matchResumeToJob(
      demoResumeProfile(),
      parseJobDescription(DEMO_JOB_DESCRIPTION_TEXT),
    )
    expect(
      second.matches.map((match) => [match.canonical, match.status, match.confidence]),
    ).toEqual(result.matches.map((match) => [match.canonical, match.status, match.confidence]))
  })
})
