'use client'

import * as React from 'react'

import { Download, FileText, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { Panel, Toolbar } from '@/components/ui/layout'
import { apiPost, toDisplayError } from '@/lib/client/api'

/**
 * Export controls.
 *
 * The document is generated server-side and verified before the download is
 * offered, so the button reports "Preparing…" rather than downloading
 * immediately — the wait is a real check, not a spinner for its own sake.
 *
 * A bordered bar rather than a bare row of buttons. On the preview page the
 * next thing below is a page-sized white sheet, and three unbounded buttons
 * floating above it read as belonging to the document rather than to the app.
 */

interface DocumentResponse {
  document: { id: string; filename: string; downloadUrl: string }
  warnings: string[]
}

export function ExportBar({ resumeId, runId }: { resumeId: string; runId: string | null }) {
  const [busy, setBusy] = React.useState<'pdf' | 'docx' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [warnings, setWarnings] = React.useState<string[]>([])

  async function download(format: 'pdf' | 'docx'): Promise<void> {
    setBusy(format)
    setError(null)
    setWarnings([])

    try {
      const result = await apiPost<DocumentResponse>('/api/documents', {
        format,
        ...(runId ? { runId } : { resumeId }),
      })
      setWarnings(result.warnings)
      window.location.href = result.document.downloadUrl
    } catch (caught) {
      setError(toDisplayError(caught).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <Toolbar
          actions={
            <>
              <Button variant="ghost" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden="true" />
                Print
              </Button>
              <Button
                variant="secondary"
                onClick={() => void download('docx')}
                loading={busy === 'docx'}
                loadingLabel="Preparing DOCX…"
                disabled={busy !== null}
              >
                <FileText className="size-4" aria-hidden="true" />
                Download DOCX
              </Button>
              <Button
                onClick={() => void download('pdf')}
                loading={busy === 'pdf'}
                loadingLabel="Preparing PDF…"
                disabled={busy !== null}
              >
                <Download className="size-4" aria-hidden="true" />
                Download PDF
              </Button>
            </>
          }
        >
          <p className="measure text-2xs leading-relaxed text-fg-subtle">
            Both formats are single-column with selectable text, and are verified after generation
            by reading the text back out of the file.
          </p>
        </Toolbar>
      </Panel>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert tone="warning" title="Generated with warnings">
          <ul className="ml-4 list-disc">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  )
}
