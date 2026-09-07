import 'server-only'

import type { z } from 'zod'

import { toJsonSchema } from '@/lib/ai/schemas'
import {
  createFenceNonce,
  fenceContract,
  fenceDocuments,
  sanitizeDocument,
} from '@/lib/ai/sanitize'
import type { AiProvider, StructuredRequest, StructuredResponse } from '@/lib/ai/types'
import { postJson } from '@/lib/ai/providers/http'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Anthropic provider.
 *
 * Structured output is obtained through tool use with a forced tool choice,
 * which is far more reliable than asking for JSON in prose. Untrusted documents
 * are fenced with a per-request nonce and the fence contract is stated in the
 * system prompt, where instruction-following is strongest.
 */

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-5'

interface AnthropicContentBlock {
  type: string
  text?: string
  name?: string
  input?: unknown
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[]
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

export interface AnthropicProviderOptions {
  apiKey: string
  model?: string | undefined
  timeoutMs: number
  maxRepairAttempts: number
}

export function createAnthropicProvider(options: AnthropicProviderOptions): AiProvider {
  const model = options.model?.trim() || DEFAULT_MODEL

  return {
    name: 'anthropic',
    model,

    async generateStructured<TSchema extends z.ZodTypeAny>(
      request: StructuredRequest<TSchema>,
    ): Promise<StructuredResponse<z.infer<TSchema>>> {
      const nonce = createFenceNonce()
      const sanitized = request.documents.map((document) => sanitizeDocument(document))

      for (const document of sanitized) {
        if (document.detectedSignatures.length > 0) {
          logger.warn('ai.injection_signatures_detected', {
            documentId: document.id,
            signatures: document.detectedSignatures,
            neutralized: document.neutralizedCount,
          })
        }
      }

      const system = [
        request.system,
        '',
        fenceContract(
          nonce,
          sanitized.map((document) => document.id),
        ),
      ].join('\n')

      const userContent = [request.instruction, '', fenceDocuments(sanitized, nonce)].join('\n')

      const tool = {
        name: request.schemaName,
        description: `Return the ${request.schemaName} result. This is the only valid way to respond.`,
        input_schema: toJsonSchema(request.schema),
      }

      let repairAttempts = 0
      let lastIssue = ''
      let inputTokens: number | null = null
      let outputTokens: number | null = null

      for (let attempt = 0; attempt <= options.maxRepairAttempts; attempt += 1) {
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          { role: 'user', content: userContent },
        ]

        if (attempt > 0) {
          messages.push(
            {
              role: 'assistant',
              content: 'I returned a result that did not match the required schema.',
            },
            {
              role: 'user',
              content: [
                'Your previous response did not validate. Correct these problems and',
                'return the tool call again. Change nothing else, and do not add any',
                'information that is not in the documents above.',
                '',
                lastIssue,
              ].join('\n'),
            },
          )
        }

        const response = await postJson<AnthropicResponse>({
          url: API_URL,
          provider: 'anthropic',
          timeoutMs: options.timeoutMs,
          headers: {
            'x-api-key': options.apiKey,
            'anthropic-version': API_VERSION,
          },
          body: {
            model,
            max_tokens: request.maxOutputTokens ?? 8192,
            temperature: request.temperature ?? 0,
            system,
            messages,
            tools: [tool],
            tool_choice: { type: 'tool', name: request.schemaName },
          },
        })

        inputTokens = response.usage?.input_tokens ?? null
        outputTokens = response.usage?.output_tokens ?? null

        const toolUse = response.content?.find(
          (block) => block.type === 'tool_use' && block.name === request.schemaName,
        )

        if (!toolUse || toolUse.input === undefined) {
          lastIssue = 'No tool call was present in the response.'
          repairAttempts = attempt + 1
          continue
        }

        const parsed = request.schema.safeParse(toolUse.input)
        if (parsed.success) {
          return {
            data: parsed.data as z.infer<TSchema>,
            usage: { inputTokens, outputTokens },
            repairAttempts,
            provider: 'anthropic',
            model,
          }
        }

        lastIssue = describeIssues(parsed.error)
        repairAttempts = attempt + 1
        logger.warn('ai.schema_validation_failed', {
          provider: 'anthropic',
          promptId: request.promptId,
          attempt: attempt + 1,
          issueCount: parsed.error.issues.length,
        })
      }

      // Failing closed is correct: a partially-valid optimization is worse than
      // none, because the user cannot tell which parts were trustworthy.
      throw new AppError(ERROR_CODES.AI_INVALID_OUTPUT, {
        context: { provider: 'anthropic', promptId: request.promptId, repairAttempts },
      })
    },
  }
}

/** Renders Zod issues as instructions the model can act on. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 20)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}
