/**
 * Cloudflare R2 upload module.
 *
 * In production, uploads use signed URLs obtained from a server endpoint
 * (Firebase Function or API route). The server generates a pre-signed PUT
 * URL for the R2 bucket, and the client uploads directly.
 *
 * When R2 is not configured (no VITE_R2_PUBLIC_URL), files are stored
 * as data URLs in localStorage via the local persistence layer.
 */

import { localSet, localGet, localId } from '@/lib/local-persistence'
import { auth } from '@/lib/firebase'

const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL

/** API endpoint that returns signed upload URLs */
const UPLOAD_API_BASE = '/api/vr/upload'

function isR2Available(): boolean {
  return Boolean(R2_PUBLIC_URL && !R2_PUBLIC_URL.includes('your-'))
}

export interface UploadResult {
  url: string
  key: string
  size: number
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

/** Sanitize a filename: strip path separators, allow only safe characters */
function sanitizeFilename(filename: string): string {
  // Strip path separators
  const stripped = filename.replace(/[/\\]/g, '')
  // Allow only alphanumeric, dashes, dots, underscores
  const sanitized = stripped.replace(/[^a-zA-Z0-9._-]/g, '')
  if (!sanitized) {
    throw new Error('Invalid filename: empty after sanitization')
  }
  return sanitized
}

/**
 * Request a signed upload URL from the server.
 * In production, this calls a Firebase Function / API route.
 * Requires Firebase authentication — includes the user's ID token.
 */
async function getSignedUploadUrl(
  type: 'mesh' | 'panorama' | 'screenshot',
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const user = auth?.currentUser
  if (!user) {
    throw new Error('Authentication required to upload files')
  }

  const idToken = await user.getIdToken()
  const safeFilename = sanitizeFilename(filename)

  const endpoint =
    type === 'screenshot'
      ? `${UPLOAD_API_BASE}/screenshot`
      : `${UPLOAD_API_BASE}/${type}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ filename: safeFilename, contentType }),
  })

  if (!res.ok) {
    throw new Error(`Failed to get upload URL: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * Upload a file to R2 via signed URL with progress tracking.
 */
async function uploadToR2(
  signedUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signedUrl)
    xhr.setRequestHeader('Content-Type', contentType)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        })
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Upload failed (network error)')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

    xhr.send(file)
  })
}

/**
 * Upload a .glb mesh file to R2 or local storage.
 */
export async function uploadMesh(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  if (isR2Available()) {
    const { uploadUrl, publicUrl, key } = await getSignedUploadUrl(
      'mesh',
      file.name,
      'model/gltf-binary'
    )
    await uploadToR2(uploadUrl, file, 'model/gltf-binary', onProgress)
    return { url: publicUrl, key, size: file.size }
  }

  // Local fallback: store as object URL reference
  const id = localId()
  const key = `meshes/${id}/${file.name}`
  const objectUrl = URL.createObjectURL(file)

  // Store metadata (the actual blob is held by the object URL)
  localSet('r2_uploads', key, {
    name: file.name,
    size: file.size,
    type: file.type,
    objectUrl,
    uploadedAt: new Date().toISOString(),
  })

  onProgress?.({ loaded: file.size, total: file.size, percent: 100 })
  return { url: objectUrl, key, size: file.size }
}

/**
 * Upload a screenshot image to R2 or local storage.
 */
export async function uploadScreenshot(
  dataUrl: string,
  filename: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  // Convert data URL to blob
  const res = await fetch(dataUrl)
  const blob = await res.blob()

  if (isR2Available()) {
    const { uploadUrl, publicUrl, key } = await getSignedUploadUrl(
      'screenshot',
      filename,
      'image/jpeg'
    )
    await uploadToR2(uploadUrl, blob, 'image/jpeg', onProgress)
    return { url: publicUrl, key, size: blob.size }
  }

  // Local fallback: keep the data URL directly
  const id = localId()
  const key = `screenshots/${id}/${filename}`

  localSet('r2_uploads', key, {
    name: filename,
    size: blob.size,
    type: 'image/jpeg',
    dataUrl,
    uploadedAt: new Date().toISOString(),
  })

  onProgress?.({ loaded: blob.size, total: blob.size, percent: 100 })
  return { url: dataUrl, key, size: blob.size }
}

/**
 * Upload a panorama image to R2 or local storage.
 */
export async function uploadPanorama(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  if (isR2Available()) {
    const { uploadUrl, publicUrl, key } = await getSignedUploadUrl(
      'panorama',
      file.name,
      file.type || 'image/jpeg'
    )
    await uploadToR2(uploadUrl, file, file.type || 'image/jpeg', onProgress)
    return { url: publicUrl, key, size: file.size }
  }

  const id = localId()
  const key = `panoramas/${id}/${file.name}`
  const objectUrl = URL.createObjectURL(file)

  localSet('r2_uploads', key, {
    name: file.name,
    size: file.size,
    type: file.type,
    objectUrl,
    uploadedAt: new Date().toISOString(),
  })

  onProgress?.({ loaded: file.size, total: file.size, percent: 100 })
  return { url: objectUrl, key, size: file.size }
}

/**
 * Get the public URL for a stored file.
 */
export function getPublicUrl(key: string): string {
  if (isR2Available()) {
    return `${R2_PUBLIC_URL}/${key}`
  }
  const meta = localGet<{ objectUrl?: string; dataUrl?: string }>(
    'r2_uploads',
    key
  )
  return meta?.objectUrl || meta?.dataUrl || ''
}
