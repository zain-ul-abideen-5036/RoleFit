'use client'

import * as React from 'react'

import { CheckCircle2, FileText, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { UPLOAD } from '@/lib/constants'
import type { ResumeProfile } from '@/lib/domain/types'
import { apiUpload, toDisplayError } from '@/lib/client/api'
import { cn, formatBytes } from '@/lib/utils'

/**
 * Resume upload.
 *
 * A drop zone that is also a real, focusable button wrapping a file input —
 * drag-and-drop is an enhancement, never the only way in. Client-side checks
 * are for fast feedback only; the server re-validates by byte signature, since
 * anything checked here can be bypassed.
 */

export interface UploadedResume {
  id: string
  title: string
  originalFilename: string
  sourceFormat: 'pdf' | 'docx'
  profile: ResumeProfile
}

interface UploadResponse {
  resume: UploadedResume
  deduplicated: boolean
}

export function ResumeUploader({
  onUploaded,
  className,
}: {
  onUploaded: (resume: UploadedResume, deduplicated: boolean) => void
  className?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fileName, setFileName] = React.useState<string | null>(null)

  const upload = React.useCallback(
    async (file: File): Promise<void> => {
      setError(null)

      const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
      if (!(UPLOAD.acceptedExtensions as readonly string[]).includes(extension)) {
        setError('That file type is not supported. Please choose a PDF or DOCX file.')
        return
      }
      if (file.size > UPLOAD.maxBytes) {
        setError(
          `That file is ${formatBytes(file.size)}, which is over the ${UPLOAD.maxBytesLabel} limit.`,
        )
        return
      }
      if (file.size === 0) {
        setError('That file is empty.')
        return
      }

      setFileName(file.name)
      setUploading(true)

      const form = new FormData()
      form.append('file', file)

      try {
        const result = await apiUpload<UploadResponse>('/api/resumes', form)
        onUploaded(result.resume, result.deduplicated)
      } catch (caught) {
        setError(toDisplayError(caught).message)
        setFileName(null)
      } finally {
        setUploading(false)
      }
    },
    [onUploaded],
  )

  function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files.item(0)
    if (file) void upload(file)
  }

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-colors sm:p-12',
          dragging ? 'border-accent bg-accent-subtle' : 'border-line-strong bg-surface',
        )}
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-sunken text-fg-subtle">
          {uploading ? (
            <FileText className="size-5" aria-hidden="true" />
          ) : (
            <Upload className="size-5" aria-hidden="true" />
          )}
        </div>

        <p className="mt-4 text-base font-semibold text-fg">
          {uploading ? 'Reading your resume…' : 'Upload your resume'}
        </p>
        <p className="mt-1.5 text-sm text-fg-muted">
          {uploading && fileName
            ? fileName
            : `Drag a file here, or choose one. PDF or DOCX, up to ${UPLOAD.maxBytesLabel}.`}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD.acceptAttribute}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
            // Reset so re-selecting the same file fires `change` again.
            event.target.value = ''
          }}
        />

        <Button
          type="button"
          className="mt-5"
          loading={uploading}
          loadingLabel="Uploading…"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>

        <p className="mt-4 text-xs text-fg-subtle">
          Scanned or image-only PDFs cannot be read. If your resume has no selectable text, export
          it again from the original document.
        </p>
      </div>

      {error ? (
        <Alert tone="danger" live className="mt-4">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}

/** Confirmation shown once a resume has been parsed. */
export function ParsedResumeSummary({ resume }: { resume: UploadedResume }) {
  const skillCount = resume.profile.skills.reduce((sum, group) => sum + group.items.length, 0)

  const facts = [
    { label: 'Roles', value: resume.profile.experience.length },
    { label: 'Projects', value: resume.profile.projects.length },
    { label: 'Skills', value: skillCount },
    { label: 'Education', value: resume.profile.education.length },
  ]

  return (
    <div className="rounded-xl border border-success-line bg-success-bg p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-fg" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-success-fg">Resume read successfully</p>
          <p className="mt-1 truncate text-sm text-fg-muted">{resume.originalFilename}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-lg bg-surface px-3 py-2">
                <dt className="text-xs text-fg-subtle">{fact.label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-fg">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {resume.profile.experience.length === 0 ? (
            <p className="mt-3 text-sm text-warning-fg">
              No work experience was detected. If your resume uses unusual section headings, the
              analysis may be less accurate.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
