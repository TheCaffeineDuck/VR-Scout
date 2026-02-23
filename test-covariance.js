/**
 * test-covariance.js
 *
 * Computes 2D covariance of a Gaussian splat using both our method (TSL shader)
 * and antimatter15's method, then compares results numerically.
 *
 * Run: node test-covariance.js
 * No external dependencies.
 */

"use strict";

// ============================================================================
// Input data from room.splat console output
// ============================================================================
const SPLAT_POS = [-1.019, 1.457, -1.327];
const SPLAT_SCALE = [0.009081, 0.032357, 0.065963];
const SPLAT_QUAT = { w: 0.9823, x: -0.0660, y: -0.0116, z: 0.1747 }; // (w,x,y,z)

const CAM_POS = [0, -1.03, 0];
const LOOK_AT = [0.9, -0.8, -0.84];
const UP = [0, 1, 0];

const FOV_DEG = 60;
const VIEWPORT_W = 1920;
const VIEWPORT_H = 1580;
const FOCAL_X = 1368.3;
const FOCAL_Y = 1368.3;

// ============================================================================
// Helper: 3x3 and 4x4 matrix utilities (row-major storage)
// mat[row][col]
// ============================================================================

function mat3Zero() {
  return [[0,0,0],[0,0,0],[0,0,0]];
}

function mat3Identity() {
  return [[1,0,0],[0,1,0],[0,0,1]];
}

function mat3Mul(A, B) {
  const C = mat3Zero();
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}

function mat3Transpose(A) {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]],
  ];
}

function mat3MulVec(A, v) {
  return [
    A[0][0]*v[0] + A[0][1]*v[1] + A[0][2]*v[2],
    A[1][0]*v[0] + A[1][1]*v[1] + A[1][2]*v[2],
    A[2][0]*v[0] + A[2][1]*v[1] + A[2][2]*v[2],
  ];
}

function mat4MulVec4(M, v) {
  const r = [0,0,0,0];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      r[i] += M[i][j] * v[j];
  return r;
}

function vec3Sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function vec3Cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}
function vec3Dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function vec3Normalize(a) {
  const len = Math.sqrt(vec3Dot(a, a));
  return [a[0]/len, a[1]/len, a[2]/len];
}
function vec3Negate(a) { return [-a[0], -a[1], -a[2]]; }

function printMat3(label, M) {
  console.log(`${label}:`);
  for (let i = 0; i < 3; i++)
    console.log(`  [${M[i].map(v => v.toFixed(8)).join(', ')}]`);
}

function printVec3(label, v) {
  console.log(`${label}: (${v.map(x => x.toFixed(8)).join(', ')})`);
}

function printMat4(label, M) {
  console.log(`${label}:`);
  for (let i = 0; i < 4; i++)
    console.log(`  [${M[i].map(v => v.toFixed(8)).join(', ')}]`);
}

// ============================================================================
// 1. Quaternion -> Rotation matrix (standard formula)
//    R[row][col], same as the shader's r00..r22
// ============================================================================
function quatToRotationMatrix(q) {
  const { w, x, y, z } = q;
  const x2 = x*x, y2 = y*y, z2 = z*z;
  const xy = x*y, xz = x*z, yz = y*z;
  const wx = w*x, wy = w*y, wz = w*z;

  return [
    [1 - 2*(y2+z2),   2*(xy - wz),   2*(xz + wy)],
    [2*(xy + wz),     1 - 2*(x2+z2), 2*(yz - wx)],
    [2*(xz - wy),     2*(yz + wx),   1 - 2*(x2+y2)],
  ];
}

console.log("=".repeat(80));
console.log("GAUSSIAN SPLAT 2D COVARIANCE COMPARISON TEST");
console.log("=".repeat(80));
console.log();

// --- Step 1: Rotation matrix ---
const R = quatToRotationMatrix(SPLAT_QUAT);
printMat3("Rotation matrix R (from quaternion)", R);
console.log();

// Verify orthogonality
const RtR = mat3Mul(mat3Transpose(R), R);
printMat3("R^T * R (should be identity)", RtR);
console.log();

// ============================================================================
// 2. 3D Covariance: two conventions
//    Convention A (CUDA/antimatter15): M = S*R, Sigma = M^T*M = R^T*S^2*R
//    Convention B (other):             M = R*S, Sigma = M^T*M = S*R^T*R*S = S^2  (wrong)
//                                      Actually: Sigma = R*S^2*R^T
// ============================================================================

const S2 = [
  [SPLAT_SCALE[0]**2, 0, 0],
  [0, SPLAT_SCALE[1]**2, 0],
  [0, 0, SPLAT_SCALE[2]**2],
];

console.log("--- 3D Covariance ---");
console.log(`Scale: (${SPLAT_SCALE.join(', ')})`);
console.log(`S^2 diag: (${SPLAT_SCALE.map(s=>s*s).join(', ')})`);
console.log();

// Convention A: Sigma_A = R^T * S^2 * R
const Sigma_A = mat3Mul(mat3Transpose(R), mat3Mul(S2, R));
printMat3("Sigma_A = R^T * S^2 * R (CUDA convention)", Sigma_A);
console.log();

// Convention B: Sigma_B = R * S^2 * R^T
const Sigma_B = mat3Mul(R, mat3Mul(S2, mat3Transpose(R)));
printMat3("Sigma_B = R * S^2 * R^T (other convention)", Sigma_B);
console.log();

// --- Verify our shader matches Convention A ---
// The shader computes: cov[i][j] = sum_k R[k][i]*S[k]^2*R[k][j]
// That is: cov = R^T * S^2 * R = Sigma_A
// Let's verify:
function shaderCov3D(R, scale) {
  const sx2 = scale[0]**2, sy2 = scale[1]**2, sz2 = scale[2]**2;
  const cov = mat3Zero();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      cov[i][j] = R[0][i]*R[0][j]*sx2 + R[1][i]*R[1][j]*sy2 + R[2][i]*R[2][j]*sz2;
    }
  }
  return cov;
}

const Sigma_shader = shaderCov3D(R, SPLAT_SCALE);
printMat3("Sigma_shader (cov[i][j] = sum_k R[k][i]*S[k]^2*R[k][j])", Sigma_shader);
console.log();

// Check if shader matches Convention A
let maxDiffA = 0;
for (let i = 0; i < 3; i++)
  for (let j = 0; j < 3; j++)
    maxDiffA = Math.max(maxDiffA, Math.abs(Sigma_shader[i][j] - Sigma_A[i][j]));
