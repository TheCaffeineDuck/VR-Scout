import { useRef } from 'react'
import * as THREE from 'three'
import { useScene } from '@/hooks/useScene'

export function SceneRenderer() {
  const groupRef = useRef<THREE.Group>(null)
  useScene(groupRef)
  return <group ref={groupRef} />
}
