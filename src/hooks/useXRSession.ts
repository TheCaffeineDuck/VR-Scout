import { createXRStore } from '@react-three/xr'

export const xrStore = createXRStore({
  // Disable default controller/hand/gaze visuals to prevent
  // white placeholder planes appearing in desktop mode.
  // XR input is still handled by useXRControllerLocomotion in VRControls.
  controller: false,
  hand: false,
  gaze: false,
})

export function enterVR() {
  xrStore.enterVR()
}

export function enterAR() {
  xrStore.enterAR()
}