console.log(`Max |Sigma_shader - Sigma_A| = ${maxDiffA.toExponential(4)}  (should be ~0)`);

let maxDiffB = 0;
for (let i = 0; i < 3; i++)
  for (let j = 0; j < 3; j++)
    maxDiffB = Math.max(maxDiffB, Math.abs(Sigma_shader[i][j] - Sigma_B[i][j]));
console.log(`Max |Sigma_shader - Sigma_B| = ${maxDiffB.toExponential(4)}  (should be > 0 if conventions differ)`);
console.log();

// We will use Sigma_A for both methods (the CUDA convention, which our shader uses)
const Sigma = Sigma_A;

// ============================================================================
// 3. Build the View Matrix (Three.js / OpenGL style: camera looks along -Z)
// ============================================================================

function buildLookAt(eye, target, up) {
  // Standard OpenGL lookAt:
  //   zAxis = normalize(eye - target)    (points AWAY from target, i.e. towards camera back)
  //   xAxis = normalize(cross(up, zAxis))
  //   yAxis = cross(zAxis, xAxis)
  //
  //   V = [ xAxis.x  xAxis.y  xAxis.z  -dot(xAxis,eye) ]
  //       [ yAxis.x  yAxis.y  yAxis.z  -dot(yAxis,eye) ]
  //       [ zAxis.x  zAxis.y  zAxis.z  -dot(zAxis,eye) ]
  //       [ 0        0        0         1               ]
  //
  // In this convention, objects in front of the camera have viewPos.z < 0.

  const zAxis = vec3Normalize(vec3Sub(eye, target));
  const xAxis = vec3Normalize(vec3Cross(up, zAxis));
  const yAxis = vec3Cross(zAxis, xAxis);

  return [
    [xAxis[0], xAxis[1], xAxis[2], -vec3Dot(xAxis, eye)],
    [yAxis[0], yAxis[1], yAxis[2], -vec3Dot(yAxis, eye)],
    [zAxis[0], zAxis[1], zAxis[2], -vec3Dot(zAxis, eye)],
    [0, 0, 0, 1],
  ];
}

console.log("--- View Matrix ---");
const V = buildLookAt(CAM_POS, LOOK_AT, UP);
printMat4("View matrix V (Three.js/OpenGL lookAt, -Z forward)", V);
console.log();

// ============================================================================
// 4. Transform splat to view space
// ============================================================================

const viewPos = mat4MulVec4(V, [...SPLAT_POS, 1]);
printVec3("viewPos (should have z < 0 for visible)", viewPos.slice(0, 3));
console.log(`viewPos.z = ${viewPos[2].toFixed(8)} (negative = in front of camera)`);
console.log();

// Extract W = upper 3x3 of V
const W = [
  [V[0][0], V[0][1], V[0][2]],
  [V[1][0], V[1][1], V[1][2]],
  [V[2][0], V[2][1], V[2][2]],
];
printMat3("W = upper 3x3 of V (world-to-camera rotation)", W);
console.log();

// ============================================================================
// 5. OUR METHOD (Three.js convention: viewPos.z < 0, tz = -viewPos.z)
// ============================================================================

console.log("=".repeat(80));
console.log("OUR METHOD (Three.js convention)");
console.log("=".repeat(80));
console.log();

const tz_ours = Math.max(-viewPos[2], 0.3);  // tz = -viewPos.z (positive)
const tz2_ours = tz_ours * tz_ours;
const tx_ours = viewPos[0];  // view-space x (before clamping)
const ty_ours = viewPos[1];  // view-space y

console.log(`tz (= -viewPos.z, clamped > 0.3): ${tz_ours.toFixed(8)}`);
console.log(`tx (viewPos.x): ${tx_ours.toFixed(8)}`);
console.log(`ty (viewPos.y): ${ty_ours.toFixed(8)}`);
console.log();

// Our Jacobian:
//   J[0][0] = focalX / tz
//   J[0][2] = -focalX * tx / tz^2
//   J[1][1] = focalY / tz
//   J[1][2] = -focalY * ty / tz^2
//   rest = 0

const J_ours = [
  [FOCAL_X / tz_ours,    0,                     -FOCAL_X * tx_ours / tz2_ours],
  [0,                     FOCAL_Y / tz_ours,     -FOCAL_Y * ty_ours / tz2_ours],
  [0,                     0,                      0],
];
printMat3("J_ours (Jacobian)", J_ours);
console.log();

// T = W^T * J^T  (but actually the shader computes T such that cov2d = T^T * Sigma * T)
// Let's follow the shader exactly:
//
// The shader computes T[i][j] = sum_k W[k][i] * J[k][j]
// which is T = W^T * J^T ... wait, let me re-derive.
//
// W^T[i][k] = W[k][i]
// T[i][j] = W^T[i][k] * J_transposed?
//
// Actually from the shader code:
//   t00 = w00 * j00         => T[0][0] = W[0][0] * J[0][0]
//   t01 = w10 * j11         => T[0][1] = W[1][0] * J[1][1]
//   t02 = w00*j02 + w10*j12 => T[0][2] = W[0][0]*J[0][2] + W[1][0]*J[1][2]
//   t10 = w01 * j00         => T[1][0] = W[0][1] * J[0][0]
//   t11 = w11 * j11         => T[1][1] = W[1][1] * J[1][1]
//   t12 = w01*j02 + w11*j12 => T[1][2] = W[0][1]*J[0][2] + W[1][1]*J[1][2]
//   t20 = w02 * j00         => T[2][0] = W[0][2] * J[0][0]
//   t21 = w12 * j11         => T[2][1] = W[1][2] * J[1][1]
//   t22 = w02*j02 + w12*j12 => T[2][2] = W[0][2]*J[0][2] + W[1][2]*J[1][2]
//
// So T[i][j] = sum_k W[k][i] * J[k][j]  (treating J as having only nonzero at [0][0],[0][2],[1][1],[1][2])
// This is T = W^T * J  where W^T[i][k] = W[k][i]
// Equivalently: T^T = J^T * W

function computeT_shader(W, J) {
  // T[i][j] = sum_k W[k][i] * J[k][j] = (W^T * J)[i][j]
  const WT = mat3Transpose(W);
  return mat3Mul(WT, J);
}

const T_ours = computeT_shader(W, J_ours);
printMat3("T_ours = W^T * J_ours", T_ours);
console.log();

// cov2d = T^T * Sigma * T  (shader: cov2d[i][j] = T[k][i] * (Sigma * T)[k][j])
const SigmaT_ours = mat3Mul(Sigma, T_ours);
const cov2d_ours = mat3Mul(mat3Transpose(T_ours), SigmaT_ours);

