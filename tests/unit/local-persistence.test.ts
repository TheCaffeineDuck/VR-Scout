import { describe, it, expect, beforeEach } from 'vitest'
import {
  localGet,
  localSet,
  localDelete,
  localList,
  localListIds,
  localQuery,
  localClear,
  localId,
} from '@/lib/local-persistence'

describe('local-persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('localSet / localGet', () => {
    it('stores and retrieves a value', () => {
      localSet('test', 'item1', { name: 'hello' })
      const result = localGet<{ name: string }>('test', 'item1')
      expect(result).toEqual({ name: 'hello' })
    })

    it('returns null for missing keys', () => {
      expect(localGet('test', 'missing')).toBeNull()
    })

    it('updates existing values', () => {
      localSet('test', 'item1', { v: 1 })
      localSet('test', 'item1', { v: 2 })
      expect(localGet<{ v: number }>('test', 'item1')?.v).toBe(2)
    })

    it('handles complex objects', () => {
      const data = { position: [1, 2, 3], tags: ['a', 'b'], nested: { x: true } }
      localSet('test', 'complex', data)
      expect(localGet('test', 'complex')).toEqual(data)
    })
  })

  describe('localDelete', () => {
    it('removes an item', () => {
      localSet('test', 'item1', { x: 1 })
      localDelete('test', 'item1')
      expect(localGet('test', 'item1')).toBeNull()
    })

    it('removes from index', () => {
      localSet('test', 'a', { x: 1 })
      localSet('test', 'b', { x: 2 })
      localDelete('test', 'a')
      expect(localListIds('test')).toEqual(['b'])
    })
  })

  describe('localListIds / localList', () => {
    it('returns empty array for no items', () => {
      expect(localListIds('empty')).toEqual([])
      expect(localList('empty')).toEqual([])
    })

    it('lists all stored items', () => {
      localSet('col', 'a', { id: 'a' })
      localSet('col', 'b', { id: 'b' })
      localSet('col', 'c', { id: 'c' })
      expect(localListIds('col')).toEqual(['a', 'b', 'c'])
      expect(localList('col')).toHaveLength(3)
    })

    it('does not duplicate IDs on re-set', () => {
      localSet('col', 'a', { v: 1 })
      localSet('col', 'a', { v: 2 })
      expect(localListIds('col')).toEqual(['a'])
    })
  })

  describe('localQuery', () => {
    it('filters items by predicate', () => {
      localSet('items', '1', { status: 'active', name: 'A' })
      localSet('items', '2', { status: 'inactive', name: 'B' })
      localSet('items', '3', { status: 'active', name: 'C' })

      const active = localQuery<{ status: string; name: string }>(
        'items',
        (item) => item.status === 'active'
      )
      expect(active).toHaveLength(2)
      expect(active.map((a) => a.name)).toEqual(['A', 'C'])
    })
  })

  describe('localClear', () => {
    it('removes all items in a collection', () => {
      localSet('col', 'a', { x: 1 })
      localSet('col', 'b', { x: 2 })
      localClear('col')
      expect(localListIds('col')).toEqual([])
      expect(localGet('col', 'a')).toBeNull()
    })

    it('does not affect other collections', () => {
      localSet('col1', 'a', { x: 1 })
      localSet('col2', 'b', { x: 2 })
      localClear('col1')
      expect(localGet('col2', 'b')).toEqual({ x: 2 })
    })
  })

  describe('localId', () => {
    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => localId()))
      expect(ids.size).toBe(100)
    })

    it('generates string IDs', () => {
      expect(typeof localId()).toBe('string')
      expect(localId().length).toBeGreaterThan(5)
    })
  })
})
