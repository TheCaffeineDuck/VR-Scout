import { useRef } from 'react'
import { useXRControllerLocomotion, XROrigin } from '@react-three/xr'
import type { Group } from 'three'

const MOVE_SPEED = 4
const ROTATION_SPEED = 2

export function VRControls({ children }: { children?: React.ReactNode }) {
  const originRef = useRef<Group>(null)

  useXRControllerLocomotion(
    originRef,
    { speed: MOVE_SPEED },
    { type: 'smooth', speed: ROTATION_SPEED },
  )

  return (
    <XROrigin ref={originRef}>
      {children}
    </XROrigin>
  )
}