console.log("cov2d_ours = T^T * Sigma * T:");
console.log(`  a (cov2d[0][0]): ${cov2d_ours[0][0].toFixed(8)}`);
console.log(`  b (cov2d[0][1]): ${cov2d_ours[0][1].toFixed(8)}`);
console.log(`  c (cov2d[1][1]): ${cov2d_ours[1][1].toFixed(8)}`);
console.log();

// Add the +0.3 low-pass filter (shader does a += 0.3, c += 0.3)
const a_ours = cov2d_ours[0][0] + 0.3;
const b_ours = cov2d_ours[0][1];
const c_ours = cov2d_ours[1][1] + 0.3;
console.log("After low-pass filter (+0.3):");
console.log(`  a = ${a_ours.toFixed(8)}`);
console.log(`  b = ${b_ours.toFixed(8)}`);
console.log(`  c = ${c_ours.toFixed(8)}`);
console.log();

// Eigenvalues
const mid_ours = (a_ours + c_ours) / 2;
const disc_ours = Math.sqrt(Math.max(((a_ours - c_ours)/2)**2 + b_ours*b_ours, 0.0001));
const lambda1_ours = mid_ours + disc_ours;
const lambda2_ours = mid_ours - disc_ours;
console.log(`Eigenvalues: lambda1 = ${lambda1_ours.toFixed(8)}, lambda2 = ${lambda2_ours.toFixed(8)}`);
console.log(`Sqrt eigenvalues (sigma): ${Math.sqrt(lambda1_ours).toFixed(4)}, ${Math.sqrt(Math.max(lambda2_ours, 0)).toFixed(4)}`);
console.log(`Splat radii (2*sqrt(2*lambda)): ${(2*Math.sqrt(2*lambda1_ours)).toFixed(4)} x ${(2*Math.sqrt(2*Math.max(lambda2_ours, 0))).toFixed(4)} pixels`);
console.log();

// ============================================================================
// 6. ANTIMATTER15 METHOD
//    Their code: cam = view * vec4(center, 1)  => same view matrix, so cam.z < 0
//    Their Jacobian (from GLSL source):
//      J = mat3(
//        focal.x / cam.z, 0, -(focal.x * cam.x) / (cam.z * cam.z),
//        0, -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
//        0, 0, 0
//      );
//    Where focal.y = -proj[5] * viewport[1] / 2
//    With cam.z < 0:
//      J[0][0] = focal.x / cam.z  (negative, since cam.z < 0)
//      J[1][1] = -focal.y / cam.z
//      J[0][2] = -(focal.x * cam.x) / cam.z^2
//      J[1][2] = (focal.y * cam.y) / cam.z^2
//
//    In their code: focal.y = -proj[5] * viewport.y / 2
//    proj[5] = 2*near*n/(top-bottom) which for standard OpenGL is positive
//    So focal.y in antimatter15 is NEGATIVE.
//
//    Let me use the actual numeric values. In their convention:
//    focal_am.x = FOCAL_X (positive, same as ours)
//    focal_am.y = -FOCAL_Y (negative, because of their convention)
//
//    BUT WAIT: Let me re-examine. In standard OpenGL:
//    proj[5] = 2*n/(t-b). For symmetric frustum, this is positive.
//    focal_am.y = -proj[5] * viewport_h / 2 = -(positive) * positive / 2 = NEGATIVE
//
//    With cam.z = viewPos[2] (negative for visible objects):
//    J_am[0][0] = focal_am.x / cam.z = positive / negative = NEGATIVE
//    J_am[1][1] = -focal_am.y / cam.z = -(negative) / (negative) = positive / negative = NEGATIVE
//    J_am[0][2] = -(focal_am.x * cam.x) / (cam.z^2)
//    J_am[1][2] = (focal_am.y * cam.y) / (cam.z^2)
// ============================================================================

console.log("=".repeat(80));
console.log("ANTIMATTER15 METHOD");
console.log("=".repeat(80));
console.log();

const cam_z = viewPos[2];  // NEGATIVE for visible objects
const cam_x = viewPos[0];
const cam_y = viewPos[1];
const cam_z2 = cam_z * cam_z;

// antimatter15 focal values
const focal_am_x = FOCAL_X;  // positive
const focal_am_y = -FOCAL_Y;  // negative (their convention: focal.y = -proj[5] * viewport/2)

console.log(`cam = (${cam_x.toFixed(8)}, ${cam_y.toFixed(8)}, ${cam_z.toFixed(8)})`);
console.log(`focal_am = (${focal_am_x.toFixed(4)}, ${focal_am_y.toFixed(4)})`);
console.log();

// antimatter15 Jacobian (exactly from their GLSL)
const J_am = [
  [focal_am_x / cam_z,   0,                         -(focal_am_x * cam_x) / cam_z2],
  [0,                     -focal_am_y / cam_z,       (focal_am_y * cam_y) / cam_z2],
  [0,                     0,                          0],
];
printMat3("J_am (antimatter15 Jacobian, from GLSL)", J_am);
console.log();

// Let's also check what J values would be with their ACTUAL sign convention
console.log("Checking J_am element signs:");
console.log(`  J_am[0][0] = focal_am_x / cam_z = ${focal_am_x} / ${cam_z.toFixed(6)} = ${J_am[0][0].toFixed(6)}`);
console.log(`  J_am[1][1] = -focal_am_y / cam_z = ${-focal_am_y} / ${cam_z.toFixed(6)} = ${J_am[1][1].toFixed(6)}`);
console.log(`  J_am[0][2] = -(focal_am_x * cam_x) / cam_z^2 = -(${focal_am_x} * ${cam_x.toFixed(6)}) / ${cam_z2.toFixed(6)} = ${J_am[0][2].toFixed(6)}`);
console.log(`  J_am[1][2] = (focal_am_y * cam_y) / cam_z^2 = (${focal_am_y} * ${cam_y.toFixed(6)}) / ${cam_z2.toFixed(6)} = ${J_am[1][2].toFixed(6)}`);
console.log();

// In antimatter15 GLSL:
//   T = transpose(Vrk * W * J);  -- NOTE: they do Vrk * W * J, not J * W * Vrk * W^T * J^T
//   cov = vec3(T[0][0] + 0.3, T[0][1], T[1][1] + 0.3);
//
// Wait, let me re-read. Their code:
//   mat3 T = W * J;
//   mat3 cov = transpose(T) * Vrk * T;
//
// Where W in their code is the upper 3x3 of the view matrix.
// So: cov2d = T^T * Vrk * T where T = W * J

