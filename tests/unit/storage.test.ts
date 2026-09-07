import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvCache } from '@/lib/config/env'
import { AppError } from '@/lib/errors'
import { buildStorageKey, checksumOf, getStorage, resetStorageCache } from '@/lib/storage'

/**
 * Object storage.
 *
 * Three levels, deliberately separated, because they buy different things:
 *
 *  - **Local** — the real filesystem driver against a real temporary
 *    directory. No mocks at all.
 *  - **Signing** — the real S3 driver and the real AWS SDK signer with
 *    placeholder credentials. `getSignedUrl` performs no I/O, so this asserts
 *    the exact URL a provider would receive without any network or account.
 *    This is what establishes Backblaze B2 compatibility.
 *  - **Commands** — the real SDK command objects, with only the network send
 *    stubbed. Asserting on `command.input` verifies the request the driver
 *    actually builds, rather than verifying that a mock was called.
 *
 * No test here reaches a real provider. Nothing in this file has been run
 * against a live Backblaze account.
 */

/** Deliberately obvious non-credentials. */
const PLACEHOLDER_KEY_ID = 'PLACEHOLDER_KEY_ID'
const PLACEHOLDER_APP_KEY = 'PLACEHOLDER_APPLICATION_KEY'

/** Backblaze B2's documented S3-compatible endpoint shape. */
const B2_ENDPOINT = 'https://s3.us-west-004.backblazeb2.com'
const B2_REGION = 'us-west-004'
const BUCKET = 'rolefit-documents'

const USER_ID = '4f1e3a7c-9b2d-4e88-8f10-6c5b2a9d7e34'

const ORIGINAL_ENV = { ...process.env }

function setEnv(values: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  resetEnvCache()
  resetStorageCache()
}

function useBackblaze(overrides: Record<string, string | undefined> = {}): void {
  setEnv({
    STORAGE_DRIVER: 's3',
    STORAGE_ENDPOINT: B2_ENDPOINT,
    STORAGE_REGION: B2_REGION,
    STORAGE_ACCESS_KEY: PLACEHOLDER_KEY_ID,
    STORAGE_SECRET_KEY: PLACEHOLDER_APP_KEY,
    STORAGE_BUCKET: BUCKET,
    STORAGE_FORCE_PATH_STYLE: 'true',
    ...overrides,
  })
}

afterEach(() => {
  // Restored in place: reassigning `process.env` detaches every existing
  // reference to it, Node's own included.
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
  resetEnvCache()
  resetStorageCache()
  vi.restoreAllMocks()
})

describe('storage keys', () => {
  it('places the namespace and owner in the key, and nothing user-supplied', () => {
    const key = buildStorageKey('uploads', USER_ID, 'pdf')
    expect(key).toMatch(new RegExp(`^uploads/${USER_ID}/[0-9a-f-]{36}\\.pdf$`))
  })

  it('separates generated documents from uploads', () => {
    expect(buildStorageKey('generated', USER_ID, 'docx')).toMatch(
      new RegExp(`^generated/${USER_ID}/[0-9a-f-]{36}\\.docx$`),
    )
  })

  it('never collides, even for the same user, format and instant', () => {
    const keys = new Set(
      Array.from({ length: 500 }, () => buildStorageKey('uploads', USER_ID, 'pdf')),
    )
    expect(keys.size).toBe(500)
  })

  it('replaces an extension it does not recognise rather than trusting it', () => {
    // The extension is the only caller-influenced part of a key, so it is the
    // only place a traversal attempt could enter.
    for (const hostile of [
      '../../etc/passwd',
      'pdf/../..',
      'p df',
      'PDF',
      '',
      'toolongextension',
    ]) {
      expect(buildStorageKey('uploads', USER_ID, hostile)).toMatch(
        new RegExp(`^uploads/${USER_ID}/[0-9a-f-]{36}\\.bin$`),
      )
    }
  })

  it('checksums content, not identity — same bytes, same digest', () => {
    const bytes = new TextEncoder().encode('resume bytes')
    expect(checksumOf(bytes)).toBe(checksumOf(new TextEncoder().encode('resume bytes')))
    expect(checksumOf(bytes)).not.toBe(checksumOf(new TextEncoder().encode('resume byte')))
  })
})

