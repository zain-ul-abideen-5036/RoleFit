/**
 * AI provider check.
 *
 * Answers "is the AI actually running?" without signing in, uploading a resume
 * and reading server logs. It loads the AI settings from an env file, sends the
 * built-in demo resume and job posting through the real optimization prompt
 * once, and prints which engine produced the result and what it changed.
 *
 *   npm run ai:check                     # reads .env.local
 *   npm run ai:check -- path/to/env      # or an explicit file
 *
 * Exactly one model call is made, so it is safe on a free-tier quota. The key
 * is never printed. The demo resume is fictional, so no personal data leaves
 * the machine.
 */
import { loadEnvFileIfPresent } from './lib/env-file'

const envFile = process.argv[2] ?? '.env.local'
loadEnvFileIfPresent(envFile)

// The app's env schema requires these even though this check never uses them.
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:1/unused'
process.env.AUTH_SECRET ??= 'unused-by-the-ai-check-but-required-by-the-schema'
process.env.LOG_LEVEL ??= 'error'

/** An expected failure: reported as one line, not a stack trace. */
class CheckFailed extends Error {}

function fail(message: string): never {
  throw new CheckFailed(message)
}

async function main(): Promise<void> {
  const { getEnv } = await import('@/lib/config/env')
  const { getAiProvider } = await import('@/lib/ai')
  const { analyzeResume } = await import('@/lib/optimization/pipeline')
  const { proposeLlmOptimization } = await import('@/lib/optimization/llm')
  const { validateAndApplyProposal } = await import('@/lib/optimization/apply')
  const { parseJobDescription } = await import('@/lib/parsing/job-description-parser')
  const { AppError } = await import('@/lib/errors')
  const { demoResumeProfile, DEMO_JOB_DESCRIPTION_TEXT } =
    await import('@/tests/fixtures/demo-data')

  const env = getEnv()
  console.log(`\n  Settings from ${envFile}`)
  console.log(`    AI_PROVIDER  ${env.AI_PROVIDER}`)
  console.log(`    AI_MODEL     ${env.AI_MODEL?.trim() || '(provider default)'}`)
  console.log(`    AI_BASE_URL  ${env.AI_BASE_URL || '(provider default)'}`)
  console.log(
    `    AI_API_KEY   ${env.AI_API_KEY ? `set (${env.AI_API_KEY.length} characters)` : 'not set'}`,
  )

  const provider = getAiProvider()
  if (!provider) {
    fail(
      'AI_PROVIDER is "deterministic", so only the rule-based engine runs and sentences are never rewritten. Set AI_PROVIDER, AI_API_KEY, AI_MODEL and AI_BASE_URL (see .env.example).',
    )
  }

  const resume = demoResumeProfile()
  const job = parseJobDescription(DEMO_JOB_DESCRIPTION_TEXT)
  const analysis = analyzeResume(resume, job)

  console.log(`\n  Calling ${provider.name} (${provider.model}) with the demo resume…`)
  const startedAt = Date.now()

  let proposal
  try {
    ;({ proposal } = await proposeLlmOptimization(provider, {
      resume,
      job,
      matches: analysis.report.requirementMatches,
      sections: ['summary', 'skills', 'experience', 'projects'],
    }))
  } catch (error) {
    if (AppError.isAppError(error)) {
      const status = error.context?.status
      const hint =
        status === 400 || status === 401 || status === 403
          ? 'The key was rejected. Check AI_API_KEY, and that AI_BASE_URL matches the provider the key belongs to.'
          : status === 404
            ? 'Not found. Check AI_BASE_URL is the full chat-completions URL and AI_MODEL is a model that provider offers.'
            : status === 429
              ? 'Rate limited. Free tiers allow a few requests a minute; wait and try again.'
              : error.code === 'AI_INVALID_OUTPUT'
                ? 'The model answered, but not in the required format. Try a different AI_MODEL.'
                : 'No response. Check your connection, or raise AI_TIMEOUT_MS.'
      fail(`${error.code}${status ? ` (HTTP ${status})` : ''}. ${hint}`)
    }
    throw error
  }

  const outcome = validateAndApplyProposal({
    original: resume,
    proposal,
    matches: analysis.report.requirementMatches,
  })
  const rewrites = outcome.changeSet.changes.filter((change) => change.action === 'modified')

  console.log(`  Answered in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.\n`)
  for (const change of rewrites) {
    console.log(`  ${change.targetPath}`)
    console.log(`    before  ${change.before}`)
    console.log(`    after   ${change.after}\n`)
  }
  if (outcome.rejected.length > 0) {
    console.log(
      `  ${outcome.rejected.length} proposed change(s) were discarded by the anti-fabrication checks.\n`,
    )
  }

  if (rewrites.length === 0) {
    fail('The AI responded but proposed no sentence rewrites that passed validation.')
  }
  console.log(`  PASS  The AI rewrote ${rewrites.length} section(s) of the demo resume.\n`)
}

// Exit code set rather than `process.exit()`, which can abort on Windows
// while the HTTP client's sockets are still closing.
main().catch((error: unknown) => {
  console.error(error instanceof CheckFailed ? `\n  FAIL  ${error.message}\n` : error)
  process.exitCode = 1
})