// BUT WAIT: in antimatter15's GLSL, they compute T differently.
// Let me check what "W" means in their code. In their vertex shader:
//   mat3 W = transpose(mat3(view));
// So W_am = transpose(upper3x3(view)) = W^T in our notation!
//
// Then: T_am = W_am * J = W^T * J (same as our T computation!)

console.log("Computing T_am = W^T * J_am (same structure as ours):");
const T_am = computeT_shader(W, J_am);  // This does W^T * J
printMat3("T_am = W^T * J_am", T_am);
console.log();

// cov2d = T^T * Sigma * T
const SigmaT_am = mat3Mul(Sigma, T_am);
const cov2d_am = mat3Mul(mat3Transpose(T_am), SigmaT_am);

console.log("cov2d_am = T_am^T * Sigma * T_am:");
console.log(`  a (cov2d[0][0]): ${cov2d_am[0][0].toFixed(8)}`);
console.log(`  b (cov2d[0][1]): ${cov2d_am[0][1].toFixed(8)}`);
console.log(`  c (cov2d[1][1]): ${cov2d_am[1][1].toFixed(8)}`);
console.log();

const a_am = cov2d_am[0][0] + 0.3;
const b_am = cov2d_am[0][1];
const c_am = cov2d_am[1][1] + 0.3;
console.log("After low-pass filter (+0.3):");
console.log(`  a = ${a_am.toFixed(8)}`);
console.log(`  b = ${b_am.toFixed(8)}`);
console.log(`  c = ${c_am.toFixed(8)}`);
console.log();

const mid_am = (a_am + c_am) / 2;
const disc_am = Math.sqrt(Math.max(((a_am - c_am)/2)**2 + b_am*b_am, 0.0001));
const lambda1_am = mid_am + disc_am;
const lambda2_am = mid_am - disc_am;
console.log(`Eigenvalues: lambda1 = ${lambda1_am.toFixed(8)}, lambda2 = ${lambda2_am.toFixed(8)}`);
console.log(`Sqrt eigenvalues (sigma): ${Math.sqrt(lambda1_am).toFixed(4)}, ${Math.sqrt(Math.max(lambda2_am, 0)).toFixed(4)}`);
console.log(`Splat radii (2*sqrt(2*lambda)): ${(2*Math.sqrt(2*lambda1_am)).toFixed(4)} x ${(2*Math.sqrt(2*Math.max(lambda2_am, 0))).toFixed(4)} pixels`);
console.log();

// ============================================================================
// 7. ALTERNATIVE: antimatter15 with POSITIVE focal_y (if proj[5] is negative
//    or if focal is computed differently)
// ============================================================================

console.log("=".repeat(80));
console.log("ANTIMATTER15 VARIANT: focal_y POSITIVE (both focals = +1368.3)");
console.log("=".repeat(80));
console.log();

const focal_am2_x = FOCAL_X;
const focal_am2_y = FOCAL_Y;  // positive this time

const J_am2 = [
  [focal_am2_x / cam_z,   0,                           -(focal_am2_x * cam_x) / cam_z2],
  [0,                      -focal_am2_y / cam_z,        (focal_am2_y * cam_y) / cam_z2],
  [0,                      0,                            0],
];
printMat3("J_am2 (antimatter15 Jacobian, focal_y positive)", J_am2);
console.log();

const T_am2 = computeT_shader(W, J_am2);
printMat3("T_am2 = W^T * J_am2", T_am2);
console.log();

const SigmaT_am2 = mat3Mul(Sigma, T_am2);
const cov2d_am2 = mat3Mul(mat3Transpose(T_am2), SigmaT_am2);

const a_am2 = cov2d_am2[0][0] + 0.3;
const b_am2 = cov2d_am2[0][1];
const c_am2 = cov2d_am2[1][1] + 0.3;
console.log("cov2d (after +0.3):");
console.log(`  a = ${a_am2.toFixed(8)}`);
console.log(`  b = ${b_am2.toFixed(8)}`);
console.log(`  c = ${c_am2.toFixed(8)}`);
console.log();

const mid_am2 = (a_am2 + c_am2) / 2;
const disc_am2 = Math.sqrt(Math.max(((a_am2 - c_am2)/2)**2 + b_am2*b_am2, 0.0001));
const lambda1_am2 = mid_am2 + disc_am2;
const lambda2_am2 = mid_am2 - disc_am2;
console.log(`Eigenvalues: lambda1 = ${lambda1_am2.toFixed(8)}, lambda2 = ${lambda2_am2.toFixed(8)}`);
console.log(`Splat radii: ${(2*Math.sqrt(2*lambda1_am2)).toFixed(4)} x ${(2*Math.sqrt(2*Math.max(lambda2_am2, 0))).toFixed(4)} pixels`);
console.log();

// ============================================================================
// 8. COMPARISON TABLE
// ============================================================================

console.log("=".repeat(80));
console.log("COMPARISON SUMMARY");
console.log("=".repeat(80));
console.log();

console.log("Method                          |  a (cov_xx)  |  b (cov_xy)  |  c (cov_yy)  | lambda1     | lambda2     | radius_major | radius_minor");
console.log("-".repeat(155));

function row(label, a, b, c) {
  const mid = (a + c) / 2;
  const disc = Math.sqrt(Math.max(((a - c)/2)**2 + b*b, 0.0001));
  const l1 = mid + disc;
  const l2 = mid - disc;
  const r1 = 2*Math.sqrt(2*Math.max(l1, 0));
  const r2 = 2*Math.sqrt(2*Math.max(l2, 0));
  console.log(`${label.padEnd(32)}| ${a.toFixed(6).padStart(12)} | ${b.toFixed(6).padStart(12)} | ${c.toFixed(6).padStart(12)} | ${l1.toFixed(6).padStart(11)} | ${l2.toFixed(6).padStart(11)} | ${r1.toFixed(4).padStart(12)} | ${r2.toFixed(4).padStart(12)}`);
}

row("Ours (tz=-viewZ, foc positive)", a_ours, b_ours, c_ours);
row("AM15 (focal_y neg)", a_am, b_am, c_am);
row("AM15 (focal_y pos)", a_am2, b_am2, c_am2);

console.log();

// ============================================================================
// 9. KEY INSIGHT: What matters is J^T * J structure (signs cancel in quadratic form)
// ============================================================================

