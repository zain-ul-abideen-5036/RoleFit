import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The project's font-size steps, declared to tailwind-merge.
 *
 * tailwind-merge resolves conflicts by class group, and it knows only the
 * stock scale. Faced with `text-title` it cannot tell a custom font-size from a
 * custom text colour, guesses colour, and then treats it as conflicting with a
 * real colour — silently dropping whichever came first.
 *
 * That is not hypothetical. Migrating the arbitrary sizes to named tokens
 * turned `text-on-cta text-body-lg` on the marketing call-to-action into
 * `text-body-lg` alone: white on plum became near-black on plum, 2.16:1, and
 * the button stayed exactly the right size and shape while becoming unreadable.
 * The reverse happened wherever a colour came second — `text-title ... text-fg`
 * kept the colour and lost the size.
 *
 * `text-[0.9375rem]` never had this problem: an arbitrary value carrying `rem`
 * is unambiguously a length. The ambiguity arrives with the name, so the names
 * have to be registered.
 */
const FONT_SIZES = [
  '3xs',
  '2xs',
  'meta',
  'body-lg',
  'title',
  'display-sm',
  'display-md',
  'display-lg',
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
    },
  },
})

/** Merges class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Formats a byte count for display. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Formats a date for display.
 * Uses a fixed locale so server and client render identically — `toLocaleString`
 * with the runtime default is a common source of hydration mismatches.
 */
export function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** "3 days ago", for recency in lists. Falls back to a date beyond a month. */
export function formatRelative(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)}d ago`
  return formatDate(date)
}

/** Truncates text on a word boundary where possible. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const clipped = text.slice(0, maxLength - 1)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped}…`
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}
