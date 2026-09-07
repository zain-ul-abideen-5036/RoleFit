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
import { describeIssues } from '@/lib/ai/providers/anthropic'
import { extractJsonObject, postJson } from '@/lib/ai/providers/http'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * OpenAI provider (and any OpenAI-compatible endpoint).
 *
 * Uses JSON mode with the target schema stated in the system prompt rather than
 * strict `json_schema` structured outputs, because strict mode requires every
 * property to be required — which our schemas, built around sensible defaults,
 * deliberately are not. The authoritative check is the Zod parse either way.
 */

const API_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export interface OpenAiProviderOptions {
  apiKey: string
  model?: string | undefined
  timeoutMs: number
  maxRepairAttempts: number
  /** Override for OpenAI-compatible gateways. */
  baseUrl?: string
}

export function createOpenAiProvider(options: OpenAiProviderOptions): AiProvider {
  const model = options.model?.trim() || DEFAULT_MODEL
  const url = options.baseUrl?.trim() || API_URL

  return {
    name: 'openai',
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

      const schemaText = JSON.stringify(toJsonSchema(request.schema), null, 2)

      const system = [
        request.system,
        '',
        fenceContract(
          nonce,
          sanitized.map((document) => document.id),
        ),
        '',
        'RESPONSE FORMAT',
        '',
        'Reply with a single JSON object conforming to this schema. No prose, no',
        'code fence, no commentary before or after the object.',
        '',
        schemaText,
      ].join('\n')

      const userContent = [request.instruction, '', fenceDocuments(sanitized, nonce)].join('\n')

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ]

      let repairAttempts = 0
      let inputTokens: number | null = null
      let outputTokens: number | null = null

      for (let attempt = 0; attempt <= options.maxRepairAttempts; attempt += 1) {
        const response = await postJson<OpenAiResponse>({
          url,
          provider: 'openai',
          timeoutMs: options.timeoutMs,
          headers: { authorization: `Bearer ${options.apiKey}` },
          body: {
            model,
            temperature: request.temperature ?? 0,
            max_tokens: request.maxOutputTokens ?? 8192,
            response_format: { type: 'json_object' },
            messages,
          },
        })

        inputTokens = response.usage?.prompt_tokens ?? null
        outputTokens = response.usage?.completion_tokens ?? null

        const content = response.choices?.[0]?.message?.content
        if (!content) {
          messages.push({
            role: 'user',
            content: 'Your response was empty. Return the JSON object described above.',
          })
          repairAttempts = attempt + 1
          continue
        }

        let candidate: unknown
        try {
          candidate = extractJsonObject(content)
        } catch {
          messages.push(
            { role: 'assistant', content: content.slice(0, 2000) },
            {
              role: 'user',
              content: 'That was not valid JSON. Return only the JSON object, with no other text.',
            },
          )
          repairAttempts = attempt + 1
          continue
        }

        const parsed = request.schema.safeParse(candidate)
        if (parsed.success) {
          return {
            data: parsed.data as z.infer<TSchema>,
            usage: { inputTokens, outputTokens },
            repairAttempts,
            provider: 'openai',
            model,
          }
        }

        logger.warn('ai.schema_validation_failed', {
          provider: 'openai',
          promptId: request.promptId,
          attempt: attempt + 1,
          issueCount: parsed.error.issues.length,
        })

        messages.push(
          { role: 'assistant', content: JSON.stringify(candidate).slice(0, 2000) },
          {
            role: 'user',
            content: [
              'That object did not validate. Fix these problems and return the',
              'corrected JSON object. Change nothing else, and do not add any',
              'information that is not in the documents above.',
              '',
              describeIssues(parsed.error),
            ].join('\n'),
          },
        )
        repairAttempts = attempt + 1
      }

      throw new AppError(ERROR_CODES.AI_INVALID_OUTPUT, {
        context: { provider: 'openai', promptId: request.promptId, repairAttempts },
      })
    },
  }
}
