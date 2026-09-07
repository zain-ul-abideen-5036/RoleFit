import type { Metadata } from 'next'

import { LegalPage, LegalSection } from '@/components/marketing/legal-page'
import { ATS_SCORE_DISCLAIMER, PRODUCT } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'AI disclaimer',
  description: `What ${PRODUCT.name}'s AI does, what it refuses to do, and what it cannot promise.`,
}

export default function AiDisclaimerPage() {
  return (
    <LegalPage
      title="AI disclaimer"
      updated="This page states plainly what the product does and does not claim. It is written to be accurate rather than reassuring."
    >
      <LegalSection title="What the AI does">
        <p>
          {PRODUCT.name} uses a language model for one narrow job: rewriting sentences you have
          already written so they read more clearly and use the terminology of the role you are
          applying for. That is the only place a model is involved in producing your resume.
        </p>
      </LegalSection>

      <LegalSection title="What the AI does not decide">
        <p>
          No model decides your score, whether a requirement counts as met, or which of your
          experience is relevant. All of that is computed deterministically from your resume and the
          job posting, which is why the same inputs always produce the same result and why every
          point of the score can be explained.
        </p>
      </LegalSection>

      <LegalSection title="Fabrication">
        <p>
          The product will not add a skill, employer, job title, degree, certification, date, metric
          or achievement that is not already in your resume. This is not merely instructed in a
          prompt — model output is verified against your source document, and anything introducing
          unsupported information is discarded before you see it.
        </p>
        <p>
          <strong>What this does not guarantee.</strong> The verification operates on the text of
          your resume. If your resume itself contains something inaccurate, the product has no way
          to know, and will carry it through. You remain responsible for the accuracy of your own
          resume.
        </p>
      </LegalSection>

      <LegalSection title="The ATS Readiness Score">
        <p>{ATS_SCORE_DISCLAIMER}</p>
        <p>
          No applicant tracking system publishes its scoring algorithm. Any product claiming to
          predict a specific ATS result is guessing. What this score does is measure alignment with
          the posting and adherence to widely-documented ATS-friendly formatting conventions, and
          show you the breakdown so you can act on it.
        </p>
      </LegalSection>

      <LegalSection title="No guarantee of outcome">
        <p>
          Using {PRODUCT.name} does not guarantee an interview, a response, or a job. Hiring
          decisions depend on factors no resume tool can influence. The product aims to make sure
          your resume is readable by the software in front of a recruiter and clearly presents the
          experience you genuinely have.
        </p>
      </LegalSection>

      <LegalSection title="Review your resume before sending it">
        <p>
          Automated rewriting can produce phrasing that is technically supported but misleading in
          context, or that loses a nuance that mattered. Read the generated document before you send
          it. Every change is shown to you individually for exactly this reason.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
