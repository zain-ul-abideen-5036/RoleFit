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

  /**
   * Uploading is driven entirely by a change handler, which does not exist
   * until React hydrates. Presenting an enabled control before that point lets
   * a fast user pick a file that is then silently dropped, with the UI still
   * inviting them to choose one. The control is disabled until it truly works.
   */
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    setReady(true)
  }, [])

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
          // A dashed border, kept — this is the one place in the product where
          // a dashed rectangle is the correct costume, because it genuinely is
          // a drop target. Everywhere else it was removed.
          'rounded-xl border border-dashed p-6 text-center sm:p-10',
          'transition-[border-color,background-color] duration-(--duration-fast) ease-(--ease-standard)',
          dragging
            ? 'border-line-accent bg-selected'
            : 'border-line-strong bg-surface hover:border-line-bold',
        )}
      >
        <div
          className={cn(
            'mx-auto flex size-10 items-center justify-center rounded-lg border',
            uploading
              ? 'border-line-accent bg-accent-subtle text-fg-accent'
              : 'border-line bg-sunken text-fg-subtle',
          )}
        >
          {uploading ? (
            <FileText className="size-4.5" aria-hidden="true" />
          ) : (
            <Upload className="size-4.5" aria-hidden="true" />
          )}
        </div>

        <p className="mt-3.5 text-body-lg font-semibold text-fg">
          {uploading ? 'Reading your resume…' : 'Upload your resume'}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-meta leading-relaxed text-fg-muted">
          {uploading && fileName
            ? fileName
            : `Drag a file here, or choose one. PDF or DOCX, up to ${UPLOAD.maxBytesLabel}.`}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD.acceptAttribute}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={!ready}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
            // Reset so re-selecting the same file fires `change` again.
            event.target.value = ''
          }}
        />

        <Button
          type="button"
          className="mt-4"
          loading={uploading}
          loadingLabel="Uploading…"
          disabled={!ready || uploading}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>

        <p className="mx-auto mt-4 max-w-md text-2xs leading-relaxed text-fg-subtle">
          Scanned or image-only PDFs cannot be read. If your resume has no selectable text, export
          it again from the original document.
        </p>
      </div>

      {error ? (
        <Alert tone="danger" live className="mt-3">
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
    <div className="rounded-xl border border-success-line bg-success-bg p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-success-solid" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-body-lg font-semibold text-success-fg">Resume read successfully</p>
          <p className="mt-0.5 truncate font-mono text-2xs text-fg-muted">
            {resume.originalFilename}
          </p>

          {/*
            What was found, as one divided readout rather than four tinted
            tiles. These are four counts of one parse — they belong on one
            surface, and boxing each of them inside an already-tinted panel is
            the nested-container problem again.
          */}
          <dl className="mt-3.5 grid grid-cols-2 divide-x divide-y divide-success-line overflow-hidden rounded-lg border border-success-line bg-surface sm:grid-cols-4 sm:divide-y-0">
            {facts.map((fact) => (
              <div key={fact.label} className="px-3 py-2">
                <dt className="eyebrow text-fg-subtle">{fact.label}</dt>
                <dd className="mt-0.5 text-body-lg font-semibold tabular-nums text-fg">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          {resume.profile.experience.length === 0 ? (
            <p className="mt-3 measure text-meta leading-relaxed text-warning-fg">
              No work experience was detected. If your resume uses unusual section headings, the
              analysis may be less accurate.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