console.log("=".repeat(80));
console.log("ANALYSIS: Do the Jacobian sign differences matter?");
console.log("=".repeat(80));
console.log();

// The 2D covariance is: cov2d = T^T * Sigma * T  where T = W^T * J
// If J_ours vs J_am differ only by sign flips on diagonal elements,
// then T_ours and T_am differ by those same sign flips on columns.
// Since cov2d = T^T * Sigma * T, sign flips on T columns get squared away,
// BUT the off-diagonal terms involve products of DIFFERENT columns,
// so sign flips may or may not cancel depending on WHICH elements are flipped.

console.log("Element-by-element comparison of Jacobians:");
console.log();
console.log("Element     | J_ours      | J_am (fy<0)  | J_am2 (fy>0) | J_ours/J_am  | J_ours/J_am2");
console.log("-".repeat(95));

function jcomp(label, ours, am, am2) {
  const ratio1 = am !== 0 ? (ours/am).toFixed(6) : "N/A";
  const ratio2 = am2 !== 0 ? (ours/am2).toFixed(6) : "N/A";
  console.log(`${label.padEnd(12)}| ${ours.toFixed(6).padStart(11)} | ${am.toFixed(6).padStart(12)} | ${am2.toFixed(6).padStart(13)} | ${ratio1.toString().padStart(12)} | ${ratio2.toString().padStart(12)}`);
}

jcomp("J[0][0]", J_ours[0][0], J_am[0][0], J_am2[0][0]);
jcomp("J[0][2]", J_ours[0][2], J_am[0][2], J_am2[0][2]);
jcomp("J[1][1]", J_ours[1][1], J_am[1][1], J_am2[1][1]);
jcomp("J[1][2]", J_ours[1][2], J_am[1][2], J_am2[1][2]);
console.log();

// ============================================================================
// 10. ALSO: What about the 3D covariance convention?
//     Let's try with Sigma_B = R * S^2 * R^T and see if it changes anything
// ============================================================================

console.log("=".repeat(80));
console.log("EXTRA: What if we used Sigma_B = R*S^2*R^T instead?");
console.log("=".repeat(80));
console.log();

const SigmaB_T_ours = mat3Mul(Sigma_B, T_ours);
const cov2dB_ours = mat3Mul(mat3Transpose(T_ours), SigmaB_T_ours);
const aB = cov2dB_ours[0][0] + 0.3;
const bB = cov2dB_ours[0][1];
const cB = cov2dB_ours[1][1] + 0.3;

row("Sigma_B + our Jacobian", aB, bB, cB);
console.log();

const maxCov3DDiff = Math.max(
  Math.abs(Sigma_A[0][0] - Sigma_B[0][0]),
  Math.abs(Sigma_A[0][1] - Sigma_B[0][1]),
  Math.abs(Sigma_A[0][2] - Sigma_B[0][2]),
  Math.abs(Sigma_A[1][1] - Sigma_B[1][1]),
  Math.abs(Sigma_A[1][2] - Sigma_B[1][2]),
  Math.abs(Sigma_A[2][2] - Sigma_B[2][2]),
);
console.log(`Max |Sigma_A - Sigma_B| = ${maxCov3DDiff.toExponential(6)}`);
if (maxCov3DDiff < 1e-10) {
  console.log("=> Sigma_A and Sigma_B are IDENTICAL (quaternion is near-identity or special case)");
} else {
  console.log("=> Sigma_A and Sigma_B DIFFER (convention matters!)");
}
console.log();

// ============================================================================
// 11. ALGEBRA: Verify the relationship between our formulation and textbook EWA
// ============================================================================

console.log("=".repeat(80));
console.log("ALGEBRA: Comparing T^T*Sigma*T vs textbook EWA J*W*Sigma*W^T*J^T");
console.log("=".repeat(80));
console.log();

// BACKGROUND ON GLSL mat3 AND COLUMN-MAJOR STORAGE:
//
// In GLSL, mat3(a,b,c, d,e,f, g,h,i) stores:
//   column 0 = (a,b,c), column 1 = (d,e,f), column 2 = (g,h,i)
//
// So the math matrix M[row][col] = M_glsl[col][row].
//
// antimatter15's J in GLSL:
//   mat3 J = mat3(
//     focal.x / cam.z, 0., -(focal.x * cam.x) / (cam.z * cam.z),   <- col 0
//     0., -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),    <- col 1
//     0., 0., 0.                                                      <- col 2
//   );
//
// In math convention: J_am[row][col]:
//   Row 0: (fx/cz,       0,        0)
//   Row 1: (0,           -fy/cz,    0)
//   Row 2: (-fx*cx/cz2,  fy*cy/cz2, 0)
//
// This is J^T of the standard 2D Jacobian! Column 2 is zero, not row 2.
// The standard Jacobian J_std has ROW 2 = 0 (since it maps 3D -> 2D).
// antimatter15's GLSL J = J_std^T in math convention.
//
// Their W: W_am = transpose(mat3(view)) = W^T in math convention
// (where W = upper 3x3 of view matrix = world-to-camera rotation)
//
// Their T: T_am = W_am * J_am = W^T * J_std^T  (in math convention)
// Their cov: T_am^T * Vrk * T_am = (W^T * J_std^T)^T * Vrk * (W^T * J_std^T)
//          = J_std * W * Vrk * W^T * J_std^T
//          = J_std * Sigma_view * J_std^T    (where Sigma_view = W * Vrk * W^T)
//
// This IS the correct textbook EWA formula!

console.log("Reconstructing antimatter15's computation with correct GLSL column-major reading:");
console.log();

// J in math convention from GLSL column-major (= J_std^T where J_std is the 2D Jacobian)
const J_am_math = [
  [FOCAL_X / cam_z,                    0,                        0],
  [0,                                  -FOCAL_Y / cam_z,         0],
  [-(FOCAL_X * cam_x) / cam_z2,       (FOCAL_Y * cam_y) / cam_z2,  0],
];
printMat3("J_am in math convention (= J_std^T, col 2 = 0)", J_am_math);
console.log();

// W_am = W^T
const W_am = mat3Transpose(W);

// T_am = W^T * J_std^T
const T_am_math = mat3Mul(W_am, J_am_math);

// cov_am = T_am^T * Sigma * T_am = J_std * W * Sigma * W^T * J_std^T
const cov_am_math = mat3Mul(mat3Transpose(T_am_math), mat3Mul(Sigma, T_am_math));
console.log("antimatter15 cov2d (GLSL column-major corrected):");
console.log(`  a: ${cov_am_math[0][0].toFixed(8)}`);
console.log(`  b: ${cov_am_math[0][1].toFixed(8)}`);
console.log(`  c: ${cov_am_math[1][1].toFixed(8)}`);
console.log();

