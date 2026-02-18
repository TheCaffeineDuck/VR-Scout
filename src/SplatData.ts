import * as THREE from 'three/webgpu'
import type { ParsedSplatData } from './formats/parseSplat'

export class SplatData {
  positionTex: THREE.DataTexture
  scaleTex: THREE.DataTexture
  rotationTex: THREE.DataTexture
  colorTex: THREE.DataTexture
  width: number
  height: number
  count: number

  constructor(parsed: ParsedSplatData) {
    this.count = parsed.count
    this.width = Math.ceil(Math.sqrt(parsed.count))
    this.height = Math.ceil(parsed.count / this.width)

    const texelCount = this.width * this.height

    // Position + Opacity: (pos.x, pos.y, pos.z, opacity)
    const posData = new Float32Array(texelCount * 4)
    for (let i = 0; i < parsed.count; i++) {
      posData[i * 4] = parsed.positions[i * 3]
      posData[i * 4 + 1] = parsed.positions[i * 3 + 1]
      posData[i * 4 + 2] = parsed.positions[i * 3 + 2]
      posData[i * 4 + 3] = parsed.opacities[i]
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

    // Color: (r, g, b, 0)
    const colorData = new Float32Array(texelCount * 4)
    for (let i = 0; i < parsed.count; i++) {
      colorData[i * 4] = parsed.colors[i * 3]
      colorData[i * 4 + 1] = parsed.colors[i * 3 + 1]
      colorData[i * 4 + 2] = parsed.colors[i * 3 + 2]
    }
    this.colorTex = this.makeTexture(colorData)

    // Verify
    console.log(`[SplatData] Packed ${parsed.count} splats into ${this.width}x${this.height} textures`)
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
  }
}