describe('local driver — real filesystem, no mocks', () => {
  let cwd: string
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rolefit-storage-'))
    cwd = process.cwd()
    process.chdir(dir)
    setEnv({ STORAGE_DRIVER: 'local' })
  })

  afterEach(async () => {
    process.chdir(cwd)
    await rm(dir, { recursive: true, force: true })
  })

  it('round-trips an upload byte for byte', async () => {
    const storage = getStorage()
    const key = buildStorageKey('uploads', USER_ID, 'pdf')
    const bytes = new TextEncoder().encode('%PDF-1.7 resume')

    const stored = await storage.put(key, bytes, 'application/pdf')
    expect(stored).toEqual({ key, sizeBytes: bytes.length, checksum: checksumOf(bytes) })

    expect(await storage.get(key)).toEqual(bytes)
  })

  it('stores a generated document and reads it back', async () => {
    const storage = getStorage()
    const key = buildStorageKey('generated', USER_ID, 'docx')
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02])

    await storage.put(
      key,
      bytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(await storage.get(key)).toEqual(bytes)
  })

  it('writes inside the storage root and nowhere else', async () => {
    const key = buildStorageKey('uploads', USER_ID, 'pdf')
    await getStorage().put(key, new TextEncoder().encode('x'), 'application/pdf')

    // The bytes must be exactly where the key says, under .storage.
    const onDisk = await readFile(join(dir, '.storage', key))
    expect(new TextDecoder().decode(onDisk)).toBe('x')
  })

  it('deletes, and deleting twice is not an error', async () => {
    const storage = getStorage()
    const key = buildStorageKey('uploads', USER_ID, 'pdf')

    await storage.put(key, new TextEncoder().encode('x'), 'application/pdf')
    await storage.delete(key)
    await expect(storage.delete(key)).resolves.toBeUndefined()
    await expect(storage.get(key)).rejects.toBeInstanceOf(AppError)
  })

  it('offers no direct URL, so objects can only be read through an authenticated route', async () => {
    expect(await getStorage().signedUrl('uploads/x/y.pdf', 'resume.pdf', 'application/pdf')).toBe(
      null,
    )
  })

  it.each([
    ['traversal', '../../../etc/passwd'],
    ['traversal inside a valid namespace', `uploads/${USER_ID}/../../../etc/passwd`],
    ['unknown namespace', `secrets/${USER_ID}/${USER_ID}.pdf`],
    ['non-uuid owner', 'uploads/someone/11111111-1111-4111-8111-111111111111.pdf'],
    ['absolute path', '/etc/passwd'],
    ['windows absolute path', 'C:\\Windows\\System32\\config\\SAM'],
    ['no extension', `uploads/${USER_ID}/${USER_ID}`],
  ])('refuses a key it did not generate: %s', async (_label, key) => {
    const storage = getStorage()
    const bytes = new TextEncoder().encode('x')

    await expect(storage.put(key, bytes, 'application/pdf')).rejects.toBeInstanceOf(AppError)
    await expect(storage.get(key)).rejects.toBeInstanceOf(AppError)
    await expect(storage.delete(key)).rejects.toBeInstanceOf(AppError)
  })
})

describe('S3 configuration is validated at startup, not on the first upload', () => {
  async function parse(): Promise<Error | null> {
    const { getEnv } = await import('@/lib/config/env')
    try {
      getEnv()
      return null
    } catch (caught) {
      return caught as Error
    }
  }

  it('accepts a complete Backblaze B2 configuration', async () => {
    useBackblaze()
    expect(await parse()).toBe(null)
  })

  it('refuses to start when the region is left to the default', async () => {
    // `auto` is right for R2 and wrong for B2 and AWS, so no default is safe.
    // Unset, this used to surface as an opaque 403 on the first upload.
    useBackblaze({ STORAGE_REGION: undefined })
    expect((await parse())?.message).toContain('STORAGE_REGION')
  })

  it('refuses a region that disagrees with the endpoint it would be signed for', async () => {
    useBackblaze({ STORAGE_REGION: 'us-east-005' })
    const message = (await parse())?.message
    expect(message).toContain('us-east-005')
    expect(message).toContain('us-west-004')
  })

  it.each([
    ['STORAGE_ACCESS_KEY', { STORAGE_ACCESS_KEY: undefined }],
    ['STORAGE_SECRET_KEY', { STORAGE_SECRET_KEY: undefined }],
    ['STORAGE_BUCKET', { STORAGE_BUCKET: undefined }],
  ])('refuses to start without %s', async (name, overrides) => {
    useBackblaze(overrides)
    expect((await parse())?.message).toContain(name)
  })

  it('leaves providers whose endpoint carries no region alone', async () => {
    // Cloudflare R2 and MinIO do not name a region in the host, so there is
    // nothing to cross-check and `auto` must still be accepted.
    useBackblaze({
      STORAGE_ENDPOINT: 'https://accountid.r2.cloudflarestorage.com',
      STORAGE_REGION: 'auto',
    })
    expect(await parse()).toBe(null)
  })

  it('does not mistake the region-less AWS endpoint for a region', async () => {
    useBackblaze({ STORAGE_ENDPOINT: 'https://s3.amazonaws.com', STORAGE_REGION: 'us-east-1' })
    expect(await parse()).toBe(null)
  })

  it('cross-checks an AWS regional endpoint too, since the rule is not B2-specific', async () => {
    useBackblaze({
      STORAGE_ENDPOINT: 'https://s3.eu-central-1.amazonaws.com',
      STORAGE_REGION: 'us-east-1',
    })
    expect((await parse())?.message).toContain('eu-central-1')
  })

  it('asks for no region at all when the local driver is in use', async () => {
    setEnv({ STORAGE_DRIVER: 'local', STORAGE_REGION: undefined })
    expect(await parse()).toBe(null)
  })
})

