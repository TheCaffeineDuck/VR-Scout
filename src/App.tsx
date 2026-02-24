import { Canvas } from '@react-three/fiber'

export default function App() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 1.6, 5], fov: 75 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#4f46e5" />
        </mesh>
        <gridHelper args={[20, 20, '#444', '#222']} />
      </Canvas>
    </div>
  )
}
