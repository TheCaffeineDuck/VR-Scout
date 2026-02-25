/**
 * Local persistence fallback using localStorage/IndexedDB.
 * Used when Firebase is not configured.
 */

const PREFIX = 'vr-scout:'

export function localGet<T>(collection: string, id: string): T | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${collection}:${id}`)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function localSet<T>(collection: string, id: string, data: T): void {
  try {
    localStorage.setItem(`${PREFIX}${collection}:${id}`, JSON.stringify(data))
    // Also update the index for this collection
    const index = localListIds(collection)
    if (!index.includes(id)) {
      index.push(id)
      localStorage.setItem(`${PREFIX}${collection}:__index__`, JSON.stringify(index))
    }
  } catch (err) {
    console.warn(`[LocalPersistence] Failed to save ${collection}/${id}:`, err)
  }
}

export function localDelete(collection: string, id: string): void {
  try {
    localStorage.removeItem(`${PREFIX}${collection}:${id}`)
    const index = localListIds(collection)
    const filtered = index.filter((i) => i !== id)
    localStorage.setItem(`${PREFIX}${collection}:__index__`, JSON.stringify(filtered))
  } catch (err) {
    console.warn(`[LocalPersistence] Failed to delete ${collection}/${id}:`, err)
  }
}

export function localListIds(collection: string): string[] {
  try {
    const raw = localStorage.getItem(`${PREFIX}${collection}:__index__`)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function localList<T>(collection: string): T[] {
  const ids = localListIds(collection)
  const results: T[] = []
  for (const id of ids) {
    const item = localGet<T>(collection, id)
    if (item) results.push(item)
  }
  return results
}

export function localQuery<T>(
  collection: string,
  predicate: (item: T) => boolean
): T[] {
  return localList<T>(collection).filter(predicate)
}

export function localClear(collection: string): void {
  const ids = localListIds(collection)
  for (const id of ids) {
    localStorage.removeItem(`${PREFIX}${collection}:${id}`)
  }
  localStorage.removeItem(`${PREFIX}${collection}:__index__`)
}

/** Generate a unique ID (for documents without Firebase auto-ID) */
export function localId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
