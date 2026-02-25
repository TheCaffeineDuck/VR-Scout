import { useRef } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { Annotation } from '@/types/annotation'
import { ANNOTATION_TYPES } from '@/types/annotation'
import { useAnnotationStore } from '@/hooks/useAnnotations'

const MARKER_SIZE = 0.15

export function AnnotationMarker({ annotation }: { annotation: Annotation }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const setSelectedId = useAnnotationStore((s) => s.setSelectedId)
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation)
  const config = ANNOTATION_TYPES[annotation.type]
  const isSelected = selectedId === annotation.id

  // Billboard: face camera every frame
  useFrame(({ camera }) => {
    if (meshRef.current) {
      meshRef.current.lookAt(camera.position)
    }
  })

  return (
    <group position={annotation.position}>
      {/* Marker sphere */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          setSelectedId(isSelected ? null : annotation.id)
        }}
      >
        <circleGeometry args={[MARKER_SIZE, 16]} />
        <meshBasicMaterial
          color={config.color}
          side={THREE.DoubleSide}
          transparent
          opacity={isSelected ? 1 : 0.85}
        />
      </mesh>

      {/* Icon label above marker */}
      <Html
        position={[0, 0, 0]}
        center
        distanceFactor={6}
        zIndexRange={[40, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="text-sm select-none"
          style={{ fontSize: '14px', lineHeight: 1 }}
        >
          {config.icon}
        </div>
      </Html>

      {/* Expanded detail panel when selected */}
      {isSelected && (
        <Html
          position={[0, MARKER_SIZE + 0.1, 0]}
          center
          distanceFactor={6}
          zIndexRange={[60, 0]}
        >
          <div className="bg-gray-900/95 text-white text-xs rounded-lg shadow-xl p-3 min-w-48 max-w-64 pointer-events-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="font-semibold text-sm"
                style={{ color: config.color }}
              >
                {config.icon} {config.label}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeAnnotation(annotation.id)
                }}
                className="text-red-400 hover:text-red-300 font-bold ml-2"
              >
                x
              </button>
            </div>
            {annotation.title.en && (
              <div className="font-medium mb-0.5">{annotation.title.en}</div>
            )}
            {annotation.description.en && (
              <div className="text-gray-300 text-[11px]">{annotation.description.en}</div>
            )}
            <div className="text-gray-500 text-[10px] mt-1.5 flex gap-2">
              <span>{annotation.visibility}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
