import * as THREE from 'three/webgpu'
import type { Node } from 'three/webgpu'
import {
  Fn, uniform, textureLoad, attribute, instanceIndex,
  positionGeometry,
  vec2, vec3, vec4, float, int, uint, ivec2,
  max, min, clamp, sqrt, exp,
  cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix,
  cameraPosition,
  varyingProperty, Discard, If,
  select, normalize,
} from 'three/tsl'
import type { SplatData } from './SplatData'

const n = (v: any) => v as Node
const ZERO = float(0)
const ONE = float(1)

export interface SplatMaterialOptions {
  gpuIndexBuffer?: any | null
}

export function createSplatMaterial(data: SplatData, options?: SplatMaterialOptions): THREE.NodeMaterial {
  const material = new THREE.NodeMaterial()
  material.transparent = true
  material.depthWrite = false
  material.depthTest = true
  material.blending = THREE.CustomBlending
  material.blendEquation = THREE.AddEquation
  material.blendSrc = THREE.OneMinusDstAlphaFactor
  material.blendDst = THREE.OneFactor
  material.side = THREE.DoubleSide

  const viewportUniform = uniform(new THREE.Vector2(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio), 'vec2')
  const texWidthUniform = uniform(data.width, 'int')
  ;(material as any)._viewportUniform = viewportUniform

  const gpuIndexBuffer = options?.gpuIndexBuffer ?? null

  // --- Vertex Shader ---
  material.vertexNode = Fn(() => {
    // 1. Resolve splat index
    let splatIndex: any
    if (gpuIndexBuffer) {
      // Radix sort stores full 32-bit indices (no key packing)
      splatIndex = gpuIndexBuffer.element(instanceIndex).toInt()
    } else {
      const sortOrderFloat = attribute('sortOrder')
      splatIndex = sortOrderFloat.add(0.5).floor().toInt()
    }

    const u = splatIndex.mod(texWidthUniform)
    const v = splatIndex.div(texWidthUniform)
    const texCoord = ivec2(u, v)

    // 2. Fetch attributes
    // Opacity lives in colorTex.a (moved from positionTex.w in Phase D2).
    // positionTex.w is always 0.
    const posData = textureLoad(data.positionTex, texCoord)
    const splatPos = posData.xyz
    const colorAndOpacity = textureLoad(data.colorTex, texCoord)
    const opacity = colorAndOpacity.w

    const scaleVec = textureLoad(data.scaleTex, texCoord).xyz
    const rot = textureLoad(data.rotationTex, texCoord)

    // 3. Quaternion → Rotation Matrix
    const qw = rot.x, qx = rot.y, qy = rot.z, qz = rot.w

    const x2 = qx.mul(qx), y2 = qy.mul(qy), z2 = qz.mul(qz)
    const xy = qx.mul(qy), xz = qx.mul(qz), yz = qy.mul(qz)
    const wx = qw.mul(qx), wy = qw.mul(qy), wz = qw.mul(qz)

    // R[row][col] elements of the standard quaternion rotation matrix
    const r00 = ONE.sub(y2.add(z2).mul(2))
    const r01 = xy.sub(wz).mul(2)
    const r02 = xz.add(wy).mul(2)
    const r10 = xy.add(wz).mul(2)
    const r11 = ONE.sub(x2.add(z2).mul(2))
    const r12 = yz.sub(wx).mul(2)
    const r20 = xz.sub(wy).mul(2)
    const r21 = yz.add(wx).mul(2)
    const r22 = ONE.sub(x2.add(y2).mul(2))

    // 4. 3D Covariance: Σ = R * S² * R^T (matching CUDA/antimatter15 reference)
    // Σ[i][j] = Σ_k R[i][k] * S[k]² * R[j][k]
    const sx2 = scaleVec.x.mul(scaleVec.x)
    const sy2 = scaleVec.y.mul(scaleVec.y)
    const sz2 = scaleVec.z.mul(scaleVec.z)

    const cov00 = r00.mul(r00).mul(sx2).add(r01.mul(r01).mul(sy2)).add(r02.mul(r02).mul(sz2))
    const cov01 = r00.mul(r10).mul(sx2).add(r01.mul(r11).mul(sy2)).add(r02.mul(r12).mul(sz2))
    const cov02 = r00.mul(r20).mul(sx2).add(r01.mul(r21).mul(sy2)).add(r02.mul(r22).mul(sz2))
    const cov11 = r10.mul(r10).mul(sx2).add(r11.mul(r11).mul(sy2)).add(r12.mul(r12).mul(sz2))
    const cov12 = r10.mul(r20).mul(sx2).add(r11.mul(r21).mul(sy2)).add(r12.mul(r22).mul(sz2))
    const cov22 = r20.mul(r20).mul(sx2).add(r21.mul(r21).mul(sy2)).add(r22.mul(r22).mul(sz2))

    // 5. Transform to screen space
    const modelView = cameraViewMatrix.mul(modelWorldMatrix)
    const viewPos = modelView.mul(vec4(splatPos, 1.0)).xyz
    const viewPosZ = n(viewPos.z)

    const tz = max(viewPosZ.negate(), float(0.3))
    const tz2 = tz.mul(tz)

    const focalX = n((cameraProjectionMatrix as any).element(0).x).mul(viewportUniform.x).mul(0.5)
    const focalY = n((cameraProjectionMatrix as any).element(1).y).mul(viewportUniform.y).mul(0.5)

    // Clamp view-space x,y (CUDA reference)
    const tanFovX = float(1.0).div(n((cameraProjectionMatrix as any).element(0).x))
    const tanFovY = float(1.0).div(n((cameraProjectionMatrix as any).element(1).y))
    const limX = tanFovX.mul(1.3).mul(tz)
    const limY = tanFovY.mul(1.3).mul(tz)
    const tx = clamp(n(viewPos.x), limX.negate(), limX)
    const ty = clamp(n(viewPos.y), limY.negate(), limY)

    // 6. Compute 2D covariance: cov2d = T^T * Vrk * T
    //
    // W = upper 3x3 of modelView (world-to-camera rotation)
    const mv = (col: number, comp: string) => n((modelView as any).element(col)[comp])
    const w00 = mv(0, 'x'), w01 = mv(1, 'x'), w02 = mv(2, 'x')
    const w10 = mv(0, 'y'), w11 = mv(1, 'y'), w12 = mv(2, 'y')
    const w20 = mv(0, 'z'), w21 = mv(1, 'z'), w22 = mv(2, 'z')

    // Jacobian of perspective projection (matching antimatter15/CUDA reference exactly)
    // antimatter15 uses cam.z (negative), so: J[0][0] = fx/cz = -fx/tz, J[1][1] = -fy/cz = fy/tz
    // Cross-terms: J[2][0] = -fx*cx/cz² = -fx*tx/tz², J[2][1] = fy*cy/cz² = +fy*ty/tz²
    // Note the asymmetry: j02 is negative, j12 is positive (y-axis flip built into J[1][1])
    const j00 = focalX.negate().div(tz)
    const j02 = focalX.negate().mul(tx).div(tz2)
    const j11 = focalY.div(tz)
    const j12 = focalY.mul(ty).div(tz2)

    // Compute T = W^T * J (matching antimatter15 reference exactly)
    // T[i][j] = Σ_k W[k][i] * J[k][j]
    // J col 0: (j00, 0, j02) and col 1: (0, j11, j12)
    const t00 = w00.mul(j00).add(w20.mul(j02))
    const t01 = w10.mul(j11).add(w20.mul(j12))
    const t10 = w01.mul(j00).add(w21.mul(j02))
    const t11 = w11.mul(j11).add(w21.mul(j12))
    const t20 = w02.mul(j00).add(w22.mul(j02))
    const t21 = w12.mul(j11).add(w22.mul(j12))

    // cov2d = T^T * Vrk * T (only need upper-left 2x2)
    // P = Vrk * T (columns 0 and 1 only)
    const p00 = cov00.mul(t00).add(cov01.mul(t10)).add(cov02.mul(t20))
    const p10 = cov01.mul(t00).add(cov11.mul(t10)).add(cov12.mul(t20))
    const p20 = cov02.mul(t00).add(cov12.mul(t10)).add(cov22.mul(t20))
    const p01 = cov00.mul(t01).add(cov01.mul(t11)).add(cov02.mul(t21))
    const p11 = cov01.mul(t01).add(cov11.mul(t11)).add(cov12.mul(t21))
    const p21 = cov02.mul(t01).add(cov12.mul(t11)).add(cov22.mul(t21))

    // cov2d[i][j] = T^T[i][k] * P[k][j] = T[k][i] * P[k][j]
    // No low-pass filter — antimatter15 reference omits it for sharper output
    const a = t00.mul(p00).add(t10.mul(p10)).add(t20.mul(p20))
    const b = t00.mul(p01).add(t10.mul(p11)).add(t20.mul(p21))
    const c = t01.mul(p01).add(t11.mul(p11)).add(t21.mul(p21))

    // 7. Eigendecomposition
    const mid = a.add(c).mul(0.5)
    const radius = sqrt(max(a.sub(c).mul(0.5).mul(a.sub(c).mul(0.5)).add(n(b).mul(b)), float(0.0001)))
    const lambda1 = mid.add(radius)
    const lambda2 = mid.sub(radius)

    const tooSmall = lambda2.lessThan(float(0.0))

    // Quad sizing: 3*sqrt(λ) for 3-sigma coverage (99.7% of the Gaussian)
    // quadPos ∈ [-1,1], so total pixel extent = ±1 × 3√λ = ±3√λ from center.
    const diagVec = n(normalize(vec2(b, lambda1.sub(a))))
    const r1 = min(sqrt(max(lambda1, float(0.0001))).mul(3.0), float(1024.0))
    const r2 = min(sqrt(max(lambda2, float(0.0001))).mul(3.0), float(1024.0))
    const majorAxis = diagVec.mul(r1)
    const minorAxis = vec2(n(diagVec.y).negate(), diagVec.x).mul(r2)

    // 8. Position quad vertex
    // quadPos in [-1,1] — axis lengths already encode the 3σ coverage radius.
    // No ×2 multiplier: vertex at quadPos=±1 maps to ±3√λ pixels from center.
    // Fragment discard at power<-4 corresponds to ~2.83σ, well within the quad.
    const quadPos = positionGeometry.xy
    const pixelOffset = majorAxis.mul(quadPos.x).add(minorAxis.mul(quadPos.y))

    // Standard clip-space positioning: pixel offset → NDC offset × w
    const clipPos = cameraProjectionMatrix.mul(vec4(viewPos, 1.0)).toVar()
    clipPos.x.addAssign(pixelOffset.x.mul(2.0).div(viewportUniform.x).mul(clipPos.w))
    clipPos.y.addAssign(pixelOffset.y.mul(2.0).div(viewportUniform.y).mul(clipPos.w))

    // 9. Frustum culling
    const behindCamera = viewPosZ.greaterThan(ZERO)
    const centerClip = cameraProjectionMatrix.mul(vec4(viewPos, 1.0))
    const clipW = n(centerClip.w).mul(1.2)
    const offScreen = n(centerClip.z).lessThan(clipW.negate())
      .or(n(centerClip.x).lessThan(clipW.negate()))
      .or(n(centerClip.x).greaterThan(clipW))
      .or(n(centerClip.y).lessThan(clipW.negate()))
      .or(n(centerClip.y).greaterThan(clipW))

    const culled = behindCamera.or(offScreen).or(tooSmall)
    // Degenerate w=0 → GPU discards the primitive (NaN in perspective divide).
    // All quad vertices collapse to the same degenerate point → zero-area triangle.
    const CULLED_POS = vec4(0, 0, 0, 0)
    const finalClip = select(culled, CULLED_POS, clipPos)

    // 10. Color — apply near-plane depth fade (antimatter15 reference)
    // antimatter15 (WebGL, z_ndc ∈ [-1,1]): clamp(z_ndc + 1, 0, 1)
    //   → fades near-half of frustum (z_ndc from -1 to 0)
    // WebGPU (z_ndc ∈ [0,1]): equivalent is clamp(z_ndc * 2, 0, 1)
    //   → fades near-half of frustum (z_ndc from 0 to 0.5)
    // This prevents foreground blob artifacts when camera is inside splat volume.
    const zNdc = n(centerClip.z).div(n(centerClip.w))
    const depthFade = clamp(zNdc.mul(2.0), 0.0, 1.0)

    let color: Node
    if (data.hasSH1 && data.sh1RTex && data.sh1GTex && data.sh1BTex) {
      const SH_C1 = float(0.4886025119029199)
      const baseColor = colorAndOpacity.rgb
      const sh1R = textureLoad(data.sh1RTex, texCoord).rgb
      const sh1G = textureLoad(data.sh1GTex, texCoord).rgb
      const sh1B = textureLoad(data.sh1BTex, texCoord).rgb
      const worldPos = n(modelWorldMatrix.mul(vec4(splatPos, 1.0))).xyz
      const dir = n(worldPos.sub(cameraPosition)).normalize()
      const sh1ContribR = SH_C1.mul(sh1R.x.mul(dir.y).add(sh1R.y.mul(dir.z)).add(sh1R.z.mul(dir.x)))
      const sh1ContribG = SH_C1.mul(sh1G.x.mul(dir.y).add(sh1G.y.mul(dir.z)).add(sh1G.z.mul(dir.x)))
      const sh1ContribB = SH_C1.mul(sh1B.x.mul(dir.y).add(sh1B.y.mul(dir.z)).add(sh1B.z.mul(dir.x)))
      const sh1Color = vec3(max(ZERO, n(baseColor.r).add(sh1ContribR)), max(ZERO, n(baseColor.g).add(sh1ContribG)), max(ZERO, n(baseColor.b).add(sh1ContribB)))
      color = sh1Color.mul(depthFade)
    } else {
      color = colorAndOpacity.rgb.mul(depthFade)
    }

    // 11. Varyings — pass pixel offset and conic for fragment shader Gaussian evaluation
    const vColor = varyingProperty('vec3', 'vColor')
    const vOpacity = varyingProperty('float', 'vOpacity')
    const vPixelOffset = varyingProperty('vec2', 'vPixelOffset')
    // Conic = inverse 2D covariance: (c/det, -b/det, a/det) where det = a*c - b*b
    const det = a.mul(c).sub(n(b).mul(b))
    const detSafe = max(det, float(0.0001))
    const conicX = c.div(detSafe)
    const conicY = b.negate().div(detSafe)
    const conicZ = a.div(detSafe)
    const vConic = varyingProperty('vec3', 'vConic')

    vColor.assign(color)
    // antimatter15 applies depthFade to full RGBA — opacity is also faded for near-plane splats
    vOpacity.assign(opacity.mul(depthFade))
    vPixelOffset.assign(pixelOffset)
    vConic.assign(vec3(conicX, conicY, conicZ))

    const hasNaN = finalClip.x.notEqual(finalClip.x)
      .or(finalClip.y.notEqual(finalClip.y))
      .or(finalClip.z.notEqual(finalClip.z))
      .or(finalClip.w.notEqual(finalClip.w))

    return select(hasNaN, CULLED_POS, finalClip)
  })()

  // --- Fragment Shader ---
  // Conic-based Gaussian evaluation in pixel space.
  // The conic (inverse 2D covariance) and pixel offset are interpolated from the vertex shader.
  material.colorNode = Fn(() => {
    const vColor = varyingProperty('vec3', 'vColor')
    const vOpacity = varyingProperty('float', 'vOpacity')
    const vPixelOffset = varyingProperty('vec2', 'vPixelOffset')
    const vConic = varyingProperty('vec3', 'vConic')

    // power = -0.5 * (conic.x * dx² + 2 * conic.y * dx * dy + conic.z * dy²)
    const dx = n(vPixelOffset.x)
    const dy = n(vPixelOffset.y)
    const power = vConic.x.mul(dx.mul(dx))
      .add(float(2.0).mul(vConic.y).mul(dx).mul(dy))
      .add(vConic.z.mul(dy.mul(dy)))
      .mul(float(-0.5))

    // Discard fragments outside the Gaussian (power < -4 means alpha < ~2%)
    If(power.lessThan(float(-4.0)), () => { Discard() })

    const alpha = clamp(exp(power).mul(vOpacity), 0.0, 0.99)
    If(alpha.lessThan(1.0 / 255.0), () => { Discard() })

    return vec4(vColor.mul(alpha), alpha)
  })()

  return material
}
