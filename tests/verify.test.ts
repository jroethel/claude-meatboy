import { describe, expect, test } from 'claude-code/testing'

import { type Input, clearMs, load, step, unpack } from '../hooks/game'
import { LEVELS } from '../hooks/levels'
import { SOLUTIONS } from './solutions'
import { verify } from '../hooks/verify'

// Plays each level as a person would: 1-1 dies on its first saw before the winning attempt.
function play(dies = true): { ms: number; levels: number[][] } {
  let ms = 0
  const levels = LEVELS.map((_, n) => {
    const g = load(n)
    if (n === 0 && dies) {
      step(g, { right: true })
      step(g, { stop: true })
      step(g, { right: true })
      while (g.phase !== 'dead') step(g)
      // Held through the respawn, which a replay from a fresh level must not depend on.
      step(g, { jump: true })
      while (g.phase === 'dead') step(g)
    }
    const script = new Map(SOLUTIONS[n])
    for (let f = 0; g.phase === 'play'; f++) {
      const action = script.get(f)
      step(g, action ? ({ [action]: true } as Input) : {})
    }
    ms += clearMs(g)
    return g.keys
  })
  return { ms, levels }
}

describe('verify', () => {
  test('accepts a played run, deaths and all, at its own time', () => {
    const { ms, levels } = play()
    expect(ms).toBeGreaterThan(10_000)
    // Only the winning attempt's inputs are kept.
    expect(levels).toEqual(play(false).levels)
    expect(verify({ handle: 'JQX', ms, deaths: 1, levels })).toEqual({ run: { handle: 'JQX', ms, deaths: 1, levels } })
  })

  test('rejects an edited time', () => {
    const { ms, levels } = play()
    expect(verify({ handle: 'JQX', ms: ms - 100, deaths: 1, levels })).toEqual({ error: expect.stringContaining(`replays to ${ms} ms`) })
  })

  test('rejects edited inputs', () => {
    const { ms, levels } = play()
    const dropped = levels.map((keys, n) => (n === 2 ? keys.slice(0, 2) : keys))
    expect(verify({ handle: 'JQX', ms, deaths: 1, levels: dropped })).toEqual({ error: expect.stringMatching(/^1-3 /) })
  })

  test('rejects malformed runs', () => {
    const { ms, levels } = play()
    expect(verify({ handle: 'j-q', ms, deaths: 0, levels })).toHaveProperty('error')
    expect(verify({ handle: 'a234567890123456', ms, deaths: 0, levels })).toHaveProperty('error')
    expect(verify({ handle: 'JQX', ms, deaths: -1, levels })).toHaveProperty('error')
    expect(verify({ handle: 'JQX', ms, deaths: 0, levels: levels.slice(1) })).toHaveProperty('error')
    expect(verify({ handle: 'JQX', ms, deaths: 0, levels: [[0.5, 2], ...levels.slice(1)] })).toHaveProperty('error')
    expect(verify(null)).toHaveProperty('error')
    expect(verify('x')).toHaveProperty('error')
  })

  test('refuses a level left to run out the clock', () => {
    const { ms, levels } = play()
    expect(verify({ handle: 'JQX', ms, deaths: 0, levels: [[], ...levels.slice(1)] })).toEqual({ error: expect.stringMatching(/^1-1 /) })
  })

  test('an attempt replayed from its recorded inputs retraces its path, for every input', () => {
    let seed = 7
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    let seen = 0
    for (let n = 0; n < LEVELS.length; n++) {
      const g = load(n)
      for (let f = 0; f < 90 && g.phase === 'play'; f++) step(g, rand() < 0.3 ? unpack(1 << Math.floor(rand() * 6)) : {})
      const again = load(n)
      const at = new Map<number, number>()
      for (let i = 0; i < g.keys.length; i += 2) at.set(g.keys[i] ?? 0, g.keys[i + 1] ?? 0)
      for (let f = 0; f < g.current.length / 2; f++) step(again, unpack(at.get(f) ?? 0))
      g.keys.forEach((k, i) => (seen |= i % 2 === 1 ? k : 0))
      expect(again.current).toEqual(g.current)
    }
    expect(seen).toBe(0b111111)
  })
})
