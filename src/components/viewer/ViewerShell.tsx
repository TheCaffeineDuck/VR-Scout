import { Canvas } from '@react-three/fiber'
import { type ReactNode, Suspense } from 'react'
import { createRenderer } from '@/lib/renderer'
import { useViewerStore } from '@/stores/viewer-store'
import { FirstPersonControls } from '@/components/controls/FirstPersonControls'

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
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          {showGrid && <gridHelper args={[50, 50, '#444', '#222']} />}
          <FirstPersonControls />
          {children}
        </Suspense>
      </Canvas>
    </div>
  )
}
