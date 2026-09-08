import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ResumeUploader } from '@/components/app/resume-uploader'
import { UPLOAD } from '@/lib/constants'

/**
 * Resume upload.
 *
 * The client-side checks here are conveniences, not a security boundary — the
 * server validates every byte signature and can be called directly. What these
 * tests protect is the *honesty* of the control: it must not invite someone to
 * choose a file it is not yet able to accept, and it must say plainly when it
 * refuses one.
 */

const { apiUpload } = vi.hoisted(() => ({ apiUpload: vi.fn() }))

vi.mock('@/lib/client/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/client/api')>()
  return { ...actual, apiUpload }
})

function pdf(name = 'resume.pdf'): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' })
}

const RESUME = {
  id: 'resume-1',
  title: 'resume.pdf',
  originalFilename: 'resume.pdf',
  sourceFormat: 'pdf' as const,
  profile: { summary: null } as never,
}

beforeEach(() => {
  apiUpload.mockResolvedValue({ resume: RESUME, deduplicated: false })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('the control does not lie about being ready', () => {
  it('enables the chooser once mounted', async () => {
    render(<ResumeUploader onUploaded={vi.fn()} />)

    // Enabled only after the effect runs, because the change handler that
    // does the work does not exist before hydration. An enabled control
    // beforehand lets a fast user pick a file that is silently dropped.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    })
  })

  it('keeps the hidden input out of the tab order', () => {
    // The visible button is the control. A focusable hidden input would give
    // keyboard users a second, invisible stop.
    const { container } = render(<ResumeUploader onUploaded={vi.fn()} />)

    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('tabindex', '-1')
    expect(input).toHaveAttribute('aria-hidden', 'true')
  })

  it('states the accepted formats and the size limit up front', () => {
    // Before a rejection, not after it.
    render(<ResumeUploader onUploaded={vi.fn()} />)

    expect(screen.getByText(new RegExp(UPLOAD.maxBytesLabel))).toBeInTheDocument()
    expect(screen.getByText(/PDF or DOCX/i)).toBeInTheDocument()
  })

  it('warns that a scanned PDF cannot be read', () => {
    // The single most common reason an upload produces nothing useful, said
    // before the attempt rather than as an error afterwards.
    render(<ResumeUploader onUploaded={vi.fn()} />)
    expect(screen.getByText(/no selectable text/i)).toBeInTheDocument()
  })
})

describe('uploading', () => {
  it('sends the chosen file and reports the result upward', async () => {
    const onUploaded = vi.fn()
    const { container } = render(<ResumeUploader onUploaded={onUploaded} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    })

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pdf())

    await waitFor(() => {
      expect(apiUpload).toHaveBeenCalledTimes(1)
      expect(onUploaded).toHaveBeenCalledWith(RESUME, false)
    })
  })

  it('passes the deduplicated flag through, so the UI can say it reused a file', async () => {
    apiUpload.mockResolvedValue({ resume: RESUME, deduplicated: true })
    const onUploaded = vi.fn()
    const { container } = render(<ResumeUploader onUploaded={onUploaded} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    })

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pdf())

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith(RESUME, true)
    })
  })

  it('shows the server message when an upload is refused', async () => {
    // The server's copy is the actionable one — it knows the file was an HTML
    // page renamed .pdf. Replacing it with a generic message loses that.
    apiUpload.mockRejectedValue(new Error('That file is not a readable PDF.'))

    const { container } = render(<ResumeUploader onUploaded={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    })

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pdf())

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('does not report success upward when the upload failed', async () => {
    apiUpload.mockRejectedValue(new Error('nope'))
    const onUploaded = vi.fn()

    const { container } = render(<ResumeUploader onUploaded={onUploaded} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    })

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pdf())

    await screen.findByRole('alert')
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('allows the same file to be chosen again after a failure', async () => {
    // The input's value is reset after each selection. Without that, picking
    // the same file twice fires no `change` event and the UI appears frozen.
    apiUpload.mockRejectedValueOnce(new Error('transient')).mockResolvedValue({
      resume: RESUME,
      deduplicated: false,
    })

    const onUploaded = vi.fn()
    const { container } = render(<ResumeUploader onUploaded={onUploaded} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    })

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pdf())
    await screen.findByRole('alert')

    await userEvent.upload(input, pdf())
    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith(RESUME, false)
    })
  })
})

describe('the drop target', () => {
  it('accepts a dropped file', async () => {
    const onUploaded = vi.fn()
    render(<ResumeUploader onUploaded={onUploaded} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    })

    const zone = screen.getByText(/Upload your resume/).closest('div')!
    const file = pdf()

    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: { item: () => file, length: 1 } },
    })
    zone.dispatchEvent(event)

    await waitFor(() => {
      expect(apiUpload).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores a drop carrying no file', async () => {
    render(<ResumeUploader onUploaded={vi.fn()} />)

    const zone = screen.getByText(/Upload your resume/).closest('div')!
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: { item: () => null, length: 0 } },
    })
    zone.dispatchEvent(event)

    expect(apiUpload).not.toHaveBeenCalled()
  })
})
