import type { ParsedSplatData } from './parseSplat'

/**
 * Parse an SPZ (SPlat Zip) compressed Gaussian Splat file.
 *
 * SPZ is a gzip-compressed binary format created by Niantic Labs that provides
 * ~10× smaller files compared to raw .splat/.ply with minimal quality loss.
 *
 * Format: gzip( header(16 bytes) + column-based attribute data )
 * Reference: https://github.com/nianticlabs/spz
 */
export async function parseSpz(buffer: ArrayBuffer): Promise<ParsedSplatData> {
  // Validate gzip magic bytes
  const gzipHeader = new Uint8Array(buffer, 0, 2)
  if (gzipHeader[0] !== 0x1f || gzipHeader[1] !== 0x8b) {
    throw new Error('[parseSpz] Not a valid gzip file (missing 0x1f 0x8b magic bytes)')
  }

  // Decompress using browser-native DecompressionStream
  const decompressed = await decompressGzip(buffer)
  const data = new Uint8Array(decompressed)
  const view = new DataView(decompressed)

  // Validate minimum header size
  if (data.length < 16) {
    throw new Error(`[parseSpz] Decompressed data too small for header: ${data.length} bytes`)
  }

  // Parse header (16 bytes)
  const magic0 = data[0]  // 'N'
  const magic1 = data[1]  // 'G'
  const magic2 = data[2]  // 'S'
  const magic3 = data[3]  // 'P'

  if (magic0 !== 0x4e || magic1 !== 0x47 || magic2 !== 0x53 || magic3 !== 0x50) {
    throw new Error(
      `[parseSpz] Invalid SPZ magic: expected 0x4E475350 ("NGSP"), got 0x${magic0.toString(16)}${magic1.toString(16)}${magic2.toString(16)}${magic3.toString(16)}`
    )
  }

  const version = view.getUint32(4, true)
  if (version !== 2 && version !== 3) {
    throw new Error(`[parseSpz] Unsupported SPZ version: ${version} (expected 2 or 3)`)
  }

  const numPoints = view.getUint32(8, true)
  if (numPoints === 0) {
    throw new Error('[parseSpz] SPZ file has 0 points')
  }
  if (numPoints > 10_000_000) {
    throw new Error(`[parseSpz] SPZ file has ${numPoints} points, exceeds sanity limit of 10M`)
  }

  const shDegree = data[12]
  const fractionalBits = data[13]
  // const flags = data[14]  // bit 0 = antialiased (unused for now)
  // const reserved = data[15]

  if (shDegree > 3) {
    throw new Error(`[parseSpz] Invalid SH degree: ${shDegree} (expected 0-3)`)
  }

  console.log(`[parseSpz] Header: version=${version}, numPoints=${numPoints}, shDegree=${shDegree}, fractionalBits=${fractionalBits}`)

  // Compute SH coefficient count per point
  const shCoeffCounts: Record<number, number> = { 0: 0, 1: 9, 2: 24, 3: 45 }
  const shCoeffCount = shCoeffCounts[shDegree] ?? 0

  // Compute expected data size
  // Rotation bytes depend on version: v2 = 3 bytes (first three), v3 = 4 bytes (smallest three)
  const rotBytesPerPoint = version >= 3 ? 4 : 3
  const positionBytes = numPoints * 9            // 3 × 3 bytes (24-bit fixed-point)
  const alphaBytes = numPoints * 1               // 1 byte per point
  const colorBytes = numPoints * 3               // 3 bytes per point (RGB)
  const scaleBytes = numPoints * 3               // 3 bytes per point
  const rotationBytes = numPoints * rotBytesPerPoint
  const shBytes = numPoints * shCoeffCount       // variable

  const expectedSize = 16 + positionBytes + alphaBytes + colorBytes + scaleBytes + rotationBytes + shBytes
  if (data.length < expectedSize) {
    throw new Error(
      `[parseSpz] Decompressed data too small: ${data.length} bytes, expected at least ${expectedSize} bytes ` +
      `(${numPoints} points, shDegree=${shDegree})`
    )
  }

  // Allocate output arrays
  const positions = new Float32Array(numPoints * 3)
  const scales = new Float32Array(numPoints * 3)
  const rotations = new Float32Array(numPoints * 4)
  const colors = new Float32Array(numPoints * 3)
  const opacities = new Float32Array(numPoints)

  // Track byte offsets through the column data
  let offset = 16

  // 1. Positions — numPoints × 9 bytes (3 × 24-bit signed fixed-point)
  const fractScale = 1.0 / (1 << fractionalBits)
  for (let i = 0; i < numPoints; i++) {
    for (let c = 0; c < 3; c++) {
      // Read 3 bytes little-endian unsigned
      let val = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16)
      // Convert to signed 24-bit
      if (val >= 0x800000) val -= 0x1000000
      positions[i * 3 + c] = val * fractScale
      offset += 3
    }
  }

  // 2. Alphas — numPoints × 1 byte (uint8, inverse sigmoid encoded)
  for (let i = 0; i < numPoints; i++) {
    const byteVal = data[offset++]
    // Inverse sigmoid: opacity = 1 / (1 + exp(-(v/255 * 12 - 6)))
    const logit = (byteVal / 255.0) * 12.0 - 6.0
    opacities[i] = 1.0 / (1.0 + Math.exp(-logit))
  }

  // 3. Colors — numPoints × 3 bytes (uint8 RGB, SH0 DC component)
  for (let i = 0; i < numPoints; i++) {
    colors[i * 3] = data[offset++] / 255.0
    colors[i * 3 + 1] = data[offset++] / 255.0
    colors[i * 3 + 2] = data[offset++] / 255.0
  }

  // 4. Scales — numPoints × 3 bytes (uint8, log-encoded)
  for (let i = 0; i < numPoints; i++) {
    scales[i * 3] = Math.exp((data[offset++] - 128) / 16.0)
    scales[i * 3 + 1] = Math.exp((data[offset++] - 128) / 16.0)
    scales[i * 3 + 2] = Math.exp((data[offset++] - 128) / 16.0)
  }

  // 5. Rotations — version 2: 3 bytes per point, version 3: 4 bytes per point
  if (version === 2) {
    // Version 2 "first three": 3 × uint8 → xyz via (value / 127.5 - 1.0), w reconstructed
    // Reference: nianticlabs/spz unpackQuaternionFirstThree()
    for (let i = 0; i < numPoints; i++) {
      const qx = data[offset++] / 127.5 - 1.0
      const qy = data[offset++] / 127.5 - 1.0
      const qz = data[offset++] / 127.5 - 1.0

      // Reconstruct w from unit quaternion constraint
      const qw = Math.sqrt(Math.max(0, 1.0 - qx * qx - qy * qy - qz * qz))

      // Normalize
      const len = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz)
      if (len > 0) {
        rotations[i * 4] = qw / len
        rotations[i * 4 + 1] = qx / len
        rotations[i * 4 + 2] = qy / len
        rotations[i * 4 + 3] = qz / len
      } else {
        rotations[i * 4] = 1
        rotations[i * 4 + 1] = 0
        rotations[i * 4 + 2] = 0
        rotations[i * 4 + 3] = 0
      }
    }
  } else {
    // Version 3: "smallest three" packed quaternion (4 bytes per point)
    // Reference: nianticlabs/spz unpackQuaternionSmallestThree()
    // SPZ quaternion order is [x, y, z, w] (indices 0-3)
    // Our ParsedSplatData expects [w, x, y, z]
    for (let i = 0; i < numPoints; i++) {
      const packed = view.getUint32(offset, true)
      offset += 4

      // largestIdx refers to [x, y, z, w] in SPZ space
      const largestIdx = packed & 0x3
      // Extract 3 × 10-bit signed values
      let a = (packed >> 2) & 0x3ff
      let b = (packed >> 12) & 0x3ff
      let c = (packed >> 22) & 0x3ff

      // Convert to signed (10-bit two's complement)
      if (a >= 512) a -= 1024
      if (b >= 512) b -= 1024
      if (c >= 512) c -= 1024

      // Normalize: reference uses sqrt(0.5) * value / 511 but simplified:
      const na = a / 511.0
      const nb = b / 511.0
      const nc = c / 511.0

      // Reconstruct largest component
      const largest = Math.sqrt(Math.max(0, 1.0 - na * na - nb * nb - nc * nc))

      // Place components into SPZ quaternion [x, y, z, w]
      const spzQuat = [0, 0, 0, 0]
      let slot = 0
      for (let j = 0; j < 4; j++) {
        if (j === largestIdx) {
          spzQuat[j] = largest
        } else {
          spzQuat[j] = slot === 0 ? na : slot === 1 ? nb : nc
          slot++
        }
      }

      // Remap from SPZ [x,y,z,w] to our [w,x,y,z] and normalize
      const qx = spzQuat[0], qy = spzQuat[1], qz = spzQuat[2], qw = spzQuat[3]
      const len = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz)
      if (len > 0) {
        rotations[i * 4] = qw / len
        rotations[i * 4 + 1] = qx / len
        rotations[i * 4 + 2] = qy / len
        rotations[i * 4 + 3] = qz / len
      } else {
        rotations[i * 4] = 1
        rotations[i * 4 + 1] = 0
        rotations[i * 4 + 2] = 0
        rotations[i * 4 + 3] = 0
      }
    }
  }

  // 6. Spherical Harmonics — only extract degree 1 (9 coefficients) if available
  let sh1: Float32Array | null = null
  if (shDegree >= 1 && shCoeffCount > 0) {
    sh1 = new Float32Array(numPoints * 9)
    // SH data is organized: for each splat, shCoeffCount int8 values
    // with color channel as inner axis: [sh1n1_r, sh1n1_g, sh1n1_b, sh10_r, sh10_g, sh10_b, sh1p1_r, sh1p1_g, sh1p1_b, ...]
    // We only need the first 9 (degree 1)

    // SPZ stores SH as interleaved: coefficient outer, color inner
    // degree 1 = 3 coefficients × 3 colors = 9 values
    // Layout in SPZ: [c0_r, c0_g, c0_b, c1_r, c1_g, c1_b, c2_r, c2_g, c2_b, ...]
    //
    // parsePly stores SH1 as: [r0, r1, r2, g0, g1, g2, b0, b1, b2]
    // i.e. color-grouped (f_rest_0..2 = red, f_rest_3..5 = green, f_rest_6..8 = blue)
    //
    // SPZ stores: [c0_r, c0_g, c0_b, c1_r, c1_g, c1_b, c2_r, c2_g, c2_b]
    // i.e. coefficient-grouped with color as inner axis
    //
    // We need to transpose from SPZ layout to PLY layout:
    // SPZ[0]=c0_r → sh1[0]=r0  ✓
    // SPZ[1]=c0_g → sh1[3]=g0
    // SPZ[2]=c0_b → sh1[6]=b0
    // SPZ[3]=c1_r → sh1[1]=r1
    // SPZ[4]=c1_g → sh1[4]=g1
    // SPZ[5]=c1_b → sh1[7]=b1
    // SPZ[6]=c2_r → sh1[2]=r2
    // SPZ[7]=c2_g → sh1[5]=g2
    // SPZ[8]=c2_b → sh1[8]=b2

    for (let i = 0; i < numPoints; i++) {
      const shOffset = offset + i * shCoeffCount

      // Read 9 int8 values (3 coefficients × 3 colors, color-inner)
      // Transpose to color-grouped layout matching parsePly
      for (let coeff = 0; coeff < 3; coeff++) {
        for (let ch = 0; ch < 3; ch++) {
          const srcIdx = shOffset + coeff * 3 + ch
          let val = data[srcIdx]
          if (val > 127) val -= 256  // int8
          // PLY stores raw SH coefficient values; SPZ stores quantized int8 / 128
          sh1[i * 9 + ch * 3 + coeff] = val / 128.0
        }
      }
    }
  }

  // Advance offset past all SH data
  offset += numPoints * shCoeffCount

  console.log(`[parseSpz] Parsed ${numPoints} splats (version=${version}, shDegree=${shDegree})`)
  if (numPoints > 0) {
    console.log(`[parseSpz] Sample pos[0]: (${positions[0].toFixed(3)}, ${positions[1].toFixed(3)}, ${positions[2].toFixed(3)})`)
    console.log(`[parseSpz] Sample scale[0]: (${scales[0].toFixed(6)}, ${scales[1].toFixed(6)}, ${scales[2].toFixed(6)})`)
    console.log(`[parseSpz] Sample rot[0]: (${rotations[0].toFixed(4)}, ${rotations[1].toFixed(4)}, ${rotations[2].toFixed(4)}, ${rotations[3].toFixed(4)})`)
    console.log(`[parseSpz] Sample color[0]: (${colors[0].toFixed(3)}, ${colors[1].toFixed(3)}, ${colors[2].toFixed(3)}) opacity: ${opacities[0].toFixed(3)}`)
  }

  return { count: numPoints, positions, scales, rotations, colors, opacities, sh1 }
}

/**
 * Decompress gzip data using the browser-native DecompressionStream API.
 * Zero external dependencies.
 */
async function decompressGzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(new Uint8Array(buffer))
  writer.close()
  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLength)
  let off = 0
  for (const chunk of chunks) {
    result.set(chunk, off)
    off += chunk.length
  }
  return result.buffer
}
