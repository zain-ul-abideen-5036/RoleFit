import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { getEnv } from '@/lib/config/env'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Object storage.
 *
 * Two drivers behind one interface. Storage keys are always generated
 * server-side from a UUID — a user-supplied filename never reaches a path, so
 * traversal (`../../etc/passwd`) and collision between users are both
 * structurally impossible rather than filtered for.
 *
 * Objects are private. The `local` driver serves them only through an
 * authenticated route; the `s3` driver issues short-lived presigned URLs and
 * the bucket is expected to block public access.
 */

export type StorageNamespace = 'uploads' | 'generated'

export interface StoredObject {
  key: string
  sizeBytes: number
  /** SHA-256 of the stored bytes, for integrity verification on read. */
  checksum: string
}

export interface StorageDriver {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>
  get(key: string): Promise<Uint8Array>
  delete(key: string): Promise<void>
  /** A URL the browser can fetch directly, when the driver supports one. */
  signedUrl(key: string, filename: string, contentType: string): Promise<string | null>
}

/**
 * Builds an opaque storage key.
 *
 * Shape: `<namespace>/<userId>/<uuid>.<ext>`. Including the user id makes
 * per-user lifecycle rules and bulk deletion straightforward; the UUID makes
 * the key unguessable and collision-free. Nothing user-controlled appears.
 */
export function buildStorageKey(
  namespace: StorageNamespace,
  userId: string,
  extension: string,
): string {
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'bin'
  return `${namespace}/${userId}/${randomUUID()}.${safeExtension}`
}

export function checksumOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Rejects any key not produced by `buildStorageKey`. */
function assertKeyIsSafe(key: string): void {
  if (!/^(uploads|generated)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(key)) {
    throw new AppError(ERROR_CODES.STORAGE_FAILURE, { context: { reason: 'malformed_key' } })
  }
}

/* ==========================================================================
   Local driver — development only
   ========================================================================== */

function localRoot(): string {
  return resolve(process.cwd(), '.storage')
}

function localPath(key: string): string {
  const root = localRoot()
  const candidate = resolve(join(root, key))

  // Defense in depth: even with a validated key, confirm the resolved path is
  // inside the storage root before touching the filesystem.
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    throw new AppError(ERROR_CODES.STORAGE_FAILURE, { context: { reason: 'path_escape' } })
  }
  return candidate
}

const localDriver: StorageDriver = {
  async put(key, bytes) {
    assertKeyIsSafe(key)
    const path = localPath(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes)
    return { key, sizeBytes: bytes.length, checksum: checksumOf(bytes) }
  },

  async get(key) {
    assertKeyIsSafe(key)
    try {
      const buffer = await readFile(localPath(key))
      return new Uint8Array(buffer)
    } catch (cause) {
      throw new AppError(ERROR_CODES.STORAGE_FAILURE, { cause, context: { operation: 'get' } })
    }
  },

  async delete(key) {
    assertKeyIsSafe(key)
    await rm(localPath(key), { force: true })
  },

  async signedUrl() {
    // No direct URL: local objects are streamed through an authenticated route.
    return null
  },
}

/* ==========================================================================
   S3 driver
   ========================================================================== */

let s3Client: S3Client | null = null

function getS3(): S3Client {
  if (s3Client) return s3Client
  const env = getEnv()

  s3Client = new S3Client({
    region: env.STORAGE_REGION,
    ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY!,
      secretAccessKey: env.STORAGE_SECRET_KEY!,
    },
  })
  return s3Client
}

const s3Driver: StorageDriver = {
  async put(key, bytes, contentType) {
    assertKeyIsSafe(key)
    const env = getEnv()
    const checksum = checksumOf(bytes)

    try {
      await getS3().send(
        new PutObjectCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          // Resumes are personal data; encrypt at rest even when the bucket
          // default would already do so.
          ServerSideEncryption: 'AES256',
          Metadata: { checksum },
        }),
      )
    } catch (cause) {
      logger.error('storage.put_failed', { operation: 'put' })
      throw new AppError(ERROR_CODES.STORAGE_FAILURE, { cause })
    }

    return { key, sizeBytes: bytes.length, checksum }
  },

  async get(key) {
    assertKeyIsSafe(key)
    try {
      const response = await getS3().send(
        new GetObjectCommand({ Bucket: getEnv().STORAGE_BUCKET, Key: key }),
      )
      const bytes = await response.Body?.transformToByteArray()
      if (!bytes) throw new Error('empty body')
      return bytes
    } catch (cause) {
      logger.error('storage.get_failed', { operation: 'get' })
      throw new AppError(ERROR_CODES.STORAGE_FAILURE, { cause })
    }
  },

  async delete(key) {
    assertKeyIsSafe(key)
    try {
      await getS3().send(new DeleteObjectCommand({ Bucket: getEnv().STORAGE_BUCKET, Key: key }))
    } catch (cause) {
      logger.error('storage.delete_failed', { operation: 'delete' })
      throw new AppError(ERROR_CODES.STORAGE_FAILURE, { cause })
    }
  },

  async signedUrl(key, filename, contentType) {
    assertKeyIsSafe(key)
    const env = getEnv()

    return getSignedUrl(
      getS3(),
      new GetObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: key,
        // Force a download with the user-facing filename rather than the key.
        ResponseContentDisposition: `attachment; filename="${filename.replace(/["\\]/g, '')}"`,
        ResponseContentType: contentType,
      }),
      { expiresIn: env.STORAGE_SIGNED_URL_TTL },
    )
  },
}

export function getStorage(): StorageDriver {
  return getEnv().STORAGE_DRIVER === 's3' ? s3Driver : localDriver
}

/** Test-only: drops the memoised S3 client after configuration changes. */
export function resetStorageCache(): void {
  s3Client = null
}
