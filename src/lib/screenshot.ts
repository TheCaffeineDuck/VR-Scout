import * as THREE from 'three'

export interface ScreenshotMetadata {
  locationId: string
  locationName: string
  lensFocalLength: number
  cameraPosition: [number, number, number]
  cameraRotation: [number, number, number]
  timestamp: string
  gps?: { lat: number; lng: number }
  capturedBy: string
}

/**
 * Capture the current canvas as a data URL.
 * Must be called before the next animation frame clears the buffer.
 */
export function captureCanvas(renderer: THREE.WebGLRenderer): string {
  const canvas = renderer.domElement
  return canvas.toDataURL('image/jpeg', 0.92)
}

/**
 * Generate a filename following the project convention:
 * LOC-{location_id}_{lens}mm_{YYYY-MM-DD}_{sequence}.jpg
 */
export function generateFilename(
  locationId: string,
  lensMm: number,
  sequence: number,
): string {
  const date = new Date().toISOString().split('T')[0]
  const locId = locationId || 'unknown'
  const seq = String(sequence).padStart(3, '0')
  return `LOC-${locId}_${lensMm}mm_${date}_${seq}.jpg`
}

/**
 * Download a data URL as a file.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Capture and download a screenshot with metadata embedded in the filename.
 * EXIF embedding would require a library like piexifjs — for now we encode
 * metadata in JSON alongside the download.
 */
export function takeScreenshot(
  renderer: THREE.WebGLRenderer,
  metadata: ScreenshotMetadata,
  sequence: number,
): { dataUrl: string; filename: string; metadata: ScreenshotMetadata } {
  const dataUrl = captureCanvas(renderer)
  const filename = generateFilename(
    metadata.locationId,
    metadata.lensFocalLength,
    sequence,
  )
  return { dataUrl, filename, metadata }
}
