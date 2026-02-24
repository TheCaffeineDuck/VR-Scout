import { createXRStore } from '@react-three/xr'

export const xrStore = createXRStore({
  controller: true,
  hand: true,
  gaze: true,
})

export function enterVR() {
  xrStore.enterVR()
}

export function enterAR() {
  xrStore.enterAR()
}
