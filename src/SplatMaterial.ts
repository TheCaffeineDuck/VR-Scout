import * as THREE from 'three/webgpu'
import type { Node } from 'three/webgpu'
import {
  Fn, uniform, textureLoad,
  instanceIndex, positionGeometry,
  vec2, vec3, vec4, float, int, ivec2,
  mat3, max, clamp, sqrt, exp,
  cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix,
  varyingProperty, Discard, If,
} from 'three/tsl'
import type { SplatData } from './SplatData'

// Helper: TSL .element() and swizzles return Nodes at runtime but @types/three
// doesn't type them. We cast through this helper.
const n = (v: any) => v as Node

const ZERO = float(0)
const ONE = float(1)

export function createSplatMaterial(data: SplatData): THREE.NodeMaterial {
  const material = new THREE.NodeMaterial()
  material.transparent = true
  material.depthWrite = false
  material.depthTest = true
  material.blending = THREE.CustomBlending
  material.blendEquation = THREE.AddEquation
  material.blendSrc = THREE.OneFactor
  material.blendDst = THREE.OneMinusSrcAlphaFactor
  material.side = THREE.DoubleSide

  const viewportUniform = uniform(new THREE.Vector2(window.innerWidth, window.innerHeight))
  const texWidthUniform = uniform(int(data.width))

  // Store reference for updating viewport
  ;(material as any)._viewportUniform = viewportUniform

  // --- Vertex Shader ---
  material.vertexNode = Fn(() => {
    // 1. Splat index
    const idx = instanceIndex

    // 2. Texture coordinate from index
    const u = idx.mod(texWidthUniform)
    const v = idx.div(texWidthUniform)
    const texCoord = ivec2(u, v)

    // 3. Fetch attributes from data textures
    const posAndOpacity = textureLoad(data.positionTex, texCoord)
    const splatPos = posAndOpacity.xyz
    const opacity = posAndOpacity.w

    const scaleVec = textureLoad(data.scaleTex, texCoord).xyz
    const rot = textureLoad(data.rotationTex, texCoord) // RGBA = (w, x, y, z)
    const color = textureLoad(data.colorTex, texCoord).rgb

    // 4. Quaternion → Rotation Matrix (3x3)
    // Texture stores (w, x, y, z) in RGBA channels
    const qw = rot.x
    const qx = rot.y
    const qy = rot.z
    const qz = rot.w

    const x2 = qx.mul(qx)
    const y2 = qy.mul(qy)
    const z2 = qz.mul(qz)
    const xy = qx.mul(qy)
    const xz = qx.mul(qz)
    const yz = qy.mul(qz)
    const wx = qw.mul(qx)
    const wy = qw.mul(qy)
    const wz = qw.mul(qz)

    // Column-major mat3
    const rotMat = mat3(
      vec3(ONE.sub(y2.add(z2).mul(2)), xy.add(wz).mul(2), xz.sub(wy).mul(2)),
      vec3(xy.sub(wz).mul(2), ONE.sub(x2.add(z2).mul(2)), yz.add(wx).mul(2)),
      vec3(xz.add(wy).mul(2), yz.sub(wx).mul(2), ONE.sub(x2.add(y2).mul(2)))
    )

    // 5. 3D Covariance: M = R * S, cov3D = M * M^T
    const scaleMat = mat3(
      vec3(scaleVec.x, ZERO, ZERO),
      vec3(ZERO, scaleVec.y, ZERO),
      vec3(ZERO, ZERO, scaleVec.z)
    )
    const M = rotMat.mul(scaleMat)

    // Transpose of M — element(i) returns column i, then swizzle to get components
    const m = (matrix: any) => ({
      col: (i: number) => (matrix as any).element(i),
      at: (col: number, comp: string) => n((matrix as any).element(col)[comp]),
    })
    const mM = m(M)
    const Mt = mat3(
      vec3(mM.at(0, 'x'), mM.at(1, 'x'), mM.at(2, 'x')),
      vec3(mM.at(0, 'y'), mM.at(1, 'y'), mM.at(2, 'y')),
      vec3(mM.at(0, 'z'), mM.at(1, 'z'), mM.at(2, 'z'))
    )
    const cov3D = M.mul(Mt)

    // 6. Project to screen space
    const modelView = cameraViewMatrix.mul(modelWorldMatrix)
    const viewPos = modelView.mul(vec4(splatPos, 1.0)).xyz

    // Frustum culling: degenerate if behind camera
    const behindCamera = viewPos.z.greaterThan(ZERO)

    // Focal lengths from projection matrix
    const fx = n((cameraProjectionMatrix as any).element(0).x).mul(viewportUniform.x).mul(0.5)
    const fy = n((cameraProjectionMatrix as any).element(1).y).mul(viewportUniform.y).mul(0.5)

    // Jacobian of perspective projection
    const tz = viewPos.z
    const tz2 = tz.mul(tz)
    const J = mat3(
      vec3(fx.div(tz), ZERO, ZERO),
      vec3(ZERO, fy.div(tz), ZERO),
      vec3(fx.negate().mul(viewPos.x).div(tz2), fy.negate().mul(viewPos.y).div(tz2), ZERO)
    )

    // View-space rotation (upper-left 3x3 of modelview)
    const W = mat3(
      n((modelView as any).element(0).xyz),
      n((modelView as any).element(1).xyz),
      n((modelView as any).element(2).xyz)
    )

    const T = J.mul(W)

    // Transpose of T
    const mT = m(T)
    const Tt = mat3(
      vec3(mT.at(0, 'x'), mT.at(1, 'x'), mT.at(2, 'x')),
      vec3(mT.at(0, 'y'), mT.at(1, 'y'), mT.at(2, 'y')),
      vec3(mT.at(0, 'z'), mT.at(1, 'z'), mT.at(2, 'z'))
    )
    const cov2Dfull = T.mul(cov3D).mul(Tt)

    // 2x2 upper-left + stability term
    const mc = m(cov2Dfull)
    const a = n(mc.at(0, 'x')).add(0.3)
    const b = mc.at(0, 'y')
    const c = n(mc.at(1, 'y')).add(0.3)

    // 7. Eigendecomposition → Ellipse axes
    const det = a.mul(c).sub(n(b).mul(b))
    const trace = a.add(c)
    const disc = max(float(0.1), trace.mul(trace).sub(det.mul(4)))
    const sqrtD = sqrt(disc)
    const lambda1 = trace.add(sqrtD).mul(0.5)
    const lambda2 = trace.sub(sqrtD).mul(0.5)

    // Eigenvector for lambda1
    const rawV1 = vec2(b, lambda1.sub(a))
    const v1Len = sqrt(rawV1.x.mul(rawV1.x).add(rawV1.y.mul(rawV1.y)))
    const v1 = vec2(
      rawV1.x.div(max(v1Len, float(0.0001))),
      rawV1.y.div(max(v1Len, float(0.0001)))
    )
    const v2 = vec2(v1.y.negate(), v1.x)

    // Radii (3σ)
    const r1 = sqrt(max(lambda1, float(0.0001))).mul(3.0)
    const r2 = sqrt(max(lambda2, float(0.0001))).mul(3.0)

    // 8. Position the quad vertex
    const quadPos = positionGeometry.xy
    const offset = v1.mul(quadPos.x).mul(r1).add(v2.mul(quadPos.y).mul(r2))

    // Project splat center to clip space
    const clipPos = cameraProjectionMatrix.mul(vec4(viewPos, 1.0)).toVar()

    // Apply pixel offset in clip space
    clipPos.x.addAssign(offset.x.mul(2.0).div(viewportUniform.x).mul(clipPos.w))
    clipPos.y.addAssign(offset.y.mul(2.0).div(viewportUniform.y).mul(clipPos.w))

    // Degenerate if behind camera
    const finalClip = behindCamera.select(vec4(0, 0, 0, 0), clipPos)

    // 9. Pass varyings to fragment
    const vColor = varyingProperty('vec3', 'vColor')
    const vOpacity = varyingProperty('float', 'vOpacity')
    const vQuadPos = varyingProperty('vec2', 'vQuadPos')
    const vConic = varyingProperty('vec3', 'vConic')

    vColor.assign(color)
    vOpacity.assign(opacity)
    vQuadPos.assign(quadPos)

    // Conic (inverse of 2x2 covariance)
    const invDet = ONE.div(max(det, float(0.0001)))
    vConic.assign(vec3(c.mul(invDet), n(b).negate().mul(invDet), a.mul(invDet)))

    return finalClip
  })()

  // --- Fragment Shader ---
  material.colorNode = Fn(() => {
    const vColor = varyingProperty('vec3', 'vColor')
    const vOpacity = varyingProperty('float', 'vOpacity')
    const vQuadPos = varyingProperty('vec2', 'vQuadPos')
    const vConic = varyingProperty('vec3', 'vConic')

    const dx = vQuadPos.x
    const dy = vQuadPos.y

    // Gaussian evaluation
    const power = float(-0.5).mul(
      vConic.x.mul(dx.mul(dx))
        .add(vConic.y.mul(dx).mul(dy).mul(2.0))
        .add(vConic.z.mul(dy.mul(dy)))
    )

    const alpha = clamp(vOpacity.mul(exp(power)), 0.0, 0.99)

    // Discard near-transparent fragments
    If(alpha.lessThan(1.0 / 255.0), () => {
      Discard()
    })

    // Premultiplied alpha output
    return vec4(vColor.mul(alpha), alpha)
  })()

  return material
}
