export interface ParsedSplatData {
  count: number
  positions: Float32Array
  scales: Float32Array
  rotations: Float32Array
  colors: Float32Array
  opacities: Float32Array
  /** SH degree-1 coefficients: 9 floats per splat [r0,r1,r2, g0,g1,g2, b0,b1,b2].
   *  null if the format doesn't include SH data (e.g. .splat files). */
  sh1: Float32Array | null
}

export function parseSplat(buffer: ArrayBuffer): ParsedSplatData {
  const bytesPerSplat = 32
  const count = buffer.byteLength / bytesPerSplat

  if (buffer.byteLength % bytesPerSplat !== 0) {
    throw new Error(`Invalid .splat file: size ${buffer.byteLength} is not a multiple of ${bytesPerSplat}`)
  }

  const positions = new Float32Array(count * 3)
  const scales = new Float32Array(count * 3)
  const rotations = new Float32Array(count * 4)
  const colors = new Float32Array(count * 3)
  const opacities = new Float32Array(count)

  const f32 = new Float32Array(buffer)
  const u8 = new Uint8Array(buffer)

  for (let i = 0; i < count; i++) {
    const f32Offset = i * 8 // 32 bytes / 4 = 8 float32s per splat
    const byteOffset = i * 32

    // Position: bytes 0-11 (3 float32)
    positions[i * 3] = f32[f32Offset]
    positions[i * 3 + 1] = f32[f32Offset + 1]
    positions[i * 3 + 2] = f32[f32Offset + 2]

    // Scale: bytes 12-23 (3 float32)
    scales[i * 3] = f32[f32Offset + 3]
    scales[i * 3 + 1] = f32[f32Offset + 4]
    scales[i * 3 + 2] = f32[f32Offset + 5]

    // Color: bytes 24-27 (4 uint8: r, g, b, a)
    colors[i * 3] = u8[byteOffset + 24] / 255.0
    colors[i * 3 + 1] = u8[byteOffset + 25] / 255.0
    colors[i * 3 + 2] = u8[byteOffset + 26] / 255.0
    opacities[i] = u8[byteOffset + 27] / 255.0

    // Rotation: bytes 28-31 (4 uint8: w, x, y, z)
    let rw = (u8[byteOffset + 28] / 255.0) * 2.0 - 1.0
    let rx = (u8[byteOffset + 29] / 255.0) * 2.0 - 1.0
    let ry = (u8[byteOffset + 30] / 255.0) * 2.0 - 1.0
    let rz = (u8[byteOffset + 31] / 255.0) * 2.0 - 1.0

    // Normalize quaternion
    const len = Math.sqrt(rw * rw + rx * rx + ry * ry + rz * rz)
    if (len > 0) {
      rw /= len
      rx /= len
      ry /= len
      rz /= len
    }

    rotations[i * 4] = rw
    rotations[i * 4 + 1] = rx
    rotations[i * 4 + 2] = ry
    rotations[i * 4 + 3] = rz
  }

  console.log(`[parseSplat] Parsed ${count} splats`)
  if (count > 0) {
    console.log(`[parseSplat] Sample pos[0]: (${positions[0].toFixed(3)}, ${positions[1].toFixed(3)}, ${positions[2].toFixed(3)})`)
    console.log(`[parseSplat] Sample scale[0]: (${scales[0].toFixed(6)}, ${scales[1].toFixed(6)}, ${scales[2].toFixed(6)})`)
    console.log(`[parseSplat] Sample rot[0]: (${rotations[0].toFixed(4)}, ${rotations[1].toFixed(4)}, ${rotations[2].toFixed(4)}, ${rotations[3].toFixed(4)})`)
    console.log(`[parseSplat] Sample color[0]: (${colors[0].toFixed(3)}, ${colors[1].toFixed(3)}, ${colors[2].toFixed(3)}) opacity: ${opacities[0].toFixed(3)}`)
    // Scale statistics
    let minS = Infinity, maxS = -Infinity, sumS = 0
    for (let i = 0; i < count * 3; i++) {
      const s = scales[i]
      if (s < minS) minS = s
      if (s > maxS) maxS = s
      sumS += s
    }
    console.log(`[parseSplat] Scale stats: min=${minS.toFixed(6)}, max=${maxS.toFixed(6)}, mean=${(sumS / (count * 3)).toFixed(6)}`)
    // Check if scales look like log values (mostly negative)
    let negCount = 0
    for (let i = 0; i < Math.min(count * 3, 1000); i++) {
      if (scales[i] < 0) negCount++
    }
    console.log(`[parseSplat] First 1000 scale values: ${negCount} negative (if mostly negative, scales are log-encoded)`)
  }

  return { count, positions, scales, rotations, colors, opacities, sh1: null }
}
