import { Canvas } from '@react-three/fiber'
import { type ReactNode, Suspense } from 'react'
import { XR } from '@react-three/xr'
import { createRenderer } from '@/lib/renderer'
import { useViewerStore } from '@/stores/viewer-store'
import { FirstPersonControls } from '@/components/controls/FirstPersonControls'
import { VRControls } from '@/components/controls/VRControls'
import { EnvironmentLighting } from '@/components/viewer/EnvironmentSettings'
import { xrStore } from '@/hooks/useXRSession'
import { PerformanceStats } from '@/components/viewer/PerformanceMonitor'

interface ViewerShellProps {
  children?: ReactNode
}

export function ViewerShell({ children }: ViewerShellProps) {
  const showGrid = useViewerStore((s) => s.showGrid)

  return (
    <div className="w-full h-full">
      <Canvas
        gl={(props) => createRenderer(props)}
        camera={{ position: [0, 1.6, 5], fov: 75, near: 0.1, far: 1000 }}
      >
        <XR store={xrStore}>
          <Suspense fallback={null}>
            <EnvironmentLighting />
            {showGrid && <gridHelper args={[50, 50, '#444', '#222']} />}
            <FirstPersonControls />
            <VRControls />
            <PerformanceStats />
            {children}
          </Suspense>
        </XR>
      </Canvas>
    </div>
  )
}
