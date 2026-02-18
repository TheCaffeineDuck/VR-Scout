import * as THREE from 'three/webgpu'

export function createSplatGeometry(count: number): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry()

  // Unit quad: 4 vertices from [-1,-1] to [1,1], z=0
  const quadVerts = new Float32Array([
    -1, -1, 0,
     1, -1, 0,
     1,  1, 0,
    -1,  1, 0,
  ])
  geo.setAttribute('position', new THREE.Float32BufferAttribute(quadVerts, 3))

  // Two triangles
  geo.setIndex([0, 1, 2, 0, 2, 3])

  // Instance count = number of splats
  geo.instanceCount = count

  // Set a large bounding sphere so frustum culling doesn't clip us
  // (we handle culling in the vertex shader)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Infinity)

  return geo
}
