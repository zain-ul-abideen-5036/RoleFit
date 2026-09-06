import Link from 'next/link'

import {
  ArrowRight,
  CheckCircle2,
  FileDown,
  FileSearch,
  GitCompare,
  ListChecks,
  Lock,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  XCircle,
} from 'lucide-react'

import { TransformationFigure } from '@/components/marketing/transformation-figure'
import { Badge } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScoreRing, ScoreDisclaimer } from '@/components/ui/score'
import { PRODUCT } from '@/lib/constants'

/**
 * Landing page.
 *
 * The narrative order is deliberate: what it does, how, then the two things
 * that actually differentiate it (it will not fabricate; the score is
 * explainable). Anti-fabrication is given a full section rather than a bullet,
 * because it is the reason to trust the product with a job application.
 */

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <AntiFabrication />
      <BeforeAfter />
      <AtsSection />
      <Features />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  )
}

/* ==========================================================================
   Hero
   ========================================================================== */

function Hero() {
  return (
    <section className="border-b border-line bg-surface">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:py-24">
        <div>
          <Badge tone="accent" className="mb-5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Never invents experience you don&apos;t have
          </Badge>

          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[3.4rem]">
            Tailor your resume.
            <br />
            Match the role.
            <br />
            <span className="text-fg-accent">Get hired.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted">
            {PRODUCT.name} reads your resume and a job description, shows you exactly where you
            match and where you don&apos;t, and rewrites the parts you already have to speak the
            employer&apos;s language.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" variant="cta" asChild>
              <Link href="/signup">
                Optimize my resume
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-fg-muted">
            {[
              'PDF and DOCX in and out',
              'Explainable readiness score',
              'You approve every change',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success-solid" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <TransformationFigure />
      </div>
    </section>
  )
}

/* ==========================================================================
   How it works
   ========================================================================== */

const STEPS = [
  {
    Icon: FileSearch,
    title: 'Upload your resume',
    body: 'PDF or DOCX. It is parsed into structured sections — roles, bullets, skills, education — so every later step can point at exactly where something came from.',
  },
  {
    Icon: Target,
    title: 'Add the job description',
    body: 'Requirements, responsibilities and keywords are extracted from the posting, and separated into what is required and what is merely preferred.',
  },
  {
    Icon: ListChecks,
    title: 'See where you actually match',
    body: 'Each requirement is matched against evidence in your resume. Anything your resume cannot support is reported as a gap — not quietly filled in.',
  },
  {
    Icon: SlidersHorizontal,
    title: 'Review every change',
    body: 'Rewrites are proposed with the original text alongside and a reason for each. Accept, edit or reject them individually. Nothing ships without your say-so.',
  },
  {
    Icon: FileDown,
    title: 'Export and apply',
    body: 'Download a single-column, ATS-friendly PDF or DOCX with selectable text — checked automatically before it reaches you.',
  },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-line">
      <div className="container-page py-16 lg:py-24">
        <SectionHeading
          eyebrow="How it works"
          title="Five steps, and you stay in control of all of them"
          description="No black box. Every score, match and rewrite traces back to something in your own resume."
        />

        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full">
                <CardHeader>
                  <div className="mb-1 flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-fg-accent">
                      <step.Icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-fg-subtle">
                      Step {index + 1}
                    </span>
                  </div>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.body}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ==========================================================================
   Anti-fabrication
   ========================================================================== */

function AntiFabrication() {
  return (
    <section id="evidence" className="scroll-mt-20 border-b border-line bg-surface">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <div>
          <Badge tone="success" className="mb-5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            The difference that matters
          </Badge>

          <h2 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            It will not put a skill on your resume that you don&apos;t have
          </h2>

          <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed text-fg-muted">
            <p>
              Most AI resume tools will happily add whatever the posting asks for. That is not
              optimization — it is writing a claim you have to defend in an interview, or explain to
              a recruiter who checks.
            </p>
            <p>
              {PRODUCT.name} works the other way round. Every rewrite is checked against your
              original resume before you ever see it. A skill, employer, metric or qualification
              that isn&apos;t in your source document is rejected automatically — not by asking the
              model nicely, but by verifying its output and discarding what fails.
            </p>
            <p>
              What the job needs and you don&apos;t have gets reported to you as a gap, so you can
              decide what to do about it.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h3">A worked example</CardTitle>
            <CardDescription>
              The posting asks for AWS. The resume shows Python, Docker and PostgreSQL.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ComparisonRow
              tone="bad"
              label="What most tools do"
              text="Adds “AWS” to your skills section, because the job asked for it."
            />
            <ComparisonRow
              tone="good"
              label={`What ${PRODUCT.name} does`}
              text="Reports AWS as Missing / not verified, leaves it off the resume, and strengthens the Docker and PostgreSQL evidence you actually have."
            />

            <div className="mt-2 rounded-lg border border-line bg-sunken p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                Also never invented
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Metrics, years of experience, employers, job titles, degrees, certifications, team
                sizes, or a bigger role than your resume describes. &ldquo;Helped migrate&rdquo;
                never becomes &ldquo;led the migration&rdquo;.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function ComparisonRow({
  tone,
  label,
  text,
}: {
  tone: 'good' | 'bad'
  label: string
  text: string
}) {
  const good = tone === 'good'
  const Icon = good ? CheckCircle2 : XCircle

  return (
    <div
      className={
        good
          ? 'flex gap-3 rounded-lg border border-success-line bg-success-bg p-4'
          : 'flex gap-3 rounded-lg border border-danger-line bg-danger-bg p-4'
      }
    >
      <Icon
        className={
          good ? 'mt-0.5 size-4 shrink-0 text-success-fg' : 'mt-0.5 size-4 shrink-0 text-danger-fg'
        }
        aria-hidden="true"
      />
      <div>
        <p
          className={
            good ? 'text-sm font-semibold text-success-fg' : 'text-sm font-semibold text-danger-fg'
          }
        >
          {label}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{text}</p>
      </div>
    </div>
  )
}

/* ==========================================================================
   Before / after
   ========================================================================== */

const EXAMPLES = [
  {
    before: 'Worked on machine learning project.',
    after:
      'Built a machine learning classification pipeline in Python and scikit-learn, from data preparation through model evaluation.',
    note: 'Every technology named appears in the candidate’s own skills section.',
  },
  {
    before: 'Responsible for managing the deployment pipeline.',
    after: 'Managed the deployment pipeline across three services using GitHub Actions.',
    note: 'Filler removed; “three services” and the tool were already in the resume.',
  },
  {
    before: 'Helped migrate the reporting database, which reduced query times by 35%.',
    after: 'Migrated the reporting database to PostgreSQL, cutting query times by 35%.',
    note: 'The 35% is preserved exactly. It is never rounded, inflated, or invented.',
  },
]

function BeforeAfter() {
  return (
    <section className="border-b border-line">
      <div className="container-page py-16 lg:py-24">
        <SectionHeading
          eyebrow="Before and after"
          title="Stronger writing, identical facts"
          description="Bullets are rewritten for clarity and relevance using only what your resume already says."
        />

        <div className="mt-12 flex flex-col gap-4">
          {EXAMPLES.map((example) => (
            <Card key={example.before}>
              <CardContent className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
                <div className="rounded-lg border border-diff-removed-line bg-diff-removed-bg p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-diff-removed-fg">
                    <GitCompare className="size-3.5" aria-hidden="true" />
                    Before
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-fg">{example.before}</p>
                </div>
                <div className="rounded-lg border border-diff-added-line bg-diff-added-bg p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-diff-added-fg">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    After
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-fg">{example.after}</p>
                </div>
                <p className="text-xs leading-relaxed text-fg-subtle md:col-span-2">
                  {example.note}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   ATS readiness
   ========================================================================== */

const ATS_CHECKS = [
  'Single-column layout that parsers read in the right order',
  'Standard section headings, not creative ones',
  'No tables, text boxes, images or skill bars',
  'Selectable text — never a picture of a resume',
  'Contact details in the body, not a header or footer',
  'Consistent dates and readable bullet lengths',
]

function AtsSection() {
  return (
    <section id="ats" className="scroll-mt-20 border-b border-line bg-surface">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16 lg:py-24">
        <Card>
          <CardContent className="flex flex-col items-center gap-6 p-8">
            <ScoreRing score={82} size="lg" caption="ATS Readiness estimate" />
            <div className="w-full">
              {[
                { label: 'Skill alignment', value: 88 },
                { label: 'Keyword alignment', value: 74 },
                { label: 'Formatting compatibility', value: 100 },
              ].map((row) => (
                <div key={row.label} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm text-fg-muted">{row.label}</span>
                    <span className="text-sm font-semibold tabular-nums text-fg">{row.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${row.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <ScoreDisclaimer className="text-center" />
          </CardContent>
        </Card>

        <div>
          <Badge tone="accent" className="mb-5">
            <ScanLine className="size-3.5" aria-hidden="true" />
            ATS readiness
          </Badge>

          <h2 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            A score you can act on, with the maths shown
          </h2>

          <p className="mt-5 text-base leading-relaxed text-fg-muted">
            Seven weighted dimensions, computed deterministically from your resume and the posting —
            no model decides your number, so it is reproducible and every point is attributable to
            something you can change.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {ATS_CHECKS.map((check) => (
              <li
                key={check}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-fg-muted"
              >
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-success-solid"
                  aria-hidden="true"
                />
                {check}
              </li>
            ))}
          </ul>

          <p className="mt-8 rounded-lg border border-line bg-canvas p-4 text-sm leading-relaxed text-fg-muted">
            <strong className="font-semibold text-fg">To be clear:</strong> no tool can promise a
            specific result in a specific employer&apos;s ATS — none of them publish how they score.
            What we can promise is that your resume follows the conventions those systems depend on,
            and that you can see exactly which ones.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   Features
   ========================================================================== */

const FEATURES = [
  {
    Icon: GitCompare,
    title: 'Change-by-change review',
    body: 'Every rewrite shows the original, the proposal, and why. Accept, edit or reject each one.',
  },
  {
    Icon: ListChecks,
    title: 'Honest gap reporting',
    body: 'Requirements you cannot evidence are listed plainly, so you know what to work on next.',
  },
  {
    Icon: FileDown,
    title: 'Documents worth sending',
    body: 'PDF and DOCX generated from one layout, verified after generation by reading the text back out.',
  },
  {
    Icon: Lock,
    title: 'Private by default',
    body: 'Resume content is never written to logs. Delete your account and everything goes with it.',
  },
  {
    Icon: ScanLine,
    title: 'Version history',
    body: 'Your original is kept untouched as version 1. Every export is snapshotted alongside it.',
  },
  {
    Icon: ShieldCheck,
    title: 'Injection resistant',
    body: 'Uploaded documents are treated as data, never instructions — including ones that try to talk to the model.',
  },
]

function Features() {
  return (
    <section className="border-b border-line">
      <div className="container-page py-16 lg:py-24">
        <SectionHeading
          eyebrow="Features"
          title="Built like a tool you would trust with a job application"
          description="The unglamorous parts — verification, privacy, reversibility — are the parts that matter here."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="h-full">
              <CardHeader>
                <span className="mb-1 flex size-9 items-center justify-center rounded-lg bg-sunken text-fg-muted">
                  <feature.Icon className="size-4.5" aria-hidden="true" />
                </span>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   Pricing
   ========================================================================== */

const PLANS = [
  {
    name: 'Free',
    price: 'Free',
    cadence: 'while in development',
    description: 'Everything in the product today, with reasonable usage limits.',
    features: [
      'Unlimited resume uploads',
      'Full analysis and gap reporting',
      'Change-by-change review',
      'PDF and DOCX export',
      'Version history',
    ],
    cta: 'Get started',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: 'Not yet available',
    cadence: 'planned',
    description: 'Higher limits and the workflow features on the roadmap.',
    features: [
      'Everything in Free',
      'Cover letter drafting',
      'LinkedIn profile alignment',
      'Application tracking',
      'Priority processing',
    ],
    cta: 'Not yet available',
    highlighted: false,
  },
]

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-b border-line bg-surface">
      <div className="container-page py-16 lg:py-24">
        <SectionHeading
          eyebrow="Pricing"
          title="Free while the product is in development"
          description="No card required. Paid plans are not available yet, and nothing here is charged for."
        />

        <div className="mx-auto mt-12 grid max-w-3xl gap-5 md:grid-cols-2">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={plan.highlighted ? 'border-line-accent ring-1 ring-accent/20' : undefined}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle as="h3">{plan.name}</CardTitle>
                  {plan.highlighted ? <Badge tone="accent">Available now</Badge> : null}
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-fg">{plan.price}</p>
                <p className="text-xs text-fg-subtle">{plan.cadence}</p>
                <CardDescription className="mt-2">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-fg-muted">
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-success-solid"
                        aria-hidden="true"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  {plan.highlighted ? (
                    <Button fullWidth asChild>
                      <Link href="/signup">{plan.cta}</Link>
                    </Button>
                  ) : (
                    <Button fullWidth variant="secondary" disabled>
                      {plan.cta}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   FAQ
   ========================================================================== */

const FAQS = [
  {
    q: 'Will this add skills I don’t have so I match the job better?',
    a: 'No, and it is built so that it cannot. Every proposed rewrite is checked against your original resume before you see it, and anything introducing a skill, employer, metric or qualification that is not in your source document is discarded automatically. Requirements you cannot evidence are reported to you as gaps instead.',
  },
  {
    q: 'Is the ATS Readiness Score the score a real ATS will give me?',
    a: 'No. No ATS vendor publishes its algorithm, and any product claiming to reproduce one is guessing. Our score estimates compatibility using widely-documented ATS-friendly formatting practices and how well your resume aligns with the posting. It is reproducible and every point is explained, which is what makes it useful.',
  },
  {
    q: 'What file formats can I upload?',
    a: 'PDF and DOCX, up to 4.5 MB. Scanned or image-only PDFs cannot be read — if a document has no selectable text, we tell you rather than producing an empty resume.',
  },
  {
    q: 'Can I edit what it suggests?',
    a: 'Yes. Every change is presented individually with the original alongside it. You can accept it, reject it, or replace it with your own wording. Anything you have not explicitly accepted is not written into the document.',
  },
  {
    q: 'What happens to my resume data?',
    a: 'It is stored against your account so you can come back to it, and it is never written to application logs. Deleting your account removes your resumes, analyses, generated documents and stored files. There is a delete control in Settings.',
  },
  {
    q: 'Does my resume get sent to an AI provider?',
    a: 'Only if the deployment is configured to use one. RoleFit also runs a rule-based engine that performs terminology alignment, filler removal and relevance reordering entirely on our own servers, with no third party involved. The app tells you which engine produced your result.',
  },
  {
    q: 'What if the job description contains hidden instructions?',
    a: 'Uploaded documents and pasted postings are treated strictly as data. They are isolated from the system instructions, and — more importantly — the output is verified against your resume regardless of what any document asked for. A posting cannot talk the product into changing your resume.',
  },
]

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-b border-line">
      <div className="container-page py-16 lg:py-24">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions worth asking before you trust a tool with this"
        />

        <div className="mx-auto mt-12 max-w-3xl divide-y divide-line border-y border-line">
          {FAQS.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-medium text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {item.q}
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-fg-subtle transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-5 pr-10 text-sm leading-relaxed text-fg-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   Final CTA
   ========================================================================== */

function FinalCta() {
  return (
    <section className="bg-surface">
      <div className="container-page py-16 text-center lg:py-24">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Send a resume that answers the job you&apos;re applying for
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-fg-muted">
          Upload what you have. See where you stand. Decide what changes.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" variant="cta" asChild>
            <Link href="/signup">
              Create a free account
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   Shared
   ========================================================================== */

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-accent">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-fg-muted">{description}</p>
      ) : null}
    </div>
  )
}
