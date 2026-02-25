import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  type Firestore,
  connectFirestoreEmulator,
} from 'firebase/firestore'
import {
  getAuth,
  type Auth,
  connectAuthEmulator,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

function isConfigValid(config: typeof firebaseConfig): boolean {
  return Boolean(
    config.apiKey &&
      config.projectId &&
      !config.apiKey.includes('your-') &&
      !config.projectId.includes('your-')
  )
}

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
let _firebaseAvailable = false

if (isConfigValid(firebaseConfig)) {
  try {
    app = initializeApp(firebaseConfig)
    db = getFirestore(app)
    auth = getAuth(app)
    _firebaseAvailable = true

    // Connect to emulators in development if configured
    if (import.meta.env.VITE_FIREBASE_USE_EMULATORS === 'true') {
      connectFirestoreEmulator(db, 'localhost', 8080)
      connectAuthEmulator(auth, 'http://localhost:9099')
    }

    console.log('[Firebase] Initialized successfully')
  } catch (err) {
    console.warn('[Firebase] Initialization failed, using local fallback:', err)
    app = null
    db = null
    auth = null
    _firebaseAvailable = false
  }
} else {
  console.info(
    '[Firebase] No valid config found. Using local storage fallback. ' +
      'Set VITE_FIREBASE_* env vars to enable cloud persistence.'
  )
}

export function isFirebaseAvailable(): boolean {
  return _firebaseAvailable
}

export { app, db, auth }