// Now compute proper EWA for comparison:
// J_std (2D Jacobian, row 2 = 0) = J_am_math^T
const J_std_from_am = mat3Transpose(J_am_math);

const Sigma_view = mat3Mul(W, mat3Mul(Sigma, mat3Transpose(W)));
const cov_ewa = mat3Mul(J_std_from_am, mat3Mul(Sigma_view, mat3Transpose(J_std_from_am)));
console.log("Textbook EWA: J_std * W * Sigma * W^T * J_std^T:");
console.log(`  a: ${cov_ewa[0][0].toFixed(8)}`);
console.log(`  b: ${cov_ewa[0][1].toFixed(8)}`);
console.log(`  c: ${cov_ewa[1][1].toFixed(8)}`);
console.log();

console.log("Difference (antimatter15 corrected vs textbook EWA):");
console.log(`  |a_diff| = ${Math.abs(cov_am_math[0][0] - cov_ewa[0][0]).toExponential(4)}`);
console.log(`  |b_diff| = ${Math.abs(cov_am_math[0][1] - cov_ewa[0][1]).toExponential(4)}`);
console.log(`  |c_diff| = ${Math.abs(cov_am_math[1][1] - cov_ewa[1][1]).toExponential(4)}`);

if (Math.abs(cov_am_math[0][0] - cov_ewa[0][0]) < 1e-4) {
  console.log("  => MATCH! antimatter15's formulation IS the correct textbook EWA.");
} else {
  console.log("  => MISMATCH (unexpected).");
}
console.log();

// Now: our shader computes T = W^T * J_ours where J_ours has ROW 2 = 0
// Our cov = T^T * Sigma * T = J_ours^T * W * Sigma * W^T * J_ours
// Compare to EWA = J_std * W * Sigma * W^T * J_std^T
// Our J_ours differs from J_std in sign conventions (different focal/z handling)
// but the key structural difference is: we use J^T * M * J vs textbook J * M * J^T

console.log("Our shader: T = W^T * J_ours (J_ours has row 2 = 0)");
console.log("  cov = T^T * Sigma * T = J_ours^T * W * Sigma * W^T * J_ours");
console.log(`  a: ${cov2d_ours[0][0].toFixed(8)}`);
console.log(`  b: ${cov2d_ours[0][1].toFixed(8)}`);
console.log(`  c: ${cov2d_ours[1][1].toFixed(8)}`);
console.log();

// The issue: our shader passes J with ROW 2 = 0 into the same code structure
// that antimatter15 uses with J^T (COLUMN 2 = 0). This means:
// - antimatter15 (corrected): T = W^T * J^T, cov = J*W*Sigma*W^T*J^T (correct EWA)
// - Our shader:                T = W^T * J,   cov = J^T*W*Sigma*W^T*J (different!)
//
// J^T * M * J (3x3) vs J * M * J^T (3x3):
// When J has row 2 = 0: J*M*J^T has row/col 2 = 0, upper-left 2x2 is meaningful.
// When J has row 2 = 0: J^T*M*J has column 2 nonzero everywhere -- the upper-left 2x2
// includes contributions from the z-derivative terms of J^T.
//
// This is a genuine mathematical difference!

const cov_diff_a = Math.abs(cov2d_ours[0][0] - cov_ewa[0][0]);
const cov_diff_b = Math.abs(cov2d_ours[0][1] - cov_ewa[0][1]);
const cov_diff_c = Math.abs(cov2d_ours[1][1] - cov_ewa[1][1]);
console.log("Difference between our shader and textbook EWA:");
console.log(`  |a_diff| = ${cov_diff_a.toExponential(4)}`);
console.log(`  |b_diff| = ${cov_diff_b.toExponential(4)}`);
console.log(`  |c_diff| = ${cov_diff_c.toExponential(4)}`);
console.log();

if (cov_diff_a < 1e-4 && cov_diff_b < 1e-4 && cov_diff_c < 1e-4) {
  console.log("=> Our shader matches textbook EWA exactly.");
} else {
  console.log("=> FINDING: Our shader gives DIFFERENT values than textbook EWA.");
  console.log("   Our shader computes J^T * (W * Sigma * W^T) * J, but the correct formula");
  console.log("   is J * (W * Sigma * W^T) * J^T. Because J has row 2 = 0 (not column 2 = 0),");
  console.log("   our T = W^T * J should be T = W^T * J^T to match the correct derivation.");
  console.log();
  console.log("   antimatter15 gets this right because GLSL mat3() stores in column-major,");
  console.log("   so their 'J' variable actually holds J^T in math convention.");
  console.log();

  // Let's verify: if we use J^T in our computation, do we match?
  const T_fixed = mat3Mul(mat3Transpose(W), mat3Transpose(J_ours));
  const cov_fixed = mat3Mul(mat3Transpose(T_fixed), mat3Mul(Sigma, T_fixed));
  console.log("   FIX: Using T = W^T * J_ours^T instead of T = W^T * J_ours:");
  console.log(`     a: ${cov_fixed[0][0].toFixed(8)}`);
  console.log(`     b: ${cov_fixed[0][1].toFixed(8)}`);
  console.log(`     c: ${cov_fixed[1][1].toFixed(8)}`);
  console.log(`     |a - EWA| = ${Math.abs(cov_fixed[0][0] - cov_ewa[0][0]).toExponential(4)}`);
  console.log(`     |b - EWA| = ${Math.abs(cov_fixed[0][1] - cov_ewa[0][1]).toExponential(4)}`);
  console.log(`     |c - EWA| = ${Math.abs(cov_fixed[1][1] - cov_ewa[1][1]).toExponential(4)}`);

  if (Math.abs(cov_fixed[0][0] - cov_ewa[0][0]) < 1e-4) {
    console.log("     => YES! Using J^T fixes the computation to match textbook EWA.");
    console.log();

    // Show eigenvalues for the fixed version
    const a_fix = cov_fixed[0][0] + 0.3;
    const b_fix = cov_fixed[0][1];
    const c_fix = cov_fixed[1][1] + 0.3;
    const mid_fix = (a_fix + c_fix) / 2;
    const disc_fix = Math.sqrt(Math.max(((a_fix - c_fix)/2)**2 + b_fix*b_fix, 0.0001));
    const l1_fix = mid_fix + disc_fix;
    const l2_fix = mid_fix - disc_fix;
    console.log("   EWA-correct eigenvalues (after +0.3):");
    console.log(`     lambda1 = ${l1_fix.toFixed(4)}, lambda2 = ${l2_fix.toFixed(4)}`);
    console.log(`     radii: ${(2*Math.sqrt(2*l1_fix)).toFixed(4)} x ${(2*Math.sqrt(2*Math.max(l2_fix,0))).toFixed(4)} pixels`);
    console.log();
    console.log("   vs our current shader:");
    console.log(`     lambda1 = ${lambda1_ours.toFixed(4)}, lambda2 = ${lambda2_ours.toFixed(4)}`);
    console.log(`     radii: ${(2*Math.sqrt(2*lambda1_ours)).toFixed(4)} x ${(2*Math.sqrt(2*Math.max(lambda2_ours,0))).toFixed(4)} pixels`);
    console.log();
    console.log("   The current shader produces different (generally smaller) splat sizes.");
    console.log("   To fix: in the shader, swap the T computation to use J^T instead of J.");
    console.log("   Concretely: change T[i][j] = sum_k W[k][i]*J[k][j] to T[i][j] = sum_k W[k][i]*J[j][k].");
  } else {
    console.log("     => NO. Something else is different.");
  }
}
console.log();

