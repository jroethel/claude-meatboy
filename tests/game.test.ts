import { describe, expect, test } from 'claude-code/testing'

import { BLADE_CYCLE, BLADE_UP, KIDNAP_FRAMES, PH, PW, load, step, type Game, type GameEvent, type Input } from '../hooks/game'
import { LEVELS } from '../hooks/levels'
import { SOLUTIONS } from './solutions'

describe('chapter 1', () => {
  LEVELS.forEach((level, n) => {
    test(`1-${n + 1} ${level.name} can be beaten`, () => {
      const g = load(n)
      const script = new Map(SOLUTIONS[n])
      let cleared = false
      for (let f = 0; f < 600 && !cleared; f++) {
        const action = script.get(f)
        const events = step(g, action ? { [action]: true } : {})
        expect(events).not.toContain('death')
        cleared = events.includes('clear')
      }
      expect(cleared).toBe(true)
      expect(g.phase).toBe(n + 1 < LEVELS.length ? 'kidnap' : 'replay')
    })
  })

  test('running into the first saw kills, bloodies it and smears the ground', () => {
    const g = load(0)
    step(g, { right: true })
    const events: string[] = []
    for (let f = 0; f < 120 && !events.includes('death'); f++) events.push(...step(g))
    expect(events).toContain('death')
    expect(g.deaths).toBe(1)
    expect(g.attempts).toHaveLength(1)
    expect(g.smear.some(v => v > 0)).toBe(true)
    for (let f = 0; f < 30; f++) step(g)
    expect(g.phase).toBe('play')
    expect(g.px).toBe(g.start.x)
  })

  // Height of a jump from level 1's start, let go after `hold` frames (never, when left out).
  const height = (first: Input, hold = Infinity) => {
    const g = load(0)
    let top = g.py
    for (let f = 0; f < 40; f++) {
      step(g, f === 0 ? first : f === hold ? { release: true } : {})
      top = Math.min(top, g.py)
    }
    return g.start.y - top
  }

  test('a held jump goes higher than a hop, and holding longer climbs higher', () => {
    const full = height({ jump: true })
    const hop = height({ hop: true })
    const short = height({ jump: true }, 2)
    const long = height({ jump: true }, 6)
    expect(hop).toBeGreaterThan(1.05)
    expect(hop).toBeLessThan(short)
    expect(short).toBeLessThan(long)
    expect(long).toBeLessThan(full)
    expect(full).toBeGreaterThan(3.3)
  })

  test('running builds speed, and stopping starts it over', () => {
    const g = load(1)
    step(g, { right: true })
    for (let f = 0; f < 8; f++) step(g)
    const early = g.vx
    for (let f = 0; f < 24; f++) step(g)
    expect(early).toBeLessThan(10.5)
    expect(g.vx).toBeGreaterThan(11.9)
    step(g, { stop: true })
    step(g, { right: true })
    for (let f = 0; f < 8; f++) step(g)
    expect(g.vx).toBeLessThan(10.5)
  })

  test("1-6's belts carry you, its blades cut, and its platforms carry you", () => {
    const stand = (g: Game, x: number, feet: number) => {
      g.px = x
      g.py = feet - PH - 1e-4
    }
    // The middle floor's two belts carry you toward each other, at 5 tiles a second.
    for (const [x, by] of [[11, 1], [26, -1]] as const) {
      const belt = load(5)
      stand(belt, x, 17)
      step(belt)
      const x0 = belt.px
      for (let f = 0; f < 6; f++) step(belt)
      expect(Math.round((belt.px - x0) * 100) / 100).toBe(by)
    }
    // Standing under the blade over the start, which runs on the level's clock, on a floor that doesn't move: it drops once it has hung up.
    const blade = load(5)
    blade.tiles[24 * blade.w + 1] = 1
    stand(blade, 1.1, 24)
    let f = 0
    while (f < 120 && !step(blade).includes('death')) f++
    expect(f).toBeGreaterThanOrEqual(BLADE_UP)
    expect(f).toBeLessThan(BLADE_CYCLE)
    expect(blade.deaths).toBe(1)
    for (const lift of [false, true]) {
      const g = load(5)
      const p = g.platforms.find(k => k.lift === lift)
      if (p === undefined) throw new Error('no platform')
      stand(g, p.x + 0.5, p.y)
      step(g)
      const [x, y] = [g.px, g.py]
      for (let k = 0; k < 6; k++) step(g)
      expect(g.ride).toBe(g.platforms.indexOf(p))
      expect(Math.round((lift ? y - g.py : g.px - x) * 100) / 100).toBe(0.8)
    }
  })

  test("steel can't be clung to or kicked off, and ground can", () => {
    // Falling beside 1-5's climb: its outer wall is steel, the column across from it is ground.
    for (const [x, steel] of [[2 + 1e-4, true], [6 - PW - 1e-4, false]] as const) {
      const g = load(4)
      g.px = x
      g.py = 10
      g.vy = 8
      g.facing = steel ? -1 : 1
      g.running = true
      step(g)
      const events = step(g, { jump: true })
      expect(events.includes('walljump')).toBe(!steel)
      if (steel) expect(g.vy).toBeGreaterThan(8)
    }
  })

  test('Dr. Fetus takes Bandage Girl after a clear, once, before the replay', () => {
    const g = load(0)
    const script = new Map(SOLUTIONS[0])
    const events: GameEvent[] = []
    for (let f = 0; f < 600 && g.phase !== 'replay'; f++) {
      const action = script.get(f)
      events.push(...step(g, action ? { [action]: true } : {}))
      if (g.phase === 'kidnap') expect(g.kidnapT).toBeLessThan(KIDNAP_FRAMES)
    }
    expect(g.phase).toBe('replay')
    expect(events.filter(e => e === 'kidnap')).toHaveLength(1)
    expect(events.indexOf('clear')).toBeLessThan(events.indexOf('kidnap'))
  })
})
