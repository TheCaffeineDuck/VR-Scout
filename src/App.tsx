import { ViewerShell } from '@/components/viewer/ViewerShell'
import { SceneRenderer } from '@/components/viewer/SceneRenderer'

export default function App() {
  return (
    <ViewerShell>
      <SceneRenderer />
      {/* Placeholder cube visible when no scene is loaded */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4f46e5" />
      </mesh>
    </ViewerShell>
  )
}
