/**
 * Writes the resume PDF the E2E suite uploads.
 *
 * Uses the application's own PDF renderer so the fixture is a document the
 * product genuinely produces — a hand-made or committed binary would drift.
 * Run with the `react-server` export condition so the `server-only` guard
 * resolves to its empty module.
 */
import { writeFileSync } from 'node:fs'

import { generatePdf } from '@/lib/documents/pdf'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

async function main(): Promise<void> {
  const target = process.argv[2]
  if (!target) throw new Error('Usage: make-fixture.ts <output-path>')

  const bytes = await generatePdf(demoResumeProfile())
  writeFileSync(target, bytes)
  process.stdout.write(`Wrote fixture resume (${bytes.length} bytes) to ${target}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exit(1)
})
