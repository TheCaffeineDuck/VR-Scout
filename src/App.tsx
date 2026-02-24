import { ViewerShell } from '@/components/viewer/ViewerShell'
import { SceneRenderer } from '@/components/viewer/SceneRenderer'
import { EnvironmentPanel } from '@/components/viewer/EnvironmentSettings'
import { LoadingOverlay } from '@/components/viewer/LoadingOverlay'
import { ErrorBoundary } from '@/components/viewer/ErrorBoundary'
import { enterVR } from '@/hooks/useXRSession'

export default function App() {
  return (
    <ErrorBoundary>
      <ViewerShell>
        <SceneRenderer />
        {/* Placeholder cube visible when no scene is loaded */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#4f46e5" />
        </mesh>
      </ViewerShell>
      <LoadingOverlay />
      <EnvironmentPanel />
      <button
        onClick={enterVR}
        className="fixed bottom-4 right-4 z-50 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-lg"
      >
        Enter VR
      </button>
    </ErrorBoundary>
  )
}
