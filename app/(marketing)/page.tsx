import Link from 'next/link'

import { ArrowRight, Check, ShieldCheck, X } from 'lucide-react'

import { RoleRotator } from '@/components/marketing/role-rotator'
import { TransformationFigure } from '@/components/marketing/transformation-figure'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/layout'
import { ScoreBar, ScoreDisclaimer, ScoreRing } from '@/components/ui/score'
import { PRODUCT } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Landing page.
 *
 * The narrative order is deliberate: what it does, how, then the two things
 * that actually differentiate it (it will not fabricate; the score is
 * explainable). Anti-fabrication is given a full section rather than a bullet,
 * because it is the reason to trust the product with a job application.
 *
 * Every section is bounded by a hairline and alternates between the canvas and
 * the surface colour. That alternation is the only rhythm device on the page —
 * there are no tinted section backgrounds, no gradients, and no cards used
 * decoratively. A page whose sections are distinguished by eight different
 * treatments has no way left to tell the reader which one matters.
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

const HERO_FACTS = [
  'PDF and DOCX in and out',
  'Explainable readiness score',
  'You review every change',
]

function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-line bg-surface">
      {/* Ground for the headline. Decorative, so it is hidden from the tree. */}
      <div aria-hidden="true" className="hero-graticule absolute inset-0 -z-10" />

      <div className="container-page grid gap-10 py-14 lg:grid-cols-[1.05fr_minmax(0,1fr)] lg:items-center lg:gap-16 lg:py-24">
        <div className="min-w-0">
          {/*
            A hairline chip, not a filled badge. The claim is the most
            important sentence on the page and it does not need a tinted
            lozenge to be noticed — it needs to not look like a promotional
            sticker, because it is a statement about what the product refuses
            to do.
          */}
          <p className="inline-flex items-center gap-2 rounded-md border border-line-accent px-2.5 py-1 text-2xs font-medium text-fg-accent">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Never invents experience you don&apos;t have
          </p>

          {/*
            32px at the base step, not 44.

            The rotating role is `whitespace-nowrap` inside an inline grid, so
            it wraps to its own line as a unit rather than breaking mid-word —
            which is what keeps it from overflowing. But it cannot wrap out of
            being *wider than the container*, and "Backend Engineer" set at
            44px is wider than a 320px viewport's content box. The base step is
            sized so the longest role fits the narrowest supported screen.
          */}
          <h1 className="mt-5 font-display text-serif-sm text-fg sm:text-serif-md lg:text-serif-lg">
            {/*
              One stable sentence for assistive technology. The visible
              headline cycles a job title, and an `h1` whose text changes every
              few seconds is announced again each time and reads as a different
              heading. Screen readers get the sentence; the eye gets the
              rotation.
            */}
            <span className="sr-only">
              Tailor your resume for the role you are applying to, and get hired.
            </span>

            <span aria-hidden="true">
              Tailor your resume
              <br />
              for a <RoleRotator />
              <br />
              and get hired.
            </span>
          </h1>

          <p className="mt-6 measure text-body-lg leading-relaxed text-fg-muted sm:text-lg">
            {PRODUCT.name} reads your resume and a job description, shows you exactly where you
            match and where you don&apos;t, and rewrites the parts you already have to speak the
            employer&apos;s language.
          </p>

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
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

          <ul className="mt-8 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:flex-wrap sm:gap-x-7">
            {HERO_FACTS.map((item) => (
              <li key={item} className="flex items-center gap-2 text-meta text-fg-muted">
                <Check className="size-3.5 shrink-0 text-success-solid" aria-hidden="true" />
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
    title: 'Upload your resume',
    body: 'PDF or DOCX. It is parsed into structured sections — roles, bullets, skills, education — so every later step can point at exactly where something came from.',
  },
  {
    title: 'Add the job description',
    body: 'Requirements, responsibilities and keywords are extracted from the posting, and separated into what is required and what is merely preferred.',
  },
  {
    title: 'See where you actually match',
    body: 'Each requirement is matched against evidence in your resume. Anything your resume cannot support is reported as a gap — not quietly filled in.',
  },
  {
    title: 'Review every change',
    body: 'Rewrites are proposed with the original text alongside and a reason for each. Accept, edit or reject them individually. Minor tidy-ups start accepted so you are not clicking through trivia, and every one can be undone.',
  },
  {
    title: 'Export and apply',
    body: 'Download a single-column, ATS-friendly PDF or DOCX with selectable text — checked automatically before it reaches you.',
  },
]

function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title="Five steps, and you stay in control of all of them"
        description="No black box. Every score, match and rewrite traces back to something in your own resume."
      />

      {/*
        A numbered sequence, not a grid of cards.

        Five steps in a three-column grid reads as five unrelated features: the
        eye goes left-to-right, wraps, and step 4 lands underneath step 1 with
        nothing saying which came first. A vertical list with a rule between
        each row keeps the one property that matters about a process — its
        order — and the number does the work an icon in a tinted square was
        doing badly.

        Two columns on wide screens, because five short rows in one column at
        1440px is a ribbon of text down the left edge.
      */}
      <ol className="mt-10 grid gap-x-14 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-5 border-t border-line py-6">
            {/*
              `fg-subtle`, not `fg-disabled`. The number is aria-hidden because
              the ordered list already conveys sequence to a screen reader —
              but it is still visible text, so it still has to be legible, and
              disabled grey measured 2.7:1 against the page.
            */}
            <span
              aria-hidden="true"
              className="shrink-0 text-display-xs font-semibold leading-none tabular-nums text-fg-subtle"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <h3 className="text-title font-semibold text-fg">{step.title}</h3>
              <p className="mt-1.5 text-meta leading-relaxed text-fg-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* ==========================================================================
   Anti-fabrication
   ========================================================================== */

function AntiFabrication() {
  return (
    <Section id="evidence" tone="surface">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div className="min-w-0">
          <p className="eyebrow text-fg-accent">The difference that matters</p>
          <h2 className="mt-3 text-balance font-display text-serif-xs text-fg sm:text-serif-md">
            It will not put a skill on your resume that you don&apos;t have
          </h2>

          <div className="mt-6 flex flex-col gap-4 measure text-body-lg leading-relaxed text-fg-muted">
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

        <Panel flush className="min-w-0">
          <div className="border-b border-line px-4 py-3.5 sm:px-5">
            <h3 className="text-title font-semibold text-fg">A worked example</h3>
            <p className="mt-1 text-meta leading-relaxed text-fg-muted">
              The posting asks for AWS. The resume shows Python, Docker and PostgreSQL.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 px-4 py-4 sm:px-5">
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
          </div>

          <div className="border-t border-line bg-sunken px-4 py-3.5 sm:px-5">
            <p className="eyebrow text-fg-subtle">Also never invented</p>
            <p className="mt-1.5 text-meta leading-relaxed text-fg-muted">
              Metrics, years of experience, employers, job titles, degrees, certifications, team
              sizes, or a bigger role than your resume describes. &ldquo;Helped migrate&rdquo; never
              becomes &ldquo;led the migration&rdquo;.
            </p>
          </div>
        </Panel>
      </div>
    </Section>
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
  const Icon = good ? Check : X

  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border p-3.5',
        good ? 'border-success-line bg-success-bg' : 'border-danger-line bg-danger-bg',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
          good ? 'bg-success-solid/15 text-success-solid' : 'bg-danger-solid/15 text-danger-solid',
        )}
        aria-hidden="true"
      >
        <Icon className="size-2.5" />
      </span>
      <div className="min-w-0">
        <p className={cn('text-meta font-semibold', good ? 'text-success-fg' : 'text-danger-fg')}>
          {label}
        </p>
        <p className="mt-1 text-meta leading-relaxed text-fg-muted">{text}</p>
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
    <Section>
      <SectionHeading
        eyebrow="Before and after"
        title="Stronger writing, identical facts"
        description="Bullets are rewritten for clarity and relevance using only what your resume already says."
      />

      {/*
        One bordered table of examples rather than three cards each containing
        two boxes. That arrangement put six bordered rectangles and three
        shadowed containers on screen to show three sentences.
      */}
      <Panel flush className="mt-10">
        <ul className="divide-y divide-line">
          {EXAMPLES.map((example) => (
            <li key={example.before} className="px-4 py-4 sm:px-5">
              <div className="grid gap-2.5 md:grid-cols-2">
                <div className="rounded-lg border border-diff-removed-line bg-diff-removed-bg p-3">
                  <p className="eyebrow text-diff-removed-fg">Before</p>
                  <p className="mt-1.5 text-meta leading-relaxed text-fg">{example.before}</p>
                </div>
                <div className="rounded-lg border border-diff-added-line bg-diff-added-bg p-3">
                  <p className="eyebrow text-diff-added-fg">After</p>
                  <p className="mt-1.5 text-meta leading-relaxed text-fg">{example.after}</p>
                </div>
              </div>
              <p className="mt-2.5 text-2xs leading-relaxed text-fg-subtle">{example.note}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </Section>
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

const ATS_DIMENSIONS = [
  { label: 'Skill alignment', value: 88 },
  { label: 'Keyword alignment', value: 74 },
  { label: 'Formatting compatibility', value: 100 },
]

function AtsSection() {
  return (
    <Section id="ats" tone="surface">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_1.1fr] lg:items-center lg:gap-16">
        <Panel className="min-w-0">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
            <ScoreRing score={82} size="lg" caption="ATS Readiness estimate" />
            {/*
              The product's own `ScoreBar`, not a marketing imitation of one.

              Two reasons. It cannot drift from what the app actually renders,
              which is the whole claim this section is making. And the
              hand-rolled version used a `<dl>` whose `<dt>`/`<dd>` sat two
              levels below it inside a flex wrapper — which is invalid, since a
              definition list may only wrap its groups in a single `<div>`.
            */}
            <div className="min-w-0 flex-1 space-y-3.5">
              {ATS_DIMENSIONS.map((row) => (
                <ScoreBar key={row.label} label={row.label} score={row.value} />
              ))}
            </div>
          </div>
          <ScoreDisclaimer className="mt-5 border-t border-line pt-4 text-2xs" />
        </Panel>

        <div className="min-w-0">
          <p className="eyebrow text-fg-accent">ATS readiness</p>
          <h2 className="mt-3 text-balance font-display text-serif-xs text-fg sm:text-serif-md">
            A score you can act on, with the maths shown
          </h2>

          <p className="mt-5 measure text-body-lg leading-relaxed text-fg-muted">
            Seven weighted dimensions, computed deterministically from your resume and the posting —
            no model decides your number, so it is reproducible and every point is attributable to
            something you can change.
          </p>

          <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
            {ATS_CHECKS.map((check) => (
              <li
                key={check}
                className="flex items-start gap-2.5 text-meta leading-relaxed text-fg-muted"
              >
                <Check className="mt-0.5 size-3.5 shrink-0 text-success-solid" aria-hidden="true" />
                {check}
              </li>
            ))}
          </ul>

          <p className="mt-7 border-l-2 border-line-accent pl-4 text-meta leading-relaxed text-fg-muted">
            <strong className="font-semibold text-fg">To be clear:</strong> no tool can promise a
            specific result in a specific employer&apos;s ATS — none of them publish how they score.
            What we can promise is that your resume follows the conventions those systems depend on,
            and that you can see exactly which ones.
          </p>
        </div>
      </div>
    </Section>
  )
}

/* ==========================================================================
   Features
   ========================================================================== */

const FEATURES = [
  {
    title: 'Change-by-change review',
    body: 'Every rewrite shows the original, the proposal, and why. Accept, edit or reject each one.',
  },
  {
    title: 'Honest gap reporting',
    body: 'Requirements you cannot evidence are listed plainly, so you know what to work on next.',
  },
  {
    title: 'Documents worth sending',
    body: 'PDF and DOCX generated from one layout, verified after generation by reading the text back out.',
  },
  {
    title: 'Private by default',
    body: 'Resume content is never written to logs. Delete your account and everything goes with it.',
  },
  {
    title: 'Version history',
    body: 'Your original is kept untouched as version 1. Every export is snapshotted alongside it.',
  },
  {
    title: 'Injection resistant',
    body: 'Uploaded documents are treated as data, never instructions — including ones that try to talk to the model.',
  },
]

function Features() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Features"
        title="Built like a tool you would trust with a job application"
        description="The unglamorous parts — verification, privacy, reversibility — are the parts that matter here."
      />

      {/*
        Six bordered boxes in three columns was the most generic arrangement on
        the page, and the icons were decoration: a tinted square holding a
        shield or a lock, repeated six times, telling the reader nothing the
        heading beside it did not already say.

        A hairline-divided list instead. Same six facts, a third of the visual
        weight, and the section stops competing with the product readouts it
        sits between.
      */}
      <dl className="mt-10 grid gap-x-14 border-t border-line sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="border-b border-line py-5">
            <dt className="text-title font-semibold text-fg">{feature.title}</dt>
            <dd className="mt-1.5 text-meta leading-relaxed text-fg-muted">{feature.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

/* ==========================================================================
   Pricing
   ========================================================================== */

const PLANS = [
  {
    name: 'Free',
    price: 'Free',
    cadence: 'while the product is in development',
    description: 'Everything in the product today, with reasonable usage limits.',
    features: [
      'Unlimited resume uploads',
      'Full analysis and gap reporting',
      'Change-by-change review',
      'PDF and DOCX export',
      'Version history',
    ],
    cta: 'Get started',
    available: true,
  },
  {
    name: 'Pro',
    price: 'Not yet available',
    cadence: 'on the roadmap',
    description: 'Higher limits and the workflow features on the roadmap.',
    features: [
      'Everything in Free',
      'Cover letter drafting',
      'LinkedIn profile alignment',
      'Application tracking',
      'Priority processing',
    ],
    cta: 'Not yet available',
    available: false,
  },
]

function Pricing() {
  return (
    <Section id="pricing" tone="surface">
      <SectionHeading
        centered
        eyebrow="Pricing"
        title="Free while the product is in development"
        description="No card required. Paid plans are not available yet, and nothing here is charged for."
      />

      {/*
        Centred, and narrower than the section.

        A pricing pair is not a full-width row of content — it is a choice
        between two things, and centring it is what says so. Left-aligned at
        56rem on a 1440px page it read as an unfinished row that had run out of
        cards.
      */}
      <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
        {PLANS.map((plan) => (
          <Panel
            key={plan.name}
            flush
            className={cn(
              'flex min-w-0 flex-col',
              // The available plan gets a stronger edge, not a coloured
              // background or a "Most popular" ribbon. There are two plans and
              // one of them cannot be bought; a ribbon would be theatre.
              //
              // The unavailable one is *not* dimmed with opacity. Fading a
              // whole panel fades its text too: at 90% the metadata line
              // measured under 4.5:1 against the surface. Unavailability is
              // stated by the price, the cadence and a disabled control —
              // three places, none of which cost anyone legibility.
              plan.available && 'border-line-accent',
            )}
          >
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-title font-semibold text-fg">{plan.name}</h3>
                {plan.available ? (
                  <span className="text-2xs font-medium text-fg-accent">Available now</span>
                ) : null}
              </div>
              <p
                className={cn(
                  'mt-2 font-semibold text-fg',
                  plan.available ? 'text-display-sm' : 'text-title',
                )}
              >
                {plan.price}
              </p>
              <p className="mt-0.5 text-2xs text-fg-subtle">{plan.cadence}</p>
              <p className="mt-2.5 text-meta leading-relaxed text-fg-muted">{plan.description}</p>
            </div>

            <ul className="flex flex-1 flex-col gap-2 px-4 py-4 sm:px-5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-meta text-fg-muted">
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-success-solid"
                    aria-hidden="true"
                  />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="border-t border-line px-4 py-4 sm:px-5">
              {plan.available ? (
                <Button fullWidth asChild>
                  <Link href="/signup">{plan.cta}</Link>
                </Button>
              ) : (
                <Button fullWidth variant="secondary" disabled>
                  {plan.cta}
                </Button>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </Section>
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
    <Section id="faq">
      <SectionHeading
        centered
        eyebrow="FAQ"
        title="Questions worth asking before you trust a tool with this"
      />

      {/*
        Native `<details>`, not a JavaScript accordion. It is keyboard
        operable, findable by the browser's own in-page search — which an
        accordion built from divs is not — and it works before hydration.
      */}
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-line border-y border-line">
        {FAQS.map((item) => (
          <details key={item.q} className="group">
            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-body-lg font-medium text-fg transition-colors hover:text-fg-accent">
              {item.q}
              <span
                aria-hidden="true"
                className="relative flex size-5 shrink-0 items-center justify-center text-fg-subtle"
              >
                {/*
                  A plus that becomes a minus: two rules, one of which rotates
                  away. A rotating chevron reads as "expand downward", which is
                  ambiguous in a stack; plus-to-minus is unambiguous about
                  which state it is in.
                */}
                <span className="absolute h-px w-3 bg-current" />
                <span className="absolute h-3 w-px bg-current transition-transform duration-[--duration-fast] ease-[--ease-standard] group-open:rotate-90 group-open:opacity-0" />
              </span>
            </summary>
            <p className="measure-wide pb-5 pr-8 text-meta leading-relaxed text-fg-muted">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  )
}

/* ==========================================================================
   Final CTA
   ========================================================================== */

function FinalCta() {
  return (
    <section className="bg-surface">
      <div className="container-page py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance font-display text-serif-xs text-fg sm:text-serif-md">
            Send a resume that answers the job you&apos;re applying for
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-body-lg leading-relaxed text-fg-muted">
            Upload what you have. See where you stand. Decide what changes.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-2.5 sm:flex-row">
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
      </div>
    </section>
  )
}

/* ==========================================================================
   Shared
   ========================================================================== */

/**
 * A landing-page section.
 *
 * One component decides the vertical rhythm, the container and the closing
 * rule for all eight of them, so the page's cadence is a single decision
 * rather than eight `py-16 lg:py-24 border-b border-line` strings that were
 * already three variants apart.
 */
function Section({
  id,
  tone = 'canvas',
  children,
}: {
  id?: string
  tone?: 'canvas' | 'surface'
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        'border-b border-line',
        tone === 'surface' && 'bg-surface',
        // Clears the sticky header when a nav link jumps here.
        id && 'scroll-mt-16',
      )}
    >
      <div className="container-page py-14 lg:py-22">{children}</div>
    </section>
  )
}

/**
 * Section heading.
 *
 * Left-aligned. Every section on this page once opened with a centred eyebrow
 * over a centred title over a centred paragraph, and four of them then dropped
 * into a card grid — so the page had one rhythm repeated eight times and no way
 * to tell the reader which section was the important one. A reader scanning a
 * centred column has to find the start of every line; a left-aligned one has a
 * single edge to run down.
 *
 * Centring is the exception rather than the house style: the six narrative
 * sections run left, and only pricing, the FAQ and the closing call to action
 * centre — the three whose content is a centred island rather than a column of
 * prose.
 */
function SectionHeading({
  eyebrow,
  title,
  description,
  centered = false,
}: {
  eyebrow: string
  title: string
  description?: string
  /**
   * For a section whose content is itself centred — pricing and the FAQ.
   *
   * Those two are a choice between options and a reference list, not a stretch
   * of narrative, so their content is a centred island narrower than the
   * section. A left-aligned heading over a centred island leaves the two with
   * different left edges, which reads as a mistake rather than as a rhythm
   * change. Where the content centres, the heading centres with it.
   */
  centered?: boolean
}) {
  return (
    <div className={cn('max-w-2xl', centered && 'mx-auto text-center')}>
      <p className="eyebrow text-fg-accent">{eyebrow}</p>
      {/* `text-balance` so a two-line heading breaks evenly instead of
          stranding one word on the second line. */}
      <h2 className="mt-3 text-balance font-display text-serif-xs text-fg sm:text-serif-md">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-pretty text-body-lg leading-relaxed text-fg-muted">{description}</p>
      ) : null}
    </div>
  )
}
