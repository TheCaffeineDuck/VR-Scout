import * as THREE from 'three/webgpu'
import type { ParsedSplatData } from './formats/parseSplat'

export class SplatData {
  positionTex: THREE.DataTexture
  scaleTex: THREE.DataTexture
  rotationTex: THREE.DataTexture
  colorTex: THREE.DataTexture
  // SH degree 1 textures — null if source data has no SH coefficients
  sh1RTex: THREE.DataTexture | null = null
  sh1GTex: THREE.DataTexture | null = null
  sh1BTex: THREE.DataTexture | null = null
  hasSH1: boolean = false
  width: number
  height: number
  count: number

  constructor(parsed: ParsedSplatData) {
    this.count = parsed.count
    this.width = Math.ceil(Math.sqrt(parsed.count))
    this.height = Math.ceil(parsed.count / this.width)

    const texelCount = this.width * this.height

    // Position: (pos.x, pos.y, pos.z, 0) — full float32 for position precision.
    // Opacity has moved to colorTex.a.
    const posData = new Float32Array(texelCount * 4)
    for (let i = 0; i < parsed.count; i++) {
      posData[i * 4]     = parsed.positions[i * 3]
      posData[i * 4 + 1] = parsed.positions[i * 3 + 1]
      posData[i * 4 + 2] = parsed.positions[i * 3 + 2]
      posData[i * 4 + 3] = 0
    }
    this.positionTex = this.makeTexture(posData)

    // Scale: (scale.x, scale.y, scale.z, 0)
    const scaleData = new Float32Array(texelCount * 4)
    for (let i = 0; i < parsed.count; i++) {
      scaleData[i * 4] = parsed.scales[i * 3]
      scaleData[i * 4 + 1] = parsed.scales[i * 3 + 1]
      scaleData[i * 4 + 2] = parsed.scales[i * 3 + 2]
    }
    this.scaleTex = this.makeTexture(scaleData)

    // Rotation: (w, x, y, z)
    const rotData = new Float32Array(texelCount * 4)
    for (let i = 0; i < parsed.count; i++) {
      rotData[i * 4] = parsed.rotations[i * 4]
      rotData[i * 4 + 1] = parsed.rotations[i * 4 + 1]
      rotData[i * 4 + 2] = parsed.rotations[i * 4 + 2]
      rotData[i * 4 + 3] = parsed.rotations[i * 4 + 3]
    }
    this.rotationTex = this.makeTexture(rotData)

    // Color + Opacity: (r, g, b, opacity) — float32 for reliable textureLoad() support.
    // Opacity lives in .a (moved from positionTex.a in Phase D2).
    // HalfFloatType was tried but Three.js does not auto-convert Float32Array → fp16
    // for DataTexture on WebGPU, resulting in corrupted color reads (green blobs).
    const colorData = new Float32Array(texelCount * 4)
    for (let i = 0; i < parsed.count; i++) {
      colorData[i * 4]     = parsed.colors[i * 3]
      colorData[i * 4 + 1] = parsed.colors[i * 3 + 1]
      colorData[i * 4 + 2] = parsed.colors[i * 3 + 2]
      colorData[i * 4 + 3] = parsed.opacities[i]  // opacity in .a
    }
    this.colorTex = this.makeTexture(colorData)

    // SH degree 1 — 9 coefficients per splat: 3 per channel (R, G, B)
    if (parsed.sh1) {
      const sh1 = parsed.sh1
      // sh1 layout: [r0, r1, r2, g0, g1, g2, b0, b1, b2] * count
      const sh1RData = new Float32Array(texelCount * 4)
      const sh1GData = new Float32Array(texelCount * 4)
      const sh1BData = new Float32Array(texelCount * 4)

      for (let i = 0; i < parsed.count; i++) {
        const base = i * 9
        // Red channel coefficients
        sh1RData[i * 4]     = sh1[base]
        sh1RData[i * 4 + 1] = sh1[base + 1]
        sh1RData[i * 4 + 2] = sh1[base + 2]
        // Green channel coefficients
        sh1GData[i * 4]     = sh1[base + 3]
        sh1GData[i * 4 + 1] = sh1[base + 4]
        sh1GData[i * 4 + 2] = sh1[base + 5]
        // Blue channel coefficients
        sh1BData[i * 4]     = sh1[base + 6]
        sh1BData[i * 4 + 1] = sh1[base + 7]
        sh1BData[i * 4 + 2] = sh1[base + 8]
      }

      this.sh1RTex = this.makeTexture(sh1RData)
      this.sh1GTex = this.makeTexture(sh1GData)
      this.sh1BTex = this.makeTexture(sh1BData)
      this.hasSH1 = true
      console.log(`[SplatData] Packed SH1 data into 3 additional textures`)
    }

    // Verify
    console.log(`[SplatData] Packed ${parsed.count} splats into ${this.width}x${this.height} textures (hasSH1=${this.hasSH1})`)
    if (parsed.count > 0) {
      console.log(`[SplatData] Verify positionTex[0]: (${posData[0].toFixed(3)}, ${posData[1].toFixed(3)}, ${posData[2].toFixed(3)}, ${posData[3].toFixed(3)})`)
    }
  }

  private makeTexture(data: Float32Array): THREE.DataTexture {
    const tex = new THREE.DataTexture(data, this.width, this.height, THREE.RGBAFormat, THREE.FloatType)
    tex.needsUpdate = true
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    return tex
  }

  dispose(): void {
    this.positionTex.dispose()
    this.scaleTex.dispose()
    this.rotationTex.dispose()
    this.colorTex.dispose()
    this.sh1RTex?.dispose()
    this.sh1GTex?.dispose()
    this.sh1BTex?.dispose()
  }
}
