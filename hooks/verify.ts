// Replays a run sent to the world board on the game's own physics: the board trusts the replayed time, never the sent one.
// The Worker in scoreboard/ imports this file, so a change here or to the physics means redeploying it.

import { type Game, clearMs, load, step, unpack } from './game'
import { LEVELS } from './levels'

// ponytail: caps the six winning attempts at 270s in all (par is about 56s) to bound the replay's CPU; raise it if real runs hit it.
export const MAX_FRAMES = 8100

// `levels` holds each level's winning attempt as frame and packed input, pairwise.
export type Run = { handle: string; ms: number; deaths: number; levels: number[][] }

export function verify(body: unknown): { run: Run } | { error: string } {
  const r = (body ?? {}) as Partial<Run>
  // X's rule for a handle: up to 15 letters, digits or underscores.
  if (typeof r.handle !== 'string' || !/^\w{1,15}$/.test(r.handle)) return { error: 'a handle is 1 to 15 letters, digits or underscores' }
  if (!Number.isInteger(r.deaths) || (r.deaths as number) < 0) return { error: 'deaths is a count' }
  if (!Array.isArray(r.levels) || r.levels.length !== LEVELS.length) return { error: `a run has ${LEVELS.length} levels` }
  let ms = 0
  let frames = MAX_FRAMES
  for (const [n, keys] of r.levels.entries()) {
    const level = replay(n, keys, frames)
    if (typeof level === 'string') return { error: `1-${n + 1} ${level}` }
    ms += clearMs(level)
    frames -= level.time
  }
  if (ms !== r.ms) return { error: `the run replays to ${ms} ms, not ${r.ms}: the game and the board are on different versions` }
  return { run: { handle: r.handle, ms, deaths: r.deaths as number, levels: r.levels } }
}

// The level as cleared, or why it was not, within `frames` frames.
function replay(n: number, keys: unknown, frames: number): Game | string {
  if (!Array.isArray(keys) || keys.length % 2 !== 0 || keys.length > 2 * frames || !keys.every(k => Number.isInteger(k))) return 'is not frame and input pairs'
  const at = new Map<number, number>()
  for (let i = 0; i < keys.length; i += 2) at.set(keys[i], keys[i + 1])
  const g = load(n)
  for (let f = 0; f < frames; f++) {
    const events = step(g, unpack(at.get(f) ?? 0))
    if (events.includes('death')) return 'dies on replay'
    if (events.includes('clear')) return g
  }
  return `does not reach Bandage Girl within the run's ${MAX_FRAMES / 30}s limit`
}
