import * as THREE from 'three/webgpu'

/**
 * First-person fly controls with WASD + mouse look.
 * Requires pointer lock for mouse rotation.
 */
export class FlyControls {
  private camera: THREE.PerspectiveCamera
  private domElement: HTMLElement
  private moveSpeed = 3.0 // m/s
  private sprintMultiplier = 2.0
  private lookSpeed = 0.002 // rad/pixel

  private keys = new Set<string>()
  private euler = new THREE.Euler(0, 0, 0, 'YXZ')
  private isLocked = false
  private lastTime = 0

  enabled = true

  private onKeyDown: (e: KeyboardEvent) => void
  private onKeyUp: (e: KeyboardEvent) => void
  private onMouseMove: (e: MouseEvent) => void
  private onPointerLockChange: () => void
  private onClick: () => void

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera
    this.domElement = domElement

    this.onKeyDown = (e: KeyboardEvent) => {
      if (!this.enabled) return
      this.keys.add(e.code)
    }
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code)
    }
    this.onMouseMove = (e: MouseEvent) => {
      if (!this.enabled || !this.isLocked) return
      this.euler.setFromQuaternion(this.camera.quaternion)
      this.euler.y -= e.movementX * this.lookSpeed
      this.euler.x -= e.movementY * this.lookSpeed
      // Clamp pitch to avoid flipping
      this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x))
      this.camera.quaternion.setFromEuler(this.euler)
    }
    this.onPointerLockChange = () => {
      this.isLocked = document.pointerLockElement === this.domElement
    }
    this.onClick = () => {
      if (!this.enabled) return
      this.domElement.requestPointerLock()
    }

    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.domElement.addEventListener('click', this.onClick)
  }

  update(): void {
    if (!this.enabled) return

    const now = performance.now()
    const dt = this.lastTime === 0 ? 0.016 : Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    const speed = this.moveSpeed * (sprint ? this.sprintMultiplier : 1.0) * dt

    const forward = new THREE.Vector3()
    this.camera.getWorldDirection(forward)
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize()

    if (this.keys.has('KeyW')) this.camera.position.addScaledVector(forward, speed)
    if (this.keys.has('KeyS')) this.camera.position.addScaledVector(forward, -speed)
    if (this.keys.has('KeyA')) this.camera.position.addScaledVector(right, -speed)
    if (this.keys.has('KeyD')) this.camera.position.addScaledVector(right, speed)
    if (this.keys.has('Space') || this.keys.has('KeyE')) this.camera.position.y += speed
    if (this.keys.has('KeyQ')) this.camera.position.y -= speed
  }

  unlock(): void {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock()
    }
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.domElement.removeEventListener('click', this.onClick)
    this.unlock()
  }
}
