import { Canvas, useThree } from '@react-three/fiber'
import { type ReactNode, Suspense, useEffect } from 'react'
import { XR } from '@react-three/xr'
import * as THREE from 'three'
import { createRenderer, applyVRSettings, applyDesktopSettings } from '@/lib/renderer'
import { SparkProvider } from '@/components/spark/SparkProvider'
import { useViewerStore } from '@/stores/viewer-store'
import { FirstPersonControls } from '@/components/controls/FirstPersonControls'
import { VRControls } from '@/components/controls/VRControls'
import { EnvironmentLighting } from '@/components/viewer/EnvironmentSettings'
import { xrStore } from '@/hooks/useXRSession'
import { PerformanceStats } from '@/components/viewer/PerformanceMonitor'
import { MeasurementTool } from '@/components/tools/MeasurementTool'
import { AnnotationTool } from '@/components/tools/AnnotationTool'
import { CameraManager } from '@/components/camera-system/CameraManager'
import { ScreenshotCapture } from '@/components/tools/ScreenshotTool'
import { SunPathLight } from '@/components/tools/SunPathSimulator'
import { FloorPlanTracker } from '@/components/tools/FloorPlanOverlay'
import { LaserPointer } from '@/components/tools/LaserPointer'
import { ParticipantAvatars } from '@/components/collaboration/ParticipantAvatars'
import { PositionBroadcaster } from '@/components/collaboration/PositionBroadcaster'
import { SharedCursor } from '@/components/collaboration/SharedCursor'
import { TeleportController } from '@/components/controls/TeleportController'
import { VRMenu } from '@/components/controls/VRMenu'
import { HUD } from '@/components/ui/HUD'

/** Debug: logs all visible meshes in the scene to help identify rogue geometry */
function SceneDebugLogger() {
  const { scene } = useThree()
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[SceneDebug] Traversing scene for all objects:')
      let meshCount = 0
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          meshCount++
          const geo = obj.geometry
          const mat = obj.material as THREE.Material
          const pos = obj.getWorldPosition(new THREE.Vector3())
          const scale = obj.getWorldScale(new THREE.Vector3())
          // Walk up ancestors to build path
          const path: string[] = []
          let p: THREE.Object3D | null = obj
          while (p) {
            path.unshift(p.name || p.type)
            p = p.parent
          }
          console.log(
            `  Mesh #${meshCount}: vis=${obj.visible} | ` +
            `geo=${geo.type}(verts=${geo.getAttribute('position')?.count ?? '?'}) | ` +
            `mat=${mat.type} vis=${mat.visible} ` +
            `color=${'color' in mat ? (mat as THREE.MeshBasicMaterial).color?.getHexString() : '-'} | ` +
            `pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) ` +
            `scale=(${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}) | ` +
            `path: ${path.join(' > ')}`,
          )
        }
      })
      console.log(`[SceneDebug] Total meshes: ${meshCount}`)
    }, 4000) // Wait 4s for scene to fully load
    return () => clearTimeout(timer)
  }, [scene])
  return null
}

/** Applies VR/Desktop renderer settings when XR sessions start/end. */
function XRSettingsSync() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const renderer = gl as THREE.WebGLRenderer
    const onSessionStart = () => {
      applyVRSettings(renderer)
      console.log('[XRSettingsSync] Applied VR settings')
    }
    const onSessionEnd = () => {
      applyDesktopSettings(renderer)
      console.log('[XRSettingsSync] Restored desktop settings')
    }
    renderer.xr.addEventListener('sessionstart', onSessionStart)
    renderer.xr.addEventListener('sessionend', onSessionEnd)
    return () => {
      renderer.xr.removeEventListener('sessionstart', onSessionStart)
      renderer.xr.removeEventListener('sessionend', onSessionEnd)
    }
  }, [gl])
  return null
}

interface ViewerShellProps {
  children?: ReactNode
}

export function ViewerShell({ children }: ViewerShellProps) {
  const showGrid = useViewerStore((s) => s.showGrid)

  return (
    <div className="w-full h-full">
      <Canvas
        gl={(props) => createRenderer(props)}
        camera={{ position: [0, 1.7, 5], fov: 75, near: 0.05, far: 1000 }}
        dpr={[1, 2]}
        linear={false}
        flat
      >
        <XR store={xrStore}>
          <SparkProvider>
            <Suspense fallback={null}>
              <EnvironmentLighting />
              {showGrid && <gridHelper args={[50, 50, '#444', '#222']} />}
              <FirstPersonControls />
              <VRControls />
              <PerformanceStats />
              <MeasurementTool />
              <AnnotationTool />
              <CameraManager />
              <ScreenshotCapture />
              <SunPathLight />
              <FloorPlanTracker />
              <LaserPointer />
              <ParticipantAvatars />
              <PositionBroadcaster />
              <SharedCursor />
              <TeleportController />
              <VRMenu />
              <HUD />
              <SceneDebugLogger />
              <XRSettingsSync />
              {children}
            </Suspense>
          </SparkProvider>
        </XR>
      </Canvas>
    </div>
  )
}
