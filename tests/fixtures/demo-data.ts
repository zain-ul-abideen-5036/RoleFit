import type { ResumeProfile } from '@/lib/domain/types'

/**
 * Synthetic demo data.
 *
 * Entirely fictional. No real person's resume is used anywhere in this project,
 * in tests or in the product's demo mode.
 */

/**
 * A resume as plain text, in the shape a PDF or DOCX extractor produces.
 * Deliberately imperfect: weak bullets, no metrics in places, mixed date
 * formats — so the optimizer and the ATS checks have something real to do.
 */
export const DEMO_RESUME_TEXT = `Avery Chen
avery.chen@example.com | +1 415 555 0142 | San Francisco, CA
linkedin.com/in/averychen-demo | github.com/averychen-demo

SUMMARY
Software engineer with four years of experience building web applications. Interested in backend work and data pipelines.

SKILLS
Languages: Python, JavaScript, TypeScript, SQL
Frameworks: React, Node.js, Express, Flask
Databases: PostgreSQL, Redis
Tools: Docker, Git, GitHub Actions, Linux

EXPERIENCE
Software Engineer | Northwind Logistics | Mar 2022 - Present
San Francisco, CA
- Worked on the shipment tracking service used by internal operations teams.
- Built REST APIs in Node.js and Express for the customer portal.
- Helped migrate the reporting database to PostgreSQL, which reduced query times by 35%.
- Wrote unit tests and reviewed teammates' pull requests.
- Set up GitHub Actions pipelines for the team's three main services.

Junior Developer | Brightpath Media | Jul 2020 - Feb 2022
Remote
- Maintained a React frontend for a content publishing tool.
- Fixed bugs reported by the support team.
- Added Docker configuration so developers could run the stack locally.

PROJECTS
Parcel Insights | github.com/averychen-demo/parcel-insights
- Analysed public shipping datasets with Python and pandas.
- Built a small Flask dashboard to visualise delivery delays.

EDUCATION
B.S. Computer Science | University of California, Davis | 2016 - 2020
- Coursework in algorithms, databases and distributed systems.

CERTIFICATIONS
Docker Certified Associate | Docker Inc. | 2023
`

/**
 * A job description with a deliberate gap: it asks for AWS and Kubernetes,
 * neither of which appears anywhere in the demo resume. Those must surface as
 * "Missing / not verified" and must never be written into the output.
 */
export const DEMO_JOB_DESCRIPTION_TEXT = `Title: Backend Engineer, Platform
Company: Meridian Data
Location: San Francisco, CA (Hybrid)

About us
Meridian Data helps logistics companies understand their operations. We are a team of 40 and growing.

What you'll do
- Design and build backend services that process high volumes of shipment events.
- Own REST APIs consumed by internal teams and external customers.
- Improve the reliability and observability of our data pipelines.
- Partner with product managers to scope and deliver features.
- Mentor junior engineers and take part in code review.

Requirements
- 3+ years of professional experience building backend services in Python or Node.js.
- Strong SQL skills and experience with PostgreSQL.
- Experience designing and maintaining REST APIs.
- Hands-on experience with AWS, including Lambda and S3.
- Production experience with Kubernetes.
- Comfortable with Docker and CI/CD pipelines.
- Bachelor's degree in Computer Science or equivalent practical experience.

Nice to have
- Experience with Apache Kafka or another event streaming platform.
- Familiarity with Terraform or another infrastructure-as-code tool.
- Exposure to data engineering and ETL workflows.

What we offer
- Competitive salary and equity.
- Unlimited PTO and a generous learning budget.
- Comprehensive health, dental and vision cover.
`

/** A structured profile matching DEMO_RESUME_TEXT, for tests that skip parsing. */
export function demoResumeProfile(): ResumeProfile {
  return {
    personal: {
      fullName: 'Avery Chen',
      email: 'avery.chen@example.com',
      phone: '+1 415 555 0142',
      location: 'San Francisco, CA',
      links: [
        { label: 'LinkedIn', url: 'linkedin.com/in/averychen-demo' },
        { label: 'GitHub', url: 'github.com/averychen-demo' },
      ],
    },
    summary:
      'Software engineer with four years of experience building web applications. Interested in backend work and data pipelines.',
    skills: [
      {
        id: 'skill-1',
        category: 'Languages',
        items: ['Python', 'JavaScript', 'TypeScript', 'SQL'],
      },
      { id: 'skill-2', category: 'Frameworks', items: ['React', 'Node.js', 'Express', 'Flask'] },
      { id: 'skill-3', category: 'Databases', items: ['PostgreSQL', 'Redis'] },
      { id: 'skill-4', category: 'Tools', items: ['Docker', 'Git', 'GitHub Actions', 'Linux'] },
    ],
    experience: [
      {
        id: 'exp-1',
        title: 'Software Engineer',
        company: 'Northwind Logistics',
        location: 'San Francisco, CA',
        dates: { start: 'Mar 2022', end: 'Present', isCurrent: true },
        bullets: [
          'Worked on the shipment tracking service used by internal operations teams.',
          'Built REST APIs in Node.js and Express for the customer portal.',
          'Helped migrate the reporting database to PostgreSQL, which reduced query times by 35%.',
          "Wrote unit tests and reviewed teammates' pull requests.",
          "Set up GitHub Actions pipelines for the team's three main services.",
        ],
      },
      {
        id: 'exp-2',
        title: 'Junior Developer',
        company: 'Brightpath Media',
        location: 'Remote',
        dates: { start: 'Jul 2020', end: 'Feb 2022', isCurrent: false },
        bullets: [
          'Maintained a React frontend for a content publishing tool.',
          'Fixed bugs reported by the support team.',
          'Added Docker configuration so developers could run the stack locally.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University of California, Davis',
        degree: 'B.S. Computer Science',
        field: null,
        location: null,
        dates: { start: '2016', end: '2020', isCurrent: false },
        details: ['Coursework in algorithms, databases and distributed systems.'],
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'Parcel Insights',
        description: null,
        bullets: [
          'Analysed public shipping datasets with Python and pandas.',
          'Built a small Flask dashboard to visualise delivery delays.',
        ],
        technologies: ['Python', 'pandas', 'Flask'],
        link: 'github.com/averychen-demo/parcel-insights',
      },
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'Docker Certified Associate',
        issuer: 'Docker Inc.',
        issued: '2023',
        expires: null,
        credentialId: null,
      },
    ],
    achievements: [],
    additionalSections: [],
  }
}

/** Skills the demo JD requires that the demo resume cannot evidence. */
export const DEMO_EXPECTED_MISSING = ['aws', 'kubernetes'] as const

/** Skills present in both, which must be matched. */
export const DEMO_EXPECTED_PRESENT = ['python', 'nodejs', 'postgresql', 'docker', 'sql'] as const
