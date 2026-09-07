import { NextResponse } from 'next/server'

import { requireUuidParam, route } from '@/server/api/handler'
import { loadDocumentForDownload } from '@/server/services/document-service'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Strips characters that would break out of the quoted `filename` parameter of
 * a Content-Disposition header. Filenames are already generated server-side by
 * `safeDownloadFilename`, so this is defense in depth rather than the primary
 * control.
 */
function sanitizeHeaderFilename(filename: string): string {
  return filename.replace(/["'\\;\r\n]/g, '').slice(0, 200) || 'resume'
}

/**
 * Streams a generated document to its owner.
 *
 * Ownership is checked before storage is touched, so a document id belonging to
 * another user 404s without revealing that the object exists. The response is
 * marked private and no-store: a shared cache must never retain a resume.
 */
export const GET = route<{ id: string }>(
  async ({ params, user }) => {
    const documentId = requireUuidParam(params.id, 'id')
    const { bytes, filename, mimeType } = await loadDocumentForDownload(user.userId, documentId)

    logger.info('document.downloaded', { userId: user.userId, documentId })

    // Copy into a fresh ArrayBuffer so the response body is not a view over a
    // pooled Node buffer.
    const body = new Uint8Array(bytes)

    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': mimeType,
        'content-length': String(body.byteLength),
        'content-disposition': `attachment; filename="${sanitizeHeaderFilename(filename)}"`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    })
  },
  { rateLimit: 'api:read' },
)
