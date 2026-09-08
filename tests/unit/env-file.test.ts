import { describe, expect, it } from 'vitest'

import { parseEnvFile, replaceEnvValue } from '@/scripts/lib/env-file'

/**
 * `replaceEnvValue` edits a file holding live production credentials, so the
 * property that matters most is not what it changes but what it leaves alone.
 * It exists so that rotating a leaked `AUTH_SECRET` does not also discard the
 * database password sitting three lines below it.
 */

const FILE = [
  '# RoleFit — production configuration',
  '',
  'DATABASE_URL=postgresql://user:pw@host/db?sslmode=require',
  'AUTH_SECRET=old-secret-value',
  '',
  '# AUTH_SECRET is mentioned in this comment',
  'STORAGE_BUCKET=bucket-name',
].join('\n')

describe('replaceEnvValue', () => {
  it('replaces the value', () => {
    const result = replaceEnvValue(FILE, 'AUTH_SECRET', 'new-secret')

    expect(result?.replaced).toBe(1)
    expect(parseEnvFile(result?.contents ?? '')['AUTH_SECRET']).toBe('new-secret')
  })

  it('leaves every other value exactly as it was', () => {
    // The whole reason this function exists rather than a rewrite from template.
    const result = replaceEnvValue(FILE, 'AUTH_SECRET', 'new-secret')
    const before = parseEnvFile(FILE)
    const after = parseEnvFile(result?.contents ?? '')

    for (const key of Object.keys(before)) {
      if (key === 'AUTH_SECRET') continue
      expect(after[key]).toBe(before[key])
    }
  })

  it('preserves comments, blank lines and ordering', () => {
    const result = replaceEnvValue(FILE, 'AUTH_SECRET', 'new-secret')
    const lines = (result?.contents ?? '').split('\n')

    expect(lines[0]).toBe('# RoleFit — production configuration')
    expect(lines[1]).toBe('')
    expect(lines[3]).toBe('AUTH_SECRET=new-secret')
    expect(lines).toHaveLength(FILE.split('\n').length)
  })

  it('does not touch a key that only appears inside a comment', () => {
    const result = replaceEnvValue(FILE, 'AUTH_SECRET', 'new-secret')
    expect(result?.contents).toContain('# AUTH_SECRET is mentioned in this comment')
    expect(result?.replaced).toBe(1)
  })

  it('does not match a key that is a prefix of another', () => {
    const contents = 'AUTH_SECRET_BACKUP=keep-me\nAUTH_SECRET=replace-me'
    const result = replaceEnvValue(contents, 'AUTH_SECRET', 'new')

    expect(result?.replaced).toBe(1)
    expect(parseEnvFile(result?.contents ?? '')['AUTH_SECRET_BACKUP']).toBe('keep-me')
  })

  it('does not match the key inside another value', () => {
    // A password can contain anything, including something that looks like an
    // assignment.
    const contents = 'DATABASE_URL=postgresql://u:AUTH_SECRET=x@host/db\nAUTH_SECRET=old'
    const result = replaceEnvValue(contents, 'AUTH_SECRET', 'new')

    expect(result?.replaced).toBe(1)
    expect(parseEnvFile(result?.contents ?? '')['DATABASE_URL']).toBe(
      'postgresql://u:AUTH_SECRET=x@host/db',
    )
  })

  it('returns null when the key is absent rather than appending it', () => {
    // Appending would mean writing a secret into a file that is not the one
    // this was meant to be editing.
    expect(replaceEnvValue(FILE, 'MISSING_KEY', 'value')).toBeNull()
  })

  it('replaces every occurrence when a key is duplicated', () => {
    // A duplicated key is a broken file, but leaving the second one holding the
    // leaked secret would be worse than either fixing or refusing.
    const contents = 'AUTH_SECRET=one\nOTHER=x\nAUTH_SECRET=two'
    const result = replaceEnvValue(contents, 'AUTH_SECRET', 'new')

    expect(result?.replaced).toBe(2)
    expect(result?.contents).not.toContain('one')
    expect(result?.contents).not.toContain('two')
  })

  it('handles CRLF input without leaving stray carriage returns', () => {
    // The file is written on Windows.
    const result = replaceEnvValue('AUTH_SECRET=old\r\nOTHER=x\r\n', 'AUTH_SECRET', 'new')

    expect(result?.contents).toBe('AUTH_SECRET=new\nOTHER=x\n')
    expect(result?.contents).not.toContain('\r')
  })

  it('handles a value containing characters that are special in a regex', () => {
    const secret = 'a+b/c$d.e*f'
    const result = replaceEnvValue(FILE, 'AUTH_SECRET', secret)

    expect(parseEnvFile(result?.contents ?? '')['AUTH_SECRET']).toBe(secret)
  })

  it('tolerates whitespace around the key', () => {
    const result = replaceEnvValue('  AUTH_SECRET = old', 'AUTH_SECRET', 'new')
    expect(result?.replaced).toBe(1)
  })
})
