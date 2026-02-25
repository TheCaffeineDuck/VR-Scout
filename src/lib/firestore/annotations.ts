import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { isFirebaseAvailable, db } from '@/lib/firebase'
import {
  localGet,
  localSet,
  localDelete,
  localQuery,
  localId,
} from '@/lib/local-persistence'
import type { Annotation } from '@/types/annotation'

const COLLECTION = 'vr_annotations'

function toFirestore(ann: Annotation): Record<string, unknown> {
  return {
    ...ann,
    createdAt: Timestamp.fromDate(ann.createdAt),
  }
}

function fromFirestore(id: string, data: Record<string, unknown>): Annotation {
  return {
    ...(data as Omit<Annotation, 'id' | 'createdAt'>),
    id,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(data.createdAt as string),
  }
}

export async function createAnnotation(
  ann: Omit<Annotation, 'id' | 'createdAt'>
): Promise<Annotation> {
  const now = new Date()
  const id =
    isFirebaseAvailable() && db
      ? doc(collection(db, COLLECTION)).id
      : localId()
  const full: Annotation = { ...ann, id, createdAt: now }

  if (isFirebaseAvailable() && db) {
    await setDoc(doc(db, COLLECTION, id), toFirestore(full))
  } else {
    localSet(COLLECTION, id, full)
  }
  return full
}

export async function getAnnotation(id: string): Promise<Annotation | null> {
  if (isFirebaseAvailable() && db) {
    const snap = await getDoc(doc(db, COLLECTION, id))
    if (!snap.exists()) return null
    return fromFirestore(snap.id, snap.data() as Record<string, unknown>)
  }
  return localGet<Annotation>(COLLECTION, id)
}

export async function updateAnnotation(
  id: string,
  updates: Partial<Omit<Annotation, 'id' | 'createdAt'>>
): Promise<void> {
  if (isFirebaseAvailable() && db) {
    await updateDoc(doc(db, COLLECTION, id), updates as Record<string, unknown>)
  } else {
    const existing = localGet<Annotation>(COLLECTION, id)
    if (existing) {
      localSet(COLLECTION, id, { ...existing, ...updates })
    }
  }
}

export async function deleteAnnotation(id: string): Promise<void> {
  if (isFirebaseAvailable() && db) {
    await deleteDoc(doc(db, COLLECTION, id))
  } else {
    localDelete(COLLECTION, id)
  }
}

export async function listAnnotationsByTour(
  virtualTourId: string
): Promise<Annotation[]> {
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
  return localQuery<Annotation>(
    COLLECTION,
    (a) => a.virtualTourId === virtualTourId
  ).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

/** Real-time listener for annotation changes (Firestore onSnapshot) */
export function onAnnotationsChange(
  virtualTourId: string,
  callback: (annotations: Annotation[]) => void
): Unsubscribe | (() => void) {
  if (isFirebaseAvailable() && db) {
    const q = query(
      collection(db, COLLECTION),
      where('virtualTourId', '==', virtualTourId),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, (snap) => {
      const annotations = snap.docs.map((d) =>
        fromFirestore(d.id, d.data() as Record<string, unknown>)
      )
      callback(annotations)
    })
  }
  // Local mode: initial load, no live updates
  listAnnotationsByTour(virtualTourId).then(callback)
  return () => {}
}
