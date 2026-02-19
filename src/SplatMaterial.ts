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
  material.blendSrc = THREE.OneFactor
  material.blendDst = THREE.OneMinusSrcAlphaFactor
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
      // GPU sort packs: bits[31:21] = distance key, bits[20:0] = original splat index
      // Extract lower 21 bits to get the actual splat index
      const packed = gpuIndexBuffer.element(instanceIndex)
      splatIndex = packed.bitAnd(uint(0x1FFFFF)).toInt()
    } else {
      const sortOrderFloat = attribute('sortOrder')
      splatIndex = sortOrderFloat.add(0.5).floor().toInt()
    }

    const u = splatIndex.mod(texWidthUniform)
    const v = splatIndex.div(texWidthUniform)
    const texCoord = ivec2(u, v)

    // 2. Fetch attributes
    const posAndOpacity = textureLoad(data.positionTex, texCoord)
    const splatPos = posAndOpacity.xyz
    const opacity = posAndOpacity.w

    const scaleVec = textureLoad(data.scaleTex, texCoord).xyz
    const rot = textureLoad(data.rotationTex, texCoord)

    const maxScale = max(max(scaleVec.x, scaleVec.y), scaleVec.z)
    const tooLargeScale = maxScale.greaterThan(float(2.0))

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

    // 4. 3D Covariance: Σ = R^T * S² * R (CUDA convention: M = S*R, Σ = M^T*M)
    // Σ[i][j] = Σ_k R[k][i] * S[k]² * R[k][j]
    const sx2 = scaleVec.x.mul(scaleVec.x)
    const sy2 = scaleVec.y.mul(scaleVec.y)
    const sz2 = scaleVec.z.mul(scaleVec.z)

    const cov00 = r00.mul(r00).mul(sx2).add(r10.mul(r10).mul(sy2)).add(r20.mul(r20).mul(sz2))
    const cov01 = r00.mul(r01).mul(sx2).add(r10.mul(r11).mul(sy2)).add(r20.mul(r21).mul(sz2))
    const cov02 = r00.mul(r02).mul(sx2).add(r10.mul(r12).mul(sy2)).add(r20.mul(r22).mul(sz2))
    const cov11 = r01.mul(r01).mul(sx2).add(r11.mul(r11).mul(sy2)).add(r21.mul(r21).mul(sz2))
    const cov12 = r01.mul(r02).mul(sx2).add(r11.mul(r12).mul(sy2)).add(r21.mul(r22).mul(sz2))
    const cov22 = r02.mul(r02).mul(sx2).add(r12.mul(r12).mul(sy2)).add(r22.mul(r22).mul(sz2))

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

    // 6. Compute 2D covariance: cov2d = J * W * Vrk * W^T * J^T
    //
    // W = upper 3x3 of modelView (world-to-camera rotation)
    const mv = (col: number, comp: string) => n((modelView as any).element(col)[comp])
    const w00 = mv(0, 'x'), w01 = mv(1, 'x'), w02 = mv(2, 'x')
    const w10 = mv(0, 'y'), w11 = mv(1, 'y'), w12 = mv(2, 'y')
    const w20 = mv(0, 'z'), w21 = mv(1, 'z'), w22 = mv(2, 'z')

    // Jacobian
    const j00 = focalX.div(tz)
    const j02 = focalX.negate().mul(tx).div(tz2)
    const j11 = focalY.div(tz)
    const j12 = focalY.negate().mul(ty).div(tz2)

    // Compute T = W^T * J using scalars (W^T[i][k] = W[k][i])
    // T[i][j] = Σ_k W[k][i] * J[k][j]
    // J only has j00 at [0][0], j11 at [1][1], j02 at [0][2], j12 at [1][2]
    const t00 = w00.mul(j00)
    const t01 = w10.mul(j11)
    const t02 = w00.mul(j02).add(w10.mul(j12))
    const t10 = w01.mul(j00)
    const t11 = w11.mul(j11)
    const t12 = w01.mul(j02).add(w11.mul(j12))
    const t20 = w02.mul(j00)
    const t21 = w12.mul(j11)
    const t22 = w02.mul(j02).add(w12.mul(j12))

    // cov2d = T^T * Vrk * T (only need upper-left 2x2)
    // P = Vrk * T (columns 0 and 1 only)
    const p00 = cov00.mul(t00).add(cov01.mul(t10)).add(cov02.mul(t20))
    const p10 = cov01.mul(t00).add(cov11.mul(t10)).add(cov12.mul(t20))
    const p20 = cov02.mul(t00).add(cov12.mul(t10)).add(cov22.mul(t20))
    const p01 = cov00.mul(t01).add(cov01.mul(t11)).add(cov02.mul(t21))
    const p11 = cov01.mul(t01).add(cov11.mul(t11)).add(cov12.mul(t21))
    const p21 = cov02.mul(t01).add(cov12.mul(t11)).add(cov22.mul(t21))

    // cov2d[i][j] = T^T[i][k] * P[k][j] = T[k][i] * P[k][j]
    const a = t00.mul(p00).add(t10.mul(p10)).add(t20.mul(p20)).add(0.3)
    const b = t00.mul(p01).add(t10.mul(p11)).add(t20.mul(p21))
    const c = t01.mul(p01).add(t11.mul(p11)).add(t21.mul(p21)).add(0.3)

    // 7. Eigendecomposition (antimatter15 formula)
    const mid = a.add(c).mul(0.5)
    const radius = sqrt(max(a.sub(c).mul(0.5).mul(a.sub(c).mul(0.5)).add(n(b).mul(b)), float(0.0001)))
    const lambda1 = mid.add(radius)
    const lambda2 = mid.sub(radius)

    const tooSmall = lambda2.lessThan(float(0.0))

    // Use 3*sqrt(λ) for 3-sigma coverage (99.7% of the Gaussian)
    // This is the correct formulation — NOT sqrt(2λ) which was wrong
    const diagVec = n(normalize(vec2(b, lambda1.sub(a))))
    const r1 = min(sqrt(max(lambda1, float(0.0001))).mul(3.0), float(1024.0))
    const r2 = min(sqrt(max(lambda2, float(0.0001))).mul(3.0), float(1024.0))
    const majorAxis = diagVec.mul(r1)
    const minorAxis = vec2(n(diagVec.y).negate(), diagVec.x).mul(r2)

    // 8. Position quad vertex
    const quadPos = positionGeometry.xy.mul(2.0)
    const pixelOffset = majorAxis.mul(quadPos.x).add(minorAxis.mul(quadPos.y))

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

    const culled = behindCamera.or(offScreen).or(tooSmall).or(tooLargeScale)
    const finalClip = select(culled, vec4(0, 0, 0, 0), clipPos)

    // 10. Color
    let color: Node
    if (data.hasSH1 && data.sh1RTex && data.sh1GTex && data.sh1BTex) {
      const SH_C1 = float(0.4886025119029199)
      const baseColor = textureLoad(data.colorTex, texCoord).rgb
      const sh1R = textureLoad(data.sh1RTex, texCoord).rgb
      const sh1G = textureLoad(data.sh1GTex, texCoord).rgb
      const sh1B = textureLoad(data.sh1BTex, texCoord).rgb
      const worldPos = n(modelWorldMatrix.mul(vec4(splatPos, 1.0))).xyz
      const dir = n(worldPos.sub(cameraPosition)).normalize()
      const sh1ContribR = SH_C1.mul(sh1R.x.mul(dir.y).add(sh1R.y.mul(dir.z)).add(sh1R.z.mul(dir.x)))
      const sh1ContribG = SH_C1.mul(sh1G.x.mul(dir.y).add(sh1G.y.mul(dir.z)).add(sh1G.z.mul(dir.x)))
      const sh1ContribB = SH_C1.mul(sh1B.x.mul(dir.y).add(sh1B.y.mul(dir.z)).add(sh1B.z.mul(dir.x)))
      color = vec3(max(ZERO, n(baseColor.r).add(sh1ContribR)), max(ZERO, n(baseColor.g).add(sh1ContribG)), max(ZERO, n(baseColor.b).add(sh1ContribB)))
    } else {
      color = textureLoad(data.colorTex, texCoord).rgb
    }

    // 11. Varyings
    // Pass pixel-space offset so the fragment shader can evaluate the conic in the correct space.
    // pixelOffset is already in pixel-space (same space as the 2D covariance conic).
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
    vOpacity.assign(opacity)
    vPixelOffset.assign(pixelOffset)
    vConic.assign(vec3(conicX, conicY, conicZ))

    const hasNaN = finalClip.x.notEqual(finalClip.x)
      .or(finalClip.y.notEqual(finalClip.y))
      .or(finalClip.z.notEqual(finalClip.z))
      .or(finalClip.w.notEqual(finalClip.w))

    return select(hasNaN, vec4(0, 0, 0, 0), finalClip)
  })()

  // --- Fragment Shader ---
  material.colorNode = Fn(() => {
    const vColor = varyingProperty('vec3', 'vColor')
    const vOpacity = varyingProperty('float', 'vOpacity')
    const vPixelOffset = varyingProperty('vec2', 'vPixelOffset')
    const vConic = varyingProperty('vec3', 'vConic')

    // Conic-based Gaussian evaluation in pixel space.
    // conic = (a', b', c') = inverse 2D covariance matrix entries:
    //   conic.x = c/det, conic.y = -b/det, conic.z = a/det
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
