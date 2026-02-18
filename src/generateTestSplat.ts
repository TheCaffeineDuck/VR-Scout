// Generates a synthetic .splat file for testing
// Creates a grid of colored splats that should be visible as a colored point cloud

export function generateTestSplatBuffer(count: number = 500): ArrayBuffer {
  const buffer = new ArrayBuffer(count * 32)
  const f32 = new Float32Array(buffer)
  const u8 = new Uint8Array(buffer)

  const gridSize = Math.ceil(Math.cbrt(count))

  for (let i = 0; i < count; i++) {
    const ix = i % gridSize
    const iy = Math.floor(i / gridSize) % gridSize
    const iz = Math.floor(i / (gridSize * gridSize))

    const f32Offset = i * 8
    const byteOffset = i * 32

    // Position: spread out on a grid
    const spacing = 0.3
    f32[f32Offset] = (ix - gridSize / 2) * spacing
    f32[f32Offset + 1] = (iy - gridSize / 2) * spacing
    f32[f32Offset + 2] = (iz - gridSize / 2) * spacing

    // Scale: uniform small size
    f32[f32Offset + 3] = 0.03
    f32[f32Offset + 4] = 0.03
    f32[f32Offset + 5] = 0.03

    // Color: gradient based on position
    u8[byteOffset + 24] = Math.floor((ix / gridSize) * 255) // R
    u8[byteOffset + 25] = Math.floor((iy / gridSize) * 255) // G
    u8[byteOffset + 26] = Math.floor((iz / gridSize) * 255) // B
    u8[byteOffset + 27] = 230 // Alpha (high opacity)

    // Rotation: identity quaternion (w=1, x=0, y=0, z=0)
    // Mapped: (v/255)*2 - 1 = 1 → v = 255; = 0 → v = 127.5
    u8[byteOffset + 28] = 255 // w = 1
    u8[byteOffset + 29] = 128 // x ≈ 0
    u8[byteOffset + 30] = 128 // y ≈ 0
    u8[byteOffset + 31] = 128 // z ≈ 0
  }

  return buffer
}