// ============================================================================
// 12. FINAL NUMERIC EQUIVALENCE CHECK
// ============================================================================

console.log("=".repeat(80));
console.log("FINAL EQUIVALENCE CHECK");
console.log("=".repeat(80));
console.log();

console.log("Question: Does sign convention in J affect the 2D covariance?");
console.log();

// If J_am = D * J_ours where D is a diagonal sign matrix,
// then T_am = W^T * J_am = W^T * D * J_ours
// cov2d_am = T_am^T * Sigma * T_am
//          = (W^T * D * J_ours)^T * Sigma * (W^T * D * J_ours)
//          = J_ours^T * D^T * W * Sigma * W^T * D * J_ours
//          = J_ours^T * D * W * Sigma * W^T * D * J_ours
//
// vs cov2d_ours = J_ours^T * W * Sigma * W^T * J_ours
//
// These are equal iff D commutes with (W * Sigma * W^T * J_ours), which
// generally it does NOT (D only commutes with diagonal matrices).
//
// HOWEVER: J is 3x3 with zeros in specific places. The effective J*W is 2x3.
// The sign flips are on the J diagonal, so they flip entire ROWS of J*W.
// In the quadratic form (J*W) * Sigma * (J*W)^T, flipping a row of (J*W)
// flips both the row and column of the result, so:
//   - Diagonal: sign flips squared = no change
//   - Off-diagonal [0][1]: sign of row 0 * sign of row 1

// Let's check: what sign relationship exists between J_ours and J_am2?
const s0 = Math.sign(J_ours[0][0]) * Math.sign(J_am2[0][0]); // +1 or -1
const s1 = Math.sign(J_ours[1][1]) * Math.sign(J_am2[1][1]); // +1 or -1
console.log(`Sign(J_ours[0][0]) * Sign(J_am2[0][0]) = ${s0}`);
console.log(`Sign(J_ours[1][1]) * Sign(J_am2[1][1]) = ${s1}`);
console.log();

if (s0 * s1 === 1) {
  console.log("=> Same sign product => cov2d off-diagonal (b) has SAME sign => methods are EQUIVALENT");
} else {
  console.log("=> Different sign product => cov2d off-diagonal (b) has OPPOSITE sign => methods DIFFER in b");
  console.log("   But eigenvalues only depend on b^2, so radii are still the same!");
}
console.log();

// Numeric verification
console.log("Numeric differences:");
console.log(`  |a_ours - a_am|  = ${Math.abs(a_ours - a_am).toExponential(4)}`);
console.log(`  |b_ours - b_am|  = ${Math.abs(b_ours - b_am).toExponential(4)}`);
console.log(`  |c_ours - c_am|  = ${Math.abs(c_ours - c_am).toExponential(4)}`);
console.log(`  |a_ours - a_am2| = ${Math.abs(a_ours - a_am2).toExponential(4)}`);
console.log(`  |b_ours - b_am2| = ${Math.abs(b_ours - b_am2).toExponential(4)}`);
console.log(`  |c_ours - c_am2| = ${Math.abs(c_ours - c_am2).toExponential(4)}`);
console.log();

const l1diff_am = Math.abs(lambda1_ours - lambda1_am);
const l2diff_am = Math.abs(lambda2_ours - lambda2_am);
const l1diff_am2 = Math.abs(lambda1_ours - lambda1_am2);
const l2diff_am2 = Math.abs(lambda2_ours - lambda2_am2);
console.log(`  |lambda1_ours - lambda1_am|  = ${l1diff_am.toExponential(4)}`);
console.log(`  |lambda2_ours - lambda2_am|  = ${l2diff_am.toExponential(4)}`);
console.log(`  |lambda1_ours - lambda1_am2| = ${l1diff_am2.toExponential(4)}`);
console.log(`  |lambda2_ours - lambda2_am2| = ${l2diff_am2.toExponential(4)}`);
console.log();

// ============================================================================
// 13. The CORRECT antimatter15 interpretation
// ============================================================================

console.log("=".repeat(80));
console.log("DEFINITIVE: Replicate antimatter15's exact computation");
console.log("=".repeat(80));
console.log();

// From antimatter15/splat GLSL vertex shader:
//   vec4 cam = transformMatrix * vec4(center, 1);
//   vec4 pos2d = projmatrix * cam;
//
//   float focal_y = projmatrix[1][1] * viewport.y / 2.0;
//   float focal_x = projmatrix[0][0] * viewport.x / 2.0;
//
// NOTE: In GLSL, mat4 is COLUMN-MAJOR. projmatrix[1][1] accesses column 1, row 1.
// For a standard OpenGL projection matrix:
//   proj[0][0] = 2n/(r-l)  (positive)
//   proj[1][1] = 2n/(t-b)  (positive)
//
// So focal_x = proj[0][0] * viewport.x / 2 = POSITIVE
//    focal_y = proj[1][1] * viewport.y / 2 = POSITIVE
//
// Wait, I previously said focal_y was negative. Let me re-check.
// The ORIGINAL antimatter15 code uses:
//   float focal_y = projmatrix[1][1] * viewport.y / 2.0;
// NOT the negative version. So focal_y IS positive.

console.log("Re-examining antimatter15 focal computation:");
console.log("  In their GLSL: focal_y = projmatrix[1][1] * viewport.y / 2.0");
console.log("  projmatrix[1][1] is positive (standard OpenGL projection)");
console.log("  So focal_y = POSITIVE");
console.log();

