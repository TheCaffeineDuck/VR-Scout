import { useState, useCallback, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { takeScreenshot, downloadDataUrl } from '@/lib/screenshot'
import { useVirtualCameraStore } from '@/hooks/useVirtualCamera'
import { CINEMA_LENSES } from '@/types/camera'

/**
 * R3F component that handles screenshot capture inside Canvas context.
 * Listens for custom events dispatched by the HTML button.
 */
export function ScreenshotCapture() {
  const { gl, camera } = useThree()
  const sequenceRef = useRef(1)

  const handleCapture = useCallback(() => {
    const activeCamId = useVirtualCameraStore.getState().activeCameraId
    const cameras = useVirtualCameraStore.getState().cameras
    const activeCam = activeCamId ? cameras.find((c) => c.id === activeCamId) : null

    const lensMm = activeCam
      ? CINEMA_LENSES[activeCam.lensIndex].focalLength
      : 0

    const pos = camera.position.toArray() as [number, number, number]
    const rot = camera.rotation.toArray().slice(0, 3) as [number, number, number]

    const result = takeScreenshot(
      gl as THREE.WebGLRenderer,
      {
        locationId: '',
        locationName: '',
        lensFocalLength: lensMm,
        cameraPosition: activeCam ? activeCam.position : pos,
        cameraRotation: activeCam ? activeCam.rotation : rot,
        timestamp: new Date().toISOString(),
        capturedBy: 'local',
      },
      sequenceRef.current++,
    )

    downloadDataUrl(result.dataUrl, result.filename)
    window.dispatchEvent(new CustomEvent('screenshot-flash'))
  }, [gl, camera])

  useEffect(() => {
    window.addEventListener('take-screenshot', handleCapture)
    return () => window.removeEventListener('take-screenshot', handleCapture)
  }, [handleCapture])

  return null
}

/**
 * HTML button to trigger screenshot capture.
 * Shows a brief flash effect on capture.
 */
export function ScreenshotButton() {
  const [flashing, setFlashing] = useState(false)

  const handleClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent('take-screenshot'))
  }, [])

  useEffect(() => {
    const onFlash = () => {
      setFlashing(true)
      setTimeout(() => setFlashing(false), 150)
    }
    window.addEventListener('screenshot-flash', onFlash)
    return () => window.removeEventListener('screenshot-flash', onFlash)
  }, [])

  return (
    <>
      <button
        onClick={handleClick}
        className="text-xs px-3 py-1.5 rounded font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
      >
        Screenshot
      </button>
      {flashing && (
        <div className="fixed inset-0 z-[200] bg-white/60 pointer-events-none animate-[fadeOut_150ms_ease-out_forwards]" />
      )}
    </>
  )
}
