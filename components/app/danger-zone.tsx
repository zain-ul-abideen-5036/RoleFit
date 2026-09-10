'use client'

import * as React from 'react'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { Panel } from '@/components/ui/layout'
import { apiDelete, toDisplayError } from '@/lib/client/api'

/**
 * Account deletion.
 *
 * Irreversible, so it is gated twice: an alert dialog that has to be answered,
 * and inside it the confirmation phrase typed out. The friction is the point.
 *
 * An `AlertDialog` specifically, not a `Dialog`. An alert dialog cannot be
 * dismissed by clicking the backdrop and puts initial focus on the safe
 * action, which is what stops an account being deleted by a stray click at the
 * wrong moment. Previously the destructive button sat inline on the settings
 * page with only the typed phrase between the user and permanent data loss —
 * one field, on a page they were already scrolling.
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
    <Panel tone="danger" className="flex flex-col gap-4">
      <div>
        <p className="text-meta font-semibold text-danger-fg">
          Deleting your account cannot be undone
        </p>
        <p className="mt-1.5 measure text-meta leading-relaxed text-fg-muted">
          This permanently removes the account <strong className="text-fg">{email}</strong>, every
          resume you have uploaded, all analyses and optimization runs, your change history, and
          every document you have generated — including the files behind them. Export anything you
          want to keep first.
        </p>
      </div>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <div>
        <AlertDialog
          onOpenChange={(open) => {
            // The phrase resets on close, so an abandoned attempt does not
            // leave the dialog pre-armed the next time it is opened.
            if (!open) {
              setConfirmation('')
              setError(null)
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="danger">
              <Trash2 className="size-4" aria-hidden="true" />
              Delete my account
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent
            tone="danger"
            title="Permanently delete your account?"
            description={`Everything on ${email} is destroyed immediately. This cannot be undone.`}
          >
            <div className="mt-4">
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
                <FieldDescription>There is no recovery and no grace period.</FieldDescription>
              </Field>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="secondary" disabled={busy}>
                  Keep my account
                </Button>
              </AlertDialogCancel>
              {/*
                `onSelect` prevented so the dialog stays open while the request
                is in flight. Closing it on click would leave the user on the
                settings page with no indication that anything was happening,
                and no way to see the error if it failed.
              */}
              <AlertDialogAction asChild>
                <Button
                  variant="danger"
                  disabled={!canDelete}
                  loading={busy}
                  loadingLabel="Deleting…"
                  onClick={(event) => {
                    event.preventDefault()
                    void deleteAccount()
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Permanently delete
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Panel>
  )
}