// For FOV=60, the projection matrix [1][1] = 1/tan(fov/2) = 1/tan(30) = 1.7321
const proj11 = 1.0 / Math.tan((FOV_DEG * Math.PI / 180) / 2);
const proj00 = proj11 * (VIEWPORT_H / VIEWPORT_W);  // adjust for aspect ratio
// Actually, Three.js: proj[0][0] = proj[1][1] / aspect
// aspect = W/H = 1920/1580
const aspect = VIEWPORT_W / VIEWPORT_H;
const proj00_three = proj11 / aspect;

console.log(`proj[1][1] = 1/tan(${FOV_DEG/2}) = ${proj11.toFixed(6)}`);
console.log(`proj[0][0] = proj[1][1] / aspect = ${proj11.toFixed(6)} / ${aspect.toFixed(6)} = ${proj00_three.toFixed(6)}`);
console.log(`focal_x_computed = proj[0][0] * ${VIEWPORT_W} / 2 = ${(proj00_three * VIEWPORT_W / 2).toFixed(4)}`);
console.log(`focal_y_computed = proj[1][1] * ${VIEWPORT_H} / 2 = ${(proj11 * VIEWPORT_H / 2).toFixed(4)}`);
console.log(`(Given FOCAL_X = FOCAL_Y = ${FOCAL_X} from debug output)`);
console.log();

// antimatter15's exact Jacobian with POSITIVE focals and cam.z NEGATIVE:
const focal_exact_x = FOCAL_X;
const focal_exact_y = FOCAL_Y;

const J_exact_am = [
  [focal_exact_x / cam_z,     0,                             -(focal_exact_x * cam_x) / cam_z2],
  [0,                          -focal_exact_y / cam_z,        (focal_exact_y * cam_y) / cam_z2],
  [0,                          0,                              0],
];

console.log("antimatter15's EXACT Jacobian (focal positive, cam.z negative):");
printMat3("J_exact_am", J_exact_am);
console.log();

console.log("Checking: is J_exact_am the same as J_am2? (both have positive focal_y)");
let jdiff = 0;
for (let i = 0; i < 3; i++)
  for (let j = 0; j < 3; j++)
    jdiff = Math.max(jdiff, Math.abs(J_exact_am[i][j] - J_am2[i][j]));
console.log(`Max |J_exact_am - J_am2| = ${jdiff.toExponential(4)}`);
console.log();

// Now compute their T and cov2d
// antimatter15 GLSL: mat3 T = W * J  where W = transpose(mat3(view))
// mat3(view) in GLSL extracts the upper-left 3x3 of the view matrix (column-major)
// transpose(mat3(view)) = transpose of upper-left 3x3
//
// In GLSL column-major: mat3(view) extracts columns 0,1,2 rows 0,1,2
// So mat3(view)[col][row] = view[col][row]
// As a math matrix (row,col): M[i][j] = view_column_j[i] = V[i][j] (same as our W)
// Then W_am = transpose(M) = W^T
//
// So their T = W_am * J = W^T * J  (SAME as our computeT_shader!)

console.log("Confirming: antimatter15's T = transpose(mat3(view)) * J = W^T * J");
const T_exact_am = computeT_shader(W, J_exact_am);  // W^T * J
printMat3("T_exact_am", T_exact_am);
console.log();

// Their cov2d = transpose(T) * Vrk * T
const SigmaT_exact = mat3Mul(Sigma, T_exact_am);
const cov2d_exact_am = mat3Mul(mat3Transpose(T_exact_am), SigmaT_exact);

const a_exact = cov2d_exact_am[0][0] + 0.3;
const b_exact = cov2d_exact_am[0][1];
const c_exact = cov2d_exact_am[1][1] + 0.3;

console.log("antimatter15 EXACT cov2d (after +0.3):");
console.log(`  a = ${a_exact.toFixed(8)}`);
console.log(`  b = ${b_exact.toFixed(8)}`);
console.log(`  c = ${c_exact.toFixed(8)}`);
console.log();

// ============================================================================
// FINAL TABLE
// ============================================================================

console.log("=".repeat(80));
console.log("FINAL COMPARISON TABLE");
console.log("=".repeat(80));
console.log();

console.log("Method                          |  a (cov_xx)  |  b (cov_xy)  |  c (cov_yy)  | lambda1     | lambda2     | radius_major | radius_minor");
console.log("-".repeat(155));
row("Ours (tz=-viewZ, +focal)", a_ours, b_ours, c_ours);
row("AM15 exact (+focal, cam.z<0)", a_exact, b_exact, c_exact);
console.log();

console.log("Differences (Ours vs AM15 exact):");
console.log(`  |a_diff| = ${Math.abs(a_ours - a_exact).toExponential(6)}`);
console.log(`  |b_diff| = ${Math.abs(b_ours - b_exact).toExponential(6)}`);
console.log(`  |c_diff| = ${Math.abs(c_ours - c_exact).toExponential(6)}`);

const mid_exact = (a_exact + c_exact) / 2;
const disc_exact = Math.sqrt(Math.max(((a_exact - c_exact)/2)**2 + b_exact**2, 0.0001));
const l1_exact = mid_exact + disc_exact;
const l2_exact = mid_exact - disc_exact;

console.log(`  |lambda1_diff| = ${Math.abs(lambda1_ours - l1_exact).toExponential(6)}`);
console.log(`  |lambda2_diff| = ${Math.abs(lambda2_ours - l2_exact).toExponential(6)}`);
console.log();

if (Math.abs(a_ours - a_exact) < 1e-6 && Math.abs(b_ours - b_exact) < 1e-6 && Math.abs(c_ours - c_exact) < 1e-6) {
  console.log("RESULT: The two methods produce IDENTICAL 2D covariances.");
} else if (Math.abs(a_ours - a_exact) < 1e-6 && Math.abs(c_ours - c_exact) < 1e-6 && Math.abs(Math.abs(b_ours) - Math.abs(b_exact)) < 1e-6) {
  console.log("RESULT: Diagonal elements match, off-diagonal differs in SIGN only.");
  console.log("        Eigenvalues (and thus splat shape/size) are IDENTICAL.");
  console.log("        The sign of b only affects the ORIENTATION of the ellipse axes.");
} else {
  console.log("RESULT: The methods produce DIFFERENT 2D covariances.");
  console.log("        This indicates a real difference in the projection math.");
}
console.log();
