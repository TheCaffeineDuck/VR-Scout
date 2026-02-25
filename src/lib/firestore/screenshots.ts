import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { isFirebaseAvailable, db } from '@/lib/firebase'
import {
  localGet,
  localSet,
  localDelete,
  localQuery,
  localId,
} from '@/lib/local-persistence'

export interface ScreenshotRecord {
  id: string
  locationId: string
  virtualTourId: string
  /** Data URL (local) or remote URL (R2/Firebase Storage) */
  url: string
  lensMm: number
  cameraPosition: [number, number, number]
  cameraRotation: [number, number, number]
  gps: { lat: number; lng: number } | null
  filename: string
  tags: string[]
  capturedBy: string
  createdAt: Date
}

const COLLECTION = 'vr_screenshots'

function toFirestore(rec: ScreenshotRecord): Record<string, unknown> {
  return {
    ...rec,
    createdAt: Timestamp.fromDate(rec.createdAt),
  }
}

function fromFirestore(
  id: string,
  data: Record<string, unknown>
): ScreenshotRecord {
  return {
    ...(data as Omit<ScreenshotRecord, 'id' | 'createdAt'>),
    id,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(data.createdAt as string),
  }
}

export async function saveScreenshot(
  rec: Omit<ScreenshotRecord, 'id' | 'createdAt'>
): Promise<ScreenshotRecord> {
  const now = new Date()
  const id =
    isFirebaseAvailable() && db
      ? doc(collection(db, COLLECTION)).id
      : localId()
  const full: ScreenshotRecord = { ...rec, id, createdAt: now }

  if (isFirebaseAvailable() && db) {
    await setDoc(doc(db, COLLECTION, id), toFirestore(full))
  } else {
    localSet(COLLECTION, id, full)
  }
  return full
}

export async function getScreenshot(
  id: string
): Promise<ScreenshotRecord | null> {
  if (isFirebaseAvailable() && db) {
    const snap = await getDoc(doc(db, COLLECTION, id))
    if (!snap.exists()) return null
    return fromFirestore(snap.id, snap.data() as Record<string, unknown>)
  }
  return localGet<ScreenshotRecord>(COLLECTION, id)
}

export async function listScreenshots(
  virtualTourId: string
): Promise<ScreenshotRecord[]> {
  if (isFirebaseAvailable() && db) {
    const q = query(
      collection(db, COLLECTION),
      where('virtualTourId', '==', virtualTourId),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) =>
      fromFirestore(d.id, d.data() as Record<string, unknown>)
    )
  }
  return localQuery<ScreenshotRecord>(
    COLLECTION,
    (s) => s.virtualTourId === virtualTourId
  ).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function listAllScreenshots(): Promise<ScreenshotRecord[]> {
  if (isFirebaseAvailable() && db) {
    const q = query(
      collection(db, COLLECTION),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) =>
      fromFirestore(d.id, d.data() as Record<string, unknown>)
    )
  }
  return localQuery<ScreenshotRecord>(COLLECTION, () => true).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function deleteScreenshot(id: string): Promise<void> {
  if (isFirebaseAvailable() && db) {
    await deleteDoc(doc(db, COLLECTION, id))
  } else {
    localDelete(COLLECTION, id)
  }
}
