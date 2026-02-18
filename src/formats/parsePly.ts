import type { ParsedSplatData } from './parseSplat'

interface PropertyDef {
  name: string
  type: string
  byteSize: number
}

const TYPE_SIZES: Record<string, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4,
  float: 4, float32: 4,
  double: 8, float64: 8,
}

const SH_C0 = 0.28209479177387814

function sigmoid(x: number): number {
  return 1.0 / (1.0 + Math.exp(-x))
}

export function parsePly(buffer: ArrayBuffer): ParsedSplatData {
  const headerEnd = findHeaderEnd(buffer)
  const headerStr = new TextDecoder().decode(new Uint8Array(buffer, 0, headerEnd))
  const lines = headerStr.split('\n').map(l => l.trim())

  // Check format
  const formatLine = lines.find(l => l.startsWith('format'))
  if (!formatLine || !formatLine.includes('binary_little_endian')) {
    throw new Error(`Unsupported PLY format: ${formatLine}. Only binary_little_endian is supported.`)
  }

  // Get vertex count
  const vertexLine = lines.find(l => l.startsWith('element vertex'))
  if (!vertexLine) throw new Error('No vertex element found in PLY header')
  const count = parseInt(vertexLine.split(' ')[2], 10)

  // Parse properties
  const properties: PropertyDef[] = []
  let inVertexElement = false
  for (const line of lines) {
    if (line.startsWith('element vertex')) {
      inVertexElement = true
      continue
    }
    if (line.startsWith('element') && inVertexElement) break
    if (inVertexElement && line.startsWith('property')) {
      const parts = line.split(/\s+/)
      if (parts[1] === 'list') continue // skip list properties
      const type = parts[1]
      const name = parts[2]
      const byteSize = TYPE_SIZES[type]
      if (byteSize === undefined) throw new Error(`Unknown PLY type: ${type}`)
      properties.push({ name, type, byteSize })
    }
  }

  // Compute byte stride and property offsets
  const propMap = new Map<string, { offset: number; type: string }>()
  let stride = 0
  for (const p of properties) {
    propMap.set(p.name, { offset: stride, type: p.type })
    stride += p.byteSize
  }

  // Detect SH1: f_rest_0 through f_rest_8
  const hasSH1Props = propMap.has('f_rest_0') && propMap.has('f_rest_8')

  // Data starts after "end_header\n"
  const dataStart = headerEnd + 1 // +1 for the newline after end_header
  const dataView = new DataView(buffer, dataStart)

  const positions = new Float32Array(count * 3)
  const scales = new Float32Array(count * 3)
  const rotations = new Float32Array(count * 4)
  const colors = new Float32Array(count * 3)
  const opacities = new Float32Array(count)
  // SH1: 9 floats per splat [r0,r1,r2, g0,g1,g2, b0,b1,b2]
  const sh1 = hasSH1Props ? new Float32Array(count * 9) : null

  function readFloat(byteOffset: number, propName: string): number {
    const prop = propMap.get(propName)
    if (!prop) return 0
    const off = byteOffset + prop.offset
    if (prop.type === 'float' || prop.type === 'float32') return dataView.getFloat32(off, true)
    if (prop.type === 'double' || prop.type === 'float64') return dataView.getFloat64(off, true)
    if (prop.type === 'uchar' || prop.type === 'uint8') return dataView.getUint8(off)
    if (prop.type === 'char' || prop.type === 'int8') return dataView.getInt8(off)
    if (prop.type === 'short' || prop.type === 'int16') return dataView.getInt16(off, true)
    if (prop.type === 'ushort' || prop.type === 'uint16') return dataView.getUint16(off, true)
    if (prop.type === 'int' || prop.type === 'int32') return dataView.getInt32(off, true)
    if (prop.type === 'uint' || prop.type === 'uint32') return dataView.getUint32(off, true)
    return 0
  }

  for (let i = 0; i < count; i++) {
    const byteOffset = i * stride

    // Position (direct)
    positions[i * 3] = readFloat(byteOffset, 'x')
    positions[i * 3 + 1] = readFloat(byteOffset, 'y')
    positions[i * 3 + 2] = readFloat(byteOffset, 'z')

    // Scale (stored in log-space, need exp)
    scales[i * 3] = Math.exp(readFloat(byteOffset, 'scale_0'))
    scales[i * 3 + 1] = Math.exp(readFloat(byteOffset, 'scale_1'))
    scales[i * 3 + 2] = Math.exp(readFloat(byteOffset, 'scale_2'))

    // Rotation (direct float WXYZ)
    let rw = readFloat(byteOffset, 'rot_0')
    let rx = readFloat(byteOffset, 'rot_1')
    let ry = readFloat(byteOffset, 'rot_2')
    let rz = readFloat(byteOffset, 'rot_3')

    // Normalize
    const len = Math.sqrt(rw * rw + rx * rx + ry * ry + rz * rz)
    if (len > 0) {
      rw /= len; rx /= len; ry /= len; rz /= len
    }
    rotations[i * 4] = rw
    rotations[i * 4 + 1] = rx
    rotations[i * 4 + 2] = ry
    rotations[i * 4 + 3] = rz

    // Color from SH DC (f_dc_0/1/2) → 0.5 + SH_C0 * value
    if (propMap.has('f_dc_0')) {
      colors[i * 3] = 0.5 + SH_C0 * readFloat(byteOffset, 'f_dc_0')
      colors[i * 3 + 1] = 0.5 + SH_C0 * readFloat(byteOffset, 'f_dc_1')
      colors[i * 3 + 2] = 0.5 + SH_C0 * readFloat(byteOffset, 'f_dc_2')
    } else if (propMap.has('red')) {
      // Some PLY files have direct color
      colors[i * 3] = readFloat(byteOffset, 'red') / 255.0
      colors[i * 3 + 1] = readFloat(byteOffset, 'green') / 255.0
      colors[i * 3 + 2] = readFloat(byteOffset, 'blue') / 255.0
    }

    // Opacity (sigmoid of logit)
    if (propMap.has('opacity')) {
      opacities[i] = sigmoid(readFloat(byteOffset, 'opacity'))
    } else {
      opacities[i] = 1.0
    }

    // SH degree 1 coefficients (direct float values from training)
    // f_rest_0..2 → red channel, f_rest_3..5 → green, f_rest_6..8 → blue
    if (sh1 && hasSH1Props) {
      const base = i * 9
      sh1[base]     = readFloat(byteOffset, 'f_rest_0')
      sh1[base + 1] = readFloat(byteOffset, 'f_rest_1')
      sh1[base + 2] = readFloat(byteOffset, 'f_rest_2')
      sh1[base + 3] = readFloat(byteOffset, 'f_rest_3')
      sh1[base + 4] = readFloat(byteOffset, 'f_rest_4')
      sh1[base + 5] = readFloat(byteOffset, 'f_rest_5')
      sh1[base + 6] = readFloat(byteOffset, 'f_rest_6')
      sh1[base + 7] = readFloat(byteOffset, 'f_rest_7')
      sh1[base + 8] = readFloat(byteOffset, 'f_rest_8')
    }
  }

  console.log(`[parsePly] Parsed ${count} splats (${properties.length} properties, stride ${stride} bytes, hasSH1=${hasSH1Props})`)
  if (count > 0) {
    console.log(`[parsePly] Sample pos[0]: (${positions[0].toFixed(3)}, ${positions[1].toFixed(3)}, ${positions[2].toFixed(3)})`)
    console.log(`[parsePly] Sample color[0]: (${colors[0].toFixed(3)}, ${colors[1].toFixed(3)}, ${colors[2].toFixed(3)}) opacity: ${opacities[0].toFixed(3)}`)
  }

  return { count, positions, scales, rotations, colors, opacities, sh1 }
}

function findHeaderEnd(buffer: ArrayBuffer): number {
  const bytes = new Uint8Array(buffer)
  const target = new TextEncoder().encode('end_header')
  for (let i = 0; i < Math.min(bytes.length, 65536); i++) {
    let found = true
    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) { found = false; break }
    }
    if (found) return i + target.length
  }
  throw new Error('Could not find end_header in PLY file')
}
