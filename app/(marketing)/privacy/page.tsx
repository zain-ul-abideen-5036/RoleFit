import type { Metadata } from 'next'

import { LegalPage, LegalSection } from '@/components/marketing/legal-page'
import { PRODUCT } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `How ${PRODUCT.name} handles the personal information in your resume.`,
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="This policy describes how the application is built. It is a template and has not been reviewed by a lawyer."
    >
      <LegalSection title="What this covers">
        <p>
          A resume is one of the most personal documents most people produce. It carries your name,
          contact details, employment history, education and often your location. This page
          describes what {PRODUCT.name} does with that information, written to match how the
          software actually behaves rather than to cover every legal eventuality.
        </p>
      </LegalSection>

      <LegalSection title="What is collected">
        <ul>
          <li>
            <strong>Account details.</strong> Your email address and a hashed password. Passwords
            are hashed with bcrypt and are never stored or logged in readable form.
          </li>
          <li>
            <strong>Resume content.</strong> The file you upload, the text extracted from it, and
            the structured parse of that text.
          </li>
          <li>
            <strong>Job descriptions.</strong> The text you paste, and the requirements extracted
            from it.
          </li>
          <li>
            <strong>Generated documents.</strong> The PDF and DOCX files produced for you.
          </li>
          <li>
            <strong>Operational records.</strong> Timestamps, which actions occurred, and a
            truncated IP prefix (a /24 for IPv4, /48 for IPv6) for abuse prevention. Full IP
            addresses are not retained.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="What is deliberately not collected">
        <p>
          Resume text, job description text, contact details, passwords, session tokens and API keys
          are never written to application logs. The logger redacts these fields at every nesting
          level, and replaces any long free-text value with a length summary rather than a
          truncation — a truncated resume is still personal data.
        </p>
      </LegalSection>

      <LegalSection title="AI processing">
        <p>
          Whether your resume is sent to a third-party AI provider depends on how this deployment is
          configured, and the application tells you which engine produced your result.
        </p>
        <ul>
          <li>
            In the default <strong>rule-based</strong> mode, no resume content leaves the server.
            Terminology alignment, filler removal and relevance reordering run locally.
          </li>
          <li>
            When a provider such as Anthropic or OpenAI is configured, the resume text and job
            description are sent to that provider to produce rewrite suggestions, subject to that
            provider&apos;s own terms and retention policy.
          </li>
        </ul>
        <p>API keys are held server-side only and are never exposed to the browser.</p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          Your data is kept while your account exists, so you can return to previous analyses and
          documents. Deleting a resume removes it from the product immediately. Deleting your
          account removes your resumes, versions, job descriptions, analyses, optimization runs,
          change records and generated documents, and deletes the stored files behind them. That
          control is in Settings, and it does not require contacting anyone.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Access is enforced per user at the data layer: every query is scoped to the account making
          it, so one user cannot reach another&apos;s resume even with a valid identifier. Sessions
          are httpOnly cookies, state-changing requests are origin-checked, uploads are validated by
          byte signature rather than filename, and stored objects use server-generated keys that
          contain nothing user-supplied.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about this policy can go to{' '}
          <a
            className="text-fg-accent underline underline-offset-4"
            href={`mailto:${PRODUCT.supportEmail}`}
          >
            {PRODUCT.supportEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
