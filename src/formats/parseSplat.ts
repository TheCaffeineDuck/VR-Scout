export interface ParsedSplatData {
  count: number
  positions: Float32Array
  scales: Float32Array
  rotations: Float32Array
  colors: Float32Array
  opacities: Float32Array
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
    console.log(`[parseSplat] Sample color[0]: (${colors[0].toFixed(3)}, ${colors[1].toFixed(3)}, ${colors[2].toFixed(3)}) opacity: ${opacities[0].toFixed(3)}`)
  }

  return { count, positions, scales, rotations, colors, opacities }
}
