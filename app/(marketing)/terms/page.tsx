import type { Metadata } from 'next'

import { LegalPage, LegalSection } from '@/components/marketing/legal-page'
import { PRODUCT } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Terms of service',
  description: `The terms that apply to using ${PRODUCT.name}.`,
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="These terms are a template written to match how the software behaves. They have not been reviewed by a lawyer and should be replaced before any commercial launch."
    >
      <LegalSection title="Using the service">
        <p>
          {PRODUCT.name} is provided to help you tailor your own resume to a specific job posting.
          You may use it for your own applications. You must not use it to process another
          person&apos;s resume without their knowledge, to generate content you know to be false, or
          to attempt to disrupt the service for others.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep all rights to the resumes and job descriptions you upload, and to the documents
          the product generates from them. You grant only the permission needed to operate the
          service: to store your content, process it to produce your results, and return it to you.
        </p>
        <p>
          You are responsible for the accuracy of what you upload. The product will not add claims
          your resume does not support, but it cannot verify that your resume is truthful.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          You are responsible for keeping your password secure. Changing your password signs out
          every existing session, including any an attacker may hold. You can delete your account at
          any time from Settings; deletion removes your data and is not reversible.
        </p>
      </LegalSection>

      <LegalSection title="Availability and limits">
        <p>
          The service is provided as-is, with no guarantee of availability. Usage limits apply to
          uploads, analyses, optimizations and exports to keep the service usable for everyone.
          Automated or bulk use may be limited or blocked.
        </p>
      </LegalSection>

      <LegalSection title="No guarantee of outcome">
        <p>
          Nothing here promises an interview or a job. See the{' '}
          <a className="text-fg-accent underline underline-offset-4" href="/ai-disclaimer">
            AI disclaimer
          </a>{' '}
          for what the product does and does not claim about ATS compatibility.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          These terms may change as the product develops. Material changes will be reflected on this
          page.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions can go to{' '}
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
