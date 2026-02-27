import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { SparkRenderer } from '@sparkjsdev/spark'
import type * as THREE from 'three'

const SparkCtx = createContext<SparkRenderer | null>(null)

/** Access the SparkRenderer instance (e.g. for secondary viewpoints). */
export function useSpark(): SparkRenderer | null {
  return useContext(SparkCtx)
}

/**
 * Wraps the R3F scene with a SparkRenderer.
 *
 * SparkRenderer is a THREE.Mesh that hooks into onBeforeRender to sort
 * and composite Gaussian splats. It must be added to the scene graph
 * so Three.js calls its render callback.
 *
 * VR-optimized: maxStdDev = sqrt(5) reduces overdraw on Quest 3.
 */
export function SparkProvider({ children }: { children: ReactNode }) {
  const gl = useThree((s) => s.gl) as THREE.WebGLRenderer
  const scene = useThree((s) => s.scene)
  const sparkRef = useRef<SparkRenderer | null>(null)

  useEffect(() => {
    const spark = new SparkRenderer({
      renderer: gl,
      maxStdDev: Math.sqrt(5),
      preUpdate: false, // post-update for WebXR compatibility
    })
    scene.add(spark)
    sparkRef.current = spark

    return () => {
      scene.remove(spark)
      ;(spark as any).dispose()
      sparkRef.current = null
    }
  }, [gl, scene])

  return (
    <SparkCtx.Provider value={sparkRef.current}>
      {children}
    </SparkCtx.Provider>
  )
}
