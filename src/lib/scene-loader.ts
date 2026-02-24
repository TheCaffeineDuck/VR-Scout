import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import * as THREE from 'three'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')

const ktx2Loader = new KTX2Loader()
ktx2Loader.setTranscoderPath('/basis/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)
gltfLoader.setKTX2Loader(ktx2Loader)

export async function loadScene(
  url: string,
  onProgress?: (progress: number) => void,
): Promise<THREE.Group> {
  const gltf = await gltfLoader.loadAsync(url, (event) => {
    if (onProgress && event.lengthComputable) {
      onProgress(event.loaded / event.total)
    }
  })
  return gltf.scene
}

export function disposeScene(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
}
