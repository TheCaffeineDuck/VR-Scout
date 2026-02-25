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
  arrayUnion,
  arrayRemove,
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
import type { VRSession, Participant } from '@/types/session'

const COLLECTION = 'vr_sessions'

function toFirestore(session: VRSession): Record<string, unknown> {
  return {
    ...session,
    createdAt: Timestamp.fromDate(session.createdAt),
    participants: session.participants.map((p) => ({
      ...p,
      joinedAt: Timestamp.fromDate(p.joinedAt),
    })),
  }
}

function fromFirestore(
  id: string,
  data: Record<string, unknown>
): VRSession {
  const raw = data as Record<string, unknown>
  const participants = (
    (raw.participants as Array<Record<string, unknown>>) || []
  ).map((p) => ({
    ...(p as unknown as Omit<Participant, 'joinedAt'>),
    joinedAt:
      p.joinedAt instanceof Timestamp
        ? p.joinedAt.toDate()
        : new Date(p.joinedAt as string),
  })) as Participant[]

  return {
    ...(raw as Omit<VRSession, 'id' | 'createdAt' | 'participants'>),
    id,
    participants,
    createdAt:
      raw.createdAt instanceof Timestamp
        ? raw.createdAt.toDate()
        : new Date(raw.createdAt as string),
  }
}

export async function createSession(
  session: Omit<VRSession, 'id' | 'createdAt'>
): Promise<VRSession> {
  const now = new Date()
  const id =
    isFirebaseAvailable() && db
      ? doc(collection(db, COLLECTION)).id
      : localId()
  const full: VRSession = { ...session, id, createdAt: now }

  if (isFirebaseAvailable() && db) {
    await setDoc(doc(db, COLLECTION, id), toFirestore(full))
  } else {
    localSet(COLLECTION, id, full)
  }
  return full
}

export async function getSession(id: string): Promise<VRSession | null> {
  if (isFirebaseAvailable() && db) {
    const snap = await getDoc(doc(db, COLLECTION, id))
    if (!snap.exists()) return null
    return fromFirestore(snap.id, snap.data() as Record<string, unknown>)
  }
  return localGet<VRSession>(COLLECTION, id)
}

export async function joinSession(
  sessionId: string,
  participant: Participant
): Promise<void> {
  if (isFirebaseAvailable() && db) {
    await updateDoc(doc(db, COLLECTION, sessionId), {
      participants: arrayUnion({
        ...participant,
        joinedAt: Timestamp.fromDate(participant.joinedAt),
      }),
    })
  } else {
    const session = localGet<VRSession>(COLLECTION, sessionId)
    if (session) {
      const already = session.participants.some(
        (p) => p.uid === participant.uid
      )
      if (!already) {
        session.participants.push(participant)
        localSet(COLLECTION, sessionId, session)
      }
    }
  }
}

export async function leaveSession(
  sessionId: string,
  participantUid: string
): Promise<void> {
  if (isFirebaseAvailable() && db) {
    // Need to read then update since arrayRemove needs exact match
    const session = await getSession(sessionId)
    if (!session) return
    const participant = session.participants.find(
      (p) => p.uid === participantUid
    )
    if (participant) {
      await updateDoc(doc(db, COLLECTION, sessionId), {
        participants: arrayRemove({
          ...participant,
          joinedAt: Timestamp.fromDate(participant.joinedAt),
        }),
      })
    }
    // Auto-end if host leaves or no participants left
    const remaining = session.participants.filter(
      (p) => p.uid !== participantUid
    )
    if (remaining.length === 0 || session.hostUid === participantUid) {
      await updateDoc(doc(db, COLLECTION, sessionId), { status: 'ended' })
    }
  } else {
    const session = localGet<VRSession>(COLLECTION, sessionId)
    if (session) {
      session.participants = session.participants.filter(
        (p) => p.uid !== participantUid
      )
      if (
        session.participants.length === 0 ||
        session.hostUid === participantUid
      ) {
        session.status = 'ended'
      }
      localSet(COLLECTION, sessionId, session)
    }
  }
}

export async function listActiveSessions(): Promise<VRSession[]> {
  if (isFirebaseAvailable() && db) {
    const q = query(
      collection(db, COLLECTION),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) =>
      fromFirestore(d.id, d.data() as Record<string, unknown>)
    )
  }
  return localQuery<VRSession>(COLLECTION, (s) => s.status === 'active').sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function endSession(sessionId: string): Promise<void> {
  if (isFirebaseAvailable() && db) {
    await updateDoc(doc(db, COLLECTION, sessionId), { status: 'ended' })
  } else {
    const session = localGet<VRSession>(COLLECTION, sessionId)
    if (session) {
      session.status = 'ended'
      localSet(COLLECTION, sessionId, session)
    }
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (isFirebaseAvailable() && db) {
    await deleteDoc(doc(db, COLLECTION, sessionId))
  } else {
    localDelete(COLLECTION, sessionId)
  }
}
