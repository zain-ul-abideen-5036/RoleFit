'use client'

import * as React from 'react'

import { Monitor, Moon, Sun } from 'lucide-react'

import { THEME_STORAGE_KEY } from '@/components/theme/theme-script'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark' | 'system'

const OPTIONS: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)

  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

/**
 * Theme selector.
 *
 * A three-way segmented control rather than a two-state toggle, so "follow the
 * system" stays reachable — a binary switch silently traps anyone who has set
 * an OS-level preference.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<Theme>('system')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') setTheme(stored)
    } catch {
      // Storage unavailable; keep the default.
    }
  }, [])

  // Keep following the OS while "system" is selected.
  React.useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [theme])

  const select = (next: Theme): void => {
    setTheme(next)
    applyTheme(next)
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Preference simply will not persist.
    }
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-line bg-sunken p-0.5',
        className,
      )}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        // Before mount the stored value is unknown; showing a selected state
        // would be wrong half the time and would mismatch the server render.
        const selected = mounted && theme === value

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => select(value)}
            className={cn(
              'focus-ring inline-flex size-6.5 cursor-pointer items-center justify-center rounded-md',
              'transition-colors duration-[--duration-fast] ease-[--ease-standard]',
              selected ? 'bg-surface text-fg shadow-xs' : 'text-fg-subtle hover:text-fg',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
