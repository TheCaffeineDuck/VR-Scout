const SUPPORTED_EXTENSIONS = ['.glb', '.gltf'] as const

export type SupportedFormat = (typeof SUPPORTED_EXTENSIONS)[number]

export function getFileExtension(url: string): string {
  const pathname = new URL(url, 'https://localhost').pathname
  const dot = pathname.lastIndexOf('.')
  return dot >= 0 ? pathname.slice(dot).toLowerCase() : ''
}

export function isSupportedFormat(url: string): boolean {
  const ext = getFileExtension(url)
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)
}

export function validateSceneUrl(url: string): { valid: boolean; error?: string } {
  if (!url) return { valid: false, error: 'URL is empty' }
  if (!isSupportedFormat(url)) {
    const ext = getFileExtension(url)
    return { valid: false, error: `Unsupported format "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}` }
  }
  return { valid: true }
}
