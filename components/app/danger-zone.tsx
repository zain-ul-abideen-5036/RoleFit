'use client'

import * as React from 'react'

import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { apiDelete, toDisplayError } from '@/lib/client/api'

/**
 * Account deletion.
 *
 * Irreversible, so it is gated behind typing the confirmation phrase rather
 * than a single click or a checkbox — the friction is the point. The copy
 * states exactly what is destroyed before the control is reachable.
 */

const CONFIRM_PHRASE = 'DELETE'

export function DangerZone({ email }: { email: string }) {
  const router = useRouter()
  const [confirmation, setConfirmation] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const canDelete = confirmation.trim().toUpperCase() === CONFIRM_PHRASE

  async function deleteAccount(): Promise<void> {
    if (!canDelete || busy) return
    setBusy(true)
    setError(null)

    try {
      await apiDelete('/api/account')
      router.refresh()
      router.push('/')
    } catch (caught) {
      setError(toDisplayError(caught).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="danger" title="Deleting your account cannot be undone">
        <p>
          This permanently removes the account <strong>{email}</strong>, every resume you have
          uploaded, all analyses and optimization runs, your change history, and every document you
          have generated — including the files behind them.
        </p>
      </Alert>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <Field id="delete-confirm">
        <FieldLabel>
          Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
        </FieldLabel>
        <Input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={CONFIRM_PHRASE}
        />
        <FieldDescription>
          There is no recovery and no grace period. Export anything you want to keep first.
        </FieldDescription>
      </Field>

      <div>
        <Button
          variant="danger"
          disabled={!canDelete}
          loading={busy}
          loadingLabel="Deleting…"
          onClick={() => void deleteAccount()}
        >
          <AlertTriangle className="size-4" aria-hidden="true" />
          Permanently delete my account
        </Button>
      </div>
    </div>
  )
}
