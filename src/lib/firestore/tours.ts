import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { isFirebaseAvailable, db } from '@/lib/firebase'
import {
  localGet,
  localSet,
  localDelete,
  localList,
  localId,
} from '@/lib/local-persistence'
import type { VirtualTour, QCChecklist } from '@/types/scene'

const COLLECTION = 'virtual_tours'

// ---- Firestore <-> App type converters ----

function toFirestore(tour: VirtualTour): Record<string, unknown> {
  return {
    ...tour,
    createdAt: Timestamp.fromDate(tour.createdAt),
    updatedAt: Timestamp.fromDate(tour.updatedAt),
  }
}

function fromFirestore(id: string, data: Record<string, unknown>): VirtualTour {
  return {
    ...(data as Omit<VirtualTour, 'id' | 'createdAt' | 'updatedAt'>),
    id,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(data.createdAt as string),
    updatedAt:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : new Date(data.updatedAt as string),
  }
}

// ---- CRUD ----

export async function createTour(
  tour: Omit<VirtualTour, 'id' | 'createdAt' | 'updatedAt'>
): Promise<VirtualTour> {
  const now = new Date()
  const id = isFirebaseAvailable() && db ? doc(collection(db, COLLECTION)).id : localId()
  const full: VirtualTour = { ...tour, id, createdAt: now, updatedAt: now }

  if (isFirebaseAvailable() && db) {
    await setDoc(doc(db, COLLECTION, id), toFirestore(full))
  } else {
    localSet(COLLECTION, id, full)
  }
  return full
}

export async function getTour(id: string): Promise<VirtualTour | null> {
  if (isFirebaseAvailable() && db) {
    const snap = await getDoc(doc(db, COLLECTION, id))
    if (!snap.exists()) return null
    return fromFirestore(snap.id, snap.data() as Record<string, unknown>)
  }
  return localGet<VirtualTour>(COLLECTION, id)
}

export async function updateTour(
  id: string,
  updates: Partial<Omit<VirtualTour, 'id' | 'createdAt'>>
): Promise<void> {
  const now = new Date()
  if (isFirebaseAvailable() && db) {
    await updateDoc(doc(db, COLLECTION, id), {
      ...updates,
      updatedAt: Timestamp.fromDate(now),
    })
  } else {
    const existing = localGet<VirtualTour>(COLLECTION, id)
    if (existing) {
      localSet(COLLECTION, id, { ...existing, ...updates, updatedAt: now })
    }
  }
}

export async function deleteTour(id: string): Promise<void> {
  if (isFirebaseAvailable() && db) {
    await deleteDoc(doc(db, COLLECTION, id))
  } else {
    localDelete(COLLECTION, id)
  }
}

export async function listTours(): Promise<VirtualTour[]> {
  if (isFirebaseAvailable() && db) {
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    return snap.docs.map((d) =>
      fromFirestore(d.id, d.data() as Record<string, unknown>)
    )
  }
  return localList<VirtualTour>(COLLECTION).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

// ---- QC ----

export async function updateQCChecklist(
  tourId: string,
  checklist: Partial<QCChecklist>
): Promise<void> {
  if (isFirebaseAvailable() && db) {
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(checklist)) {
      updates[`qcChecklist.${key}`] = value
    }
    updates.updatedAt = Timestamp.fromDate(new Date())
    await updateDoc(doc(db, COLLECTION, tourId), updates)
  } else {
    const existing = localGet<VirtualTour>(COLLECTION, tourId)
    if (existing) {
      localSet(COLLECTION, tourId, {
        ...existing,
        qcChecklist: { ...existing.qcChecklist, ...checklist },
        updatedAt: new Date(),
      })
    }
  }
}

function isQCComplete(checklist: QCChecklist): boolean {
  return (
    checklist.noArtifacts &&
    checklist.fullCoverage &&
    checklist.accurateLighting &&
    checklist.calibratedScale &&
    checklist.fileSizeOk &&
    checklist.lodGenerated &&
    checklist.viewpointsMarked &&
    checklist.annotationsAdded
  )
}

export async function publishTour(tourId: string): Promise<{ success: boolean; error?: string }> {
  const tour = await getTour(tourId)
  if (!tour) return { success: false, error: 'Tour not found' }
  if (!isQCComplete(tour.qcChecklist)) {
    return { success: false, error: 'QC checklist incomplete' }
  }
  await updateTour(tourId, { status: 'published' })
  return { success: true }
}
