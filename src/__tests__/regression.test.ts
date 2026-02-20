import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { parseSplat } from '../formats/parseSplat'
import { parsePly } from '../formats/parsePly'
import { parseSpz } from '../formats/parseSpz'

const SPLATS_DIR = './public/splats'

const testFile = (name: string) => {
  const path = `${SPLATS_DIR}/${name}`
  return existsSync(path) ? path : null
}

describe('regression: real file parsing', () => {
  it.skipIf(!testFile('room.splat'))('room.splat parses without error', () => {
    const buf = readFileSync(testFile('room.splat')!).buffer
    const result = parseSplat(buf)
    expect(result.count).toBeGreaterThan(1_000_000)
    expect(result.count).toBeLessThan(2_000_000)
  })

  it.skipIf(!testFile('room.ply'))('room.ply parses without error', () => {
    const buf = readFileSync(testFile('room.ply')!).buffer
    const result = parsePly(buf)
    expect(result.count).toBeGreaterThan(500_000)
    expect(result.sh1).toBeDefined()
  })

  it.skipIf(!testFile('butterfly.spz'))('butterfly.spz parses without error', async () => {
    const buf = readFileSync(testFile('butterfly.spz')!).buffer
    const result = await parseSpz(buf)
    expect(result.count).toBeGreaterThan(100_000)
  })
})