describe('Backblaze B2 — presigned URL shape, real signer, no network', () => {
  it('addresses the bucket by path, which is the endpoint form B2 documents', async () => {
    useBackblaze()
    const key = buildStorageKey('generated', USER_ID, 'pdf')

    const signed = await getStorage().signedUrl(key, 'Zain-Resume.pdf', 'application/pdf')
    const url = new URL(signed!)

    expect(url.host).toBe('s3.us-west-004.backblazeb2.com')
    expect(url.pathname).toBe(`/${BUCKET}/${key}`)
  })

  it('signs with the configured region, which is what B2 verifies', async () => {
    useBackblaze()
    const key = buildStorageKey('generated', USER_ID, 'pdf')

    const url = new URL((await getStorage().signedUrl(key, 'r.pdf', 'application/pdf'))!)
    expect(url.searchParams.get('X-Amz-Credential')).toContain(`/${B2_REGION}/s3/aws4_request`)
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
  })

  it('switches to virtual-hosted addressing when path style is disabled', async () => {
    // Both forms work against B2. This pins the behaviour of the flag so the
    // documented value is a decision rather than an accident.
    useBackblaze({ STORAGE_FORCE_PATH_STYLE: 'false' })
    const key = buildStorageKey('generated', USER_ID, 'pdf')

    const url = new URL((await getStorage().signedUrl(key, 'r.pdf', 'application/pdf'))!)
    expect(url.host).toBe(`${BUCKET}.s3.us-west-004.backblazeb2.com`)
    expect(url.pathname).toBe(`/${key}`)
  })

  it('expires the URL, so a leaked link is not a permanent one', async () => {
    useBackblaze({ STORAGE_SIGNED_URL_TTL: '300' })
    const key = buildStorageKey('generated', USER_ID, 'pdf')

    const url = new URL((await getStorage().signedUrl(key, 'r.pdf', 'application/pdf'))!)
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('downloads under the user-facing filename, not the opaque key', async () => {
    useBackblaze()
    const key = buildStorageKey('generated', USER_ID, 'pdf')

    const url = new URL((await getStorage().signedUrl(key, 'Zain Resume.pdf', 'application/pdf'))!)
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="Zain Resume.pdf"',
    )
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf')
  })

  it('strips quotes from a filename so the disposition header cannot be broken out of', async () => {
    useBackblaze()
    const key = buildStorageKey('generated', USER_ID, 'pdf')

    const url = new URL((await getStorage().signedUrl(key, 'evil".pdf', 'application/pdf'))!)
    const disposition = url.searchParams.get('response-content-disposition')!
    expect(disposition).toBe('attachment; filename="evil.pdf"')
    expect(disposition.match(/"/g)).toHaveLength(2)
  })

  it('never puts a credential in the URL beyond the signed key id', async () => {
    useBackblaze()
    const key = buildStorageKey('generated', USER_ID, 'pdf')

    const signed = (await getStorage().signedUrl(key, 'r.pdf', 'application/pdf'))!
    expect(signed).not.toContain(PLACEHOLDER_APP_KEY)
  })

  it('refuses to sign a key it did not generate', async () => {
    useBackblaze()
    await expect(
      getStorage().signedUrl('../../etc/passwd', 'x.pdf', 'application/pdf'),
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('Backblaze B2 — the requests the driver builds', () => {
  /**
   * The SDK's `send` is heavily overloaded, so a spy on it cannot be described
   * by a single signature. Stubbing the prototype with a plain mock keeps the
   * assertions precisely typed and confines the necessary cast to this seam.
   */
  let send: Mock<(command: unknown) => Promise<unknown>>

  beforeEach(() => {
    useBackblaze()
    // Only the network call is stubbed. The command objects, their input
    // validation and the driver's error handling are all real.
    send = vi.fn()
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(
      send as unknown as typeof S3Client.prototype.send,
    )
  })

  function sentCommand(): PutObjectCommand | GetObjectCommand | DeleteObjectCommand {
    expect(send).toHaveBeenCalledTimes(1)
    return send.mock.calls[0]![0] as PutObjectCommand
  }

  it('uploads to the configured bucket under the exact key, encrypted at rest', async () => {
    send.mockResolvedValue({} as never)
    const key = buildStorageKey('uploads', USER_ID, 'pdf')
    const bytes = new TextEncoder().encode('%PDF-1.7 resume')

    const stored = await getStorage().put(key, bytes, 'application/pdf')

    const command = sentCommand()
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect(command.input).toMatchObject({
      Bucket: BUCKET,
      Key: key,
      ContentType: 'application/pdf',
      // B2 supports SSE-B2 under this header; resumes are personal data.
      ServerSideEncryption: 'AES256',
      Metadata: { checksum: checksumOf(bytes) },
    })
    expect(stored).toEqual({ key, sizeBytes: bytes.length, checksum: checksumOf(bytes) })
  })

  it('stores a generated document under the generated namespace', async () => {
    send.mockResolvedValue({} as never)
    const key = buildStorageKey('generated', USER_ID, 'docx')

    await getStorage().put(
      key,
      new Uint8Array([0x50, 0x4b]),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )

    expect((sentCommand() as PutObjectCommand).input.Key).toBe(key)
    expect(key.startsWith('generated/')).toBe(true)
  })

  it('sets no public ACL, so the object stays private to the bucket', async () => {
    send.mockResolvedValue({} as never)
    const key = buildStorageKey('uploads', USER_ID, 'pdf')

    await getStorage().put(key, new TextEncoder().encode('x'), 'application/pdf')

    // A public-read ACL here would defeat the private bucket entirely.
    expect((sentCommand() as PutObjectCommand).input.ACL).toBeUndefined()
  })

  it('retrieves the bytes the provider returns', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 resume')
    send.mockResolvedValue({
      Body: { transformToByteArray: async () => bytes },
    } as never)

    const key = buildStorageKey('uploads', USER_ID, 'pdf')
    expect(await getStorage().get(key)).toEqual(bytes)
    expect(sentCommand()).toBeInstanceOf(GetObjectCommand)
    expect((sentCommand() as GetObjectCommand).input).toMatchObject({ Bucket: BUCKET, Key: key })
  })

  it('deletes by key from the configured bucket', async () => {
    send.mockResolvedValue({} as never)
    const key = buildStorageKey('uploads', USER_ID, 'pdf')

    await getStorage().delete(key)

    expect(sentCommand()).toBeInstanceOf(DeleteObjectCommand)
    expect((sentCommand() as DeleteObjectCommand).input).toMatchObject({ Bucket: BUCKET, Key: key })
  })

  it.each(['put', 'get', 'delete'] as const)(
    'reports a provider failure as STORAGE_FAILURE without leaking the provider error (%s)',
    async (operation) => {
      send.mockRejectedValue(
        new Error(`AccessDenied: key ${PLACEHOLDER_KEY_ID} is not authorized on ${BUCKET}`),
      )
      const key = buildStorageKey('uploads', USER_ID, 'pdf')
      const storage = getStorage()

      const error = await (
        operation === 'put'
          ? storage.put(key, new TextEncoder().encode('x'), 'application/pdf')
          : operation === 'get'
            ? storage.get(key)
            : storage.delete(key)
      ).catch((caught: unknown) => caught)

      expect(AppError.isAppError(error)).toBe(true)
      expect((error as AppError).code).toBe('STORAGE_FAILURE')
      // The upstream message names a key id and a bucket. Neither may reach a user.
      expect((error as AppError).message).not.toContain(PLACEHOLDER_KEY_ID)
      expect((error as AppError).message).not.toContain(BUCKET)
    },
  )

  it('treats an empty response body as a failure rather than an empty document', async () => {
    send.mockResolvedValue({ Body: undefined } as never)
    await expect(
      getStorage().get(buildStorageKey('uploads', USER_ID, 'pdf')),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('never sends a request for a key it did not generate', async () => {
    const storage = getStorage()
    await expect(storage.get(`uploads/${USER_ID}/../../secret.pdf`)).rejects.toBeInstanceOf(
      AppError,
    )
    expect(send).not.toHaveBeenCalled()
  })
})
