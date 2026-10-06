// The game itself: pure, deterministic, no drawing. One `step` is one frame at 30 fps.
// Units are tiles and seconds; y grows downward. A tile is drawn two columns wide.

import { LEVELS } from './levels'

export const DT = 1 / 30
const SUB = 4
const G = 55
const JUMP = 19.5
// Gravity is this many times stronger while rising with the jump let go: a tap is a short hop.
const RISE_CUT = 2.5
const RUN = 9
// Running without a stop, turn or bump builds speed from RUN to RUN_MAX over RAMP seconds.
const RUN_MAX = 12
const RAMP = 1
const WALL_VX = 9.5
const WALL_VY = 17
const SLIDE = 3.5
const TERMINAL = 24
const ACCEL_GROUND = 240
const ACCEL_AIR = 160
const COYOTE = 0.08
const BUFFER = 0.12
const CRUMBLE_DELAY = 0.35
const SAW_SPEED = 5
// A belt carries what stands on it at this speed; running against it, you make RUN - BELT.
const BELT = 5
const PLATFORM_SPEED = 4
// A guillotine's cycle in frames: hanging up, dropping, down on the floor, rising. It is down most of the time.
export const BLADE_UP = 16
const BLADE_DROP = 3
const BLADE_DOWN = 36
const BLADE_RISE = 5
export const BLADE_CYCLE = BLADE_UP + BLADE_DROP + BLADE_DOWN + BLADE_RISE
// How far a raised blade hangs below its ceiling.
const BLADE_HANG = 0.4
export const SAW_R = 0.5
export const PW = 0.8
export const PH = 0.9
const DEAD_TIME = 0.6
const MAX_PARTICLES = 220
const MAX_ATTEMPTS = 120
// After a clear on every level but the last, Dr. Fetus takes Bandage Girl: frames of the scene, and the one he grabs her on.
export const KIDNAP_FRAMES = 66
export const GRAB_FRAME = 26

export const EMPTY = 0
export const SOLID = 1
export const CRUMBLE = 2
export const BELT_LEFT = 3
export const BELT_RIGHT = 4

// `jump` is a held jump (Space, or the mouse until `release`); `hop` is a jump let go at once.
export type Input = { left?: boolean; right?: boolean; jump?: boolean; hop?: boolean; release?: boolean; stop?: boolean }
// An input packed into bits, in this order, so an attempt's inputs can be sent and replayed.
export const INPUT_BITS = ['left', 'right', 'jump', 'hop', 'release', 'stop'] as const
export const pack = (input: Input): number => INPUT_BITS.reduce((m, k, b) => (input[k] === true ? m | (1 << b) : m), 0)
export const unpack = (mask: number): Input => Object.fromEntries(INPUT_BITS.filter((_, b) => mask & (1 << b)).map(k => [k, true]))
export type GameEvent = 'jump' | 'walljump' | 'death' | 'clear' | 'kidnap'
export type Phase = 'play' | 'dead' | 'kidnap' | 'replay'
export type Saw = { x0: number; y0: number; vx0: number; vy0: number; x: number; y: number; vx: number; vy: number; bloody: boolean }
// A blade hangs in column `x` from row `top`, drops to the floor at `floor`, and runs `phase` frames ahead of the level clock.
export type Blade = { x: number; top: number; floor: number; phase: number }
// A platform `w` tiles wide that you can jump up through and stand on, riding to and fro along its track:
// its x (or y, for a lift) runs from `lo` to `hi`.
export type Platform = { lift: boolean; w: number; lo: number; hi: number; x0: number; y0: number; v0: number; x: number; y: number; v: number }
export type Particle = { x: number; y: number; vx: number; vy: number; stuck: boolean }
// One attempt: x and y per frame, in hundredths of a tile, and whether it ended on a saw.
export type Attempt = { path: number[]; died: boolean }

export type Game = {
  level: number
  w: number
  h: number
  tiles: Uint8Array
  crumbleT: Float32Array
  // The tiles whose crumble timer is running, so a frame visits only them.
  crumbling: number[]
  broken: Uint8Array
  smear: Uint8Array
  saws: Saw[]
  blades: Blade[]
  platforms: Platform[]
  // The platform Meat Boy stands on, or -1.
  ride: number
  // Frames since the attempt began, which times the blades.
  beat: number
  start: { x: number; y: number }
  goal: { x: number; y: number }
  px: number
  py: number
  vx: number
  vy: number
  facing: 1 | -1
  running: boolean
  runT: number
  held: boolean
  onGround: boolean
  wall: -1 | 0 | 1
  coyote: number
  buffer: number
  phase: Phase
  deadT: number
  particles: Particle[]
  deaths: number
  attempts: Attempt[]
  current: number[]
  // The inputs of the attempt under way, or of the winning one once cleared: frame and packed input, pairwise.
  keys: number[]
  replayT: number
  kidnapT: number
  time: number
  seed: number
}

export function load(level: number): Game {
  const def = LEVELS[level]
  if (def === undefined) throw new Error(`no level ${level}`)
  const h = def.rows.length
  const w = def.rows[0]?.length ?? 0
  const tiles = new Uint8Array(w * h)
  const saws: Saw[] = []
  const blades: Blade[] = []
  const platforms: Platform[] = []
  let start = { x: 1, y: 1 }
  let goal = { x: w - 2, y: 1 }
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${def.name}: row ${y} is ${row.length} wide, not ${w}`)
    for (let x = 0; x < w; x++) {
      const c = row[x]
      if (c === '#') tiles[y * w + x] = SOLID
      else if (c === '=') tiles[y * w + x] = CRUMBLE
      else if (c === '<') tiles[y * w + x] = BELT_LEFT
      else if (c === '>') tiles[y * w + x] = BELT_RIGHT
      else if (c !== undefined && c >= '0' && c <= '9') {
        let floor = y + 1
        while (floor < h && !'#=<>'.includes(def.rows[floor]?.[x] ?? '#')) floor++
        blades.push({ x, top: y, floor, phase: (Number(c) * BLADE_CYCLE) / 10 })
      } else if ((c === '~' || c === '^') && row[x - 1] !== c) {
        // A run of ~ slides along the - beside it; a run of ^ lifts along the : above and below its first tile.
        let width = 1
        while (row[x + width] === c) width++
        const lift = c === '^'
        const track = (dx: number, dy: number) => (lift ? def.rows[y + dy]?.[x] : row[x + dx]) === (lift ? ':' : '-')
        let lo = 0
        let hi = 0
        while (track(lo - 1, lo - 1)) lo--
        while (track(width + hi, hi + 1)) hi++
        const at = lift ? y : x
        const v0 = hi > 0 ? PLATFORM_SPEED : -PLATFORM_SPEED
        platforms.push({ lift, w: width, lo: at + lo, hi: at + hi, x0: x, y0: y, v0, x, y, v: v0 })
      }
      else if (c === 'P') start = { x: x + (1 - PW) / 2, y: y + (1 - PH) }
      else if (c === 'B') goal = { x, y }
      else if (c === 'S' || c === 'H' || c === 'V') {
        const vx = c === 'H' ? SAW_SPEED : 0
        const vy = c === 'V' ? SAW_SPEED : 0
        saws.push({ x0: x + 0.5, y0: y + 0.5, vx0: vx, vy0: vy, x: x + 0.5, y: y + 0.5, vx, vy, bloody: false })
      }
    }
  })
  const g: Game = {
    level,
    w,
    h,
    tiles,
    crumbleT: new Float32Array(w * h).fill(-1),
    crumbling: [],
    broken: new Uint8Array(w * h),
    smear: new Uint8Array(w * h),
    saws,
    blades,
    platforms,
    ride: -1,
    beat: 0,
    start,
    goal,
    px: start.x,
    py: start.y,
    vx: 0,
    vy: 0,
    facing: 1,
    running: false,
    runT: 0,
    held: false,
    onGround: false,
    wall: 0,
    coyote: 0,
    buffer: 0,
    phase: 'play',
    deadT: 0,
    particles: [],
    deaths: 0,
    attempts: [],
    current: [],
    keys: [],
    replayT: 0,
    kidnapT: 0,
    time: 0,
    seed: 1 + level * 7919,
  }
  probe(g)
  return g
}

export function isSolid(g: Game, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= g.w || ty < 0) return true
  if (ty >= g.h) return false
  const i = ty * g.w + tx
  const t = g.tiles[i]
  return t !== EMPTY && (t !== CRUMBLE || g.broken[i] === 0)
}

// The platform under the player's feet, or -1.
function platformUnder(g: Game): number {
  const feet = g.py + PH
  return g.platforms.findIndex(p => feet > p.y - 0.03 && feet < p.y + 0.03 && g.px < p.x + p.w && g.px + PW > p.x)
}

// The speed the belt under the player's middle carries them at.
function beltUnder(g: Game): number {
  const t = g.tiles[Math.floor(g.py + PH + 0.02) * g.w + Math.floor(g.px + PW / 2)]
  return t === BELT_RIGHT ? BELT : t === BELT_LEFT ? -BELT : 0
}

// How far down a blade reaches: its tip.
export function bladeTip(g: Game, b: Blade): number {
  const up = b.top + BLADE_HANG
  let f = (g.beat + b.phase) % BLADE_CYCLE
  if (f < BLADE_UP) return up
  f -= BLADE_UP
  if (f < BLADE_DROP) return up + ((b.floor - up) * (f + 1)) / BLADE_DROP
  f -= BLADE_DROP
  if (f < BLADE_DOWN) return b.floor
  f -= BLADE_DOWN
  return b.floor - ((b.floor - up) * (f + 1)) / BLADE_RISE
}

function touchesBlade(g: Game): boolean {
  return g.blades.some(b => g.px < b.x + 0.85 && g.px + PW > b.x + 0.15 && g.py < bladeTip(g, b) && g.py + PH > b.top)
}

function hitsSolid(g: Game, x: number, y: number): boolean {
  const e = 1e-6
  for (let ty = Math.floor(y); ty <= Math.floor(y + PH - e); ty++) {
    for (let tx = Math.floor(x); tx <= Math.floor(x + PW - e); tx++) {
      if (isSolid(g, tx, ty)) return true
    }
  }
  return false
}

// Ground and wall contact for the player's current box.
function probe(g: Game): void {
  const e = 1e-6
  const feet = Math.floor(g.py + PH + 0.02)
  let ground = false
  for (let tx = Math.floor(g.px); tx <= Math.floor(g.px + PW - e); tx++) {
    if (isSolid(g, tx, feet)) ground = true
  }
  g.ride = g.vy >= 0 ? platformUnder(g) : -1
  g.onGround = ground || g.ride >= 0
  const right = hitsSolid(g, g.px + 0.03, g.py)
  const left = hitsSolid(g, g.px - 0.03, g.py)
  g.wall = right ? 1 : left ? -1 : 0
}

function rand(g: Game): number {
  g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff
  return g.seed / 0x7fffffff
}

function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(target, v + delta) : Math.max(target, v - delta)
}

// Platforms ride their tracks, carrying whoever stands on one.
function movePlatforms(g: Game): void {
  g.platforms.forEach((p, n) => {
    const at = p.lift ? p.y : p.x
    const to = Math.max(p.lo, Math.min(p.hi, at + p.v * DT))
    if (to === p.lo || to === p.hi) p.v = to === p.lo ? Math.abs(p.v) : -Math.abs(p.v)
    if (p.lift) p.y = to
    else p.x = to
    if (g.phase !== 'play' || g.ride !== n) return
    const nx = p.lift ? g.px : g.px + to - at
    const ny = p.lift ? g.py + to - at : g.py
    if (!hitsSolid(g, nx, ny)) {
      g.px = nx
      g.py = ny
    }
    probe(g)
  })
}

function moveSaws(g: Game): void {
  for (const s of g.saws) {
    if (s.vx === 0 && s.vy === 0) continue
    const nx = s.x + s.vx * DT
    const ny = s.y + s.vy * DT
    const lead = SAW_R * 0.98
    const ex = Math.floor(nx + Math.sign(s.vx) * lead)
    const ey = Math.floor(ny + Math.sign(s.vy) * lead)
    const blocked = s.vx !== 0 ? isSolid(g, ex, Math.floor(ny)) : ey >= g.h || isSolid(g, Math.floor(nx), ey)
    if (blocked) {
      s.vx = -s.vx
      s.vy = -s.vy
    } else {
      s.x = nx
      s.y = ny
    }
  }
}

// The saw the player is touching, if any; it stays bloody for the rest of the level.
function touchesSaw(g: Game): Saw | undefined {
  return g.saws.find(s => {
    const cx = Math.max(g.px, Math.min(s.x, g.px + PW))
    const cy = Math.max(g.py, Math.min(s.y, g.py + PH))
    return (cx - s.x) ** 2 + (cy - s.y) ** 2 < (SAW_R * 0.8) ** 2
  })
}

function touchesGoal(g: Game): boolean {
  return g.px < g.goal.x + 1 && g.px + PW > g.goal.x && g.py < g.goal.y + 1 && g.py + PH > g.goal.y
}

function smearAt(g: Game, tx: number, ty: number, by: number): void {
  if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return
  const i = ty * g.w + tx
  if (g.tiles[i] === EMPTY) return
  g.smear[i] = Math.min(3, (g.smear[i] ?? 0) + by)
}

function moveParticles(g: Game): void {
  for (const p of g.particles) {
    if (p.stuck) continue
    p.vy = Math.min(TERMINAL, p.vy + G * DT)
    const nx = p.x + p.vx * DT
    const ny = p.y + p.vy * DT
    const tx = Math.floor(nx)
    const ty = Math.floor(ny)
    if (ty >= g.h + 2) {
      p.stuck = true
      continue
    }
    if (isSolid(g, tx, ty) && ty < g.h) {
      p.stuck = true
      smearAt(g, tx, ty, 1)
      continue
    }
    p.x = nx
    p.y = ny
  }
}

function die(g: Game, events: GameEvent[]): void {
  g.phase = 'dead'
  g.deadT = DEAD_TIME
  g.deaths += 1
  if (g.attempts.length < MAX_ATTEMPTS) g.attempts.push({ path: g.current, died: true })
  g.current = []
  g.keys = []
  const cx = g.px + PW / 2
  const cy = g.py + PH / 2
  for (let i = 0; i < 18; i++) {
    const a = rand(g) * Math.PI * 2
    const v = 4 + rand(g) * 10
    g.particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, stuck: false })
  }
  if (g.particles.length > MAX_PARTICLES) g.particles.splice(0, g.particles.length - MAX_PARTICLES)
  events.push('death')
}

function respawn(g: Game): void {
  g.px = g.start.x
  g.py = g.start.y
  g.vx = 0
  g.vy = 0
  g.facing = 1
  g.running = false
  g.runT = 0
  g.coyote = 0
  g.buffer = 0
  g.phase = 'play'
  g.crumbleT.fill(-1)
  g.crumbling = []
  g.broken.fill(0)
  for (const s of g.saws) {
    s.x = s.x0
    s.y = s.y0
    s.vx = s.vx0
    s.vy = s.vy0
  }
  for (const p of g.platforms) {
    p.x = p.x0
    p.y = p.y0
    p.v = p.v0
  }
  g.beat = 0
  probe(g)
}

export function step(g: Game, input: Input = {}): GameEvent[] {
  const events: GameEvent[] = []
  g.time += 1
  if (g.phase === 'replay') {
    g.replayT += 1
    return events
  }
  g.beat += 1
  moveSaws(g)
  movePlatforms(g)
  moveParticles(g)
  if (g.phase === 'kidnap') {
    g.kidnapT += 1
    if (g.kidnapT === GRAB_FRAME) events.push('kidnap')
    if (g.kidnapT >= KIDNAP_FRAMES) g.phase = 'replay'
    return events
  }
  if (g.phase === 'dead') {
    g.deadT -= DT
    if (g.deadT <= 0) respawn(g)
    return events
  }

  const packed = pack(input)
  if (packed !== 0) g.keys.push(g.current.length / 2, packed)
  if (input.left) {
    if (g.facing !== -1) g.runT = 0
    g.facing = -1
    g.running = true
  }
  if (input.right) {
    if (g.facing !== 1) g.runT = 0
    g.facing = 1
    g.running = true
  }
  if (input.stop) {
    g.running = false
    g.runT = 0
  }
  if (input.jump || input.hop) {
    g.buffer = BUFFER
    g.held = input.jump === true
  }
  if (input.release) g.held = false

  if (g.buffer > 0) {
    if (g.onGround || g.coyote > 0) {
      g.vy = -JUMP
      g.buffer = 0
      g.coyote = 0
      events.push('jump')
    } else if (g.wall !== 0) {
      g.vy = -WALL_VY
      g.vx = -g.wall * WALL_VX
      g.facing = g.wall === 1 ? -1 : 1
      g.running = true
      g.runT = 0
      g.buffer = 0
      events.push('walljump')
    }
  }

  const dt = DT / SUB
  const speed = RUN + (RUN_MAX - RUN) * Math.min(1, g.runT / RAMP)
  for (let i = 0; i < SUB; i++) {
    const target = (g.running ? g.facing * speed : 0) + (g.onGround ? beltUnder(g) : 0)
    g.vx = approach(g.vx, target, (g.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt)
    g.vy = Math.min(TERMINAL, g.vy + G * (g.vy < 0 && !g.held ? RISE_CUT : 1) * dt)
    const sliding = !g.onGround && g.wall !== 0 && g.wall === g.facing && g.running && g.vy > SLIDE
    if (sliding) g.vy = SLIDE

    const nx = g.px + g.vx * dt
    if (hitsSolid(g, nx, g.py)) {
      g.px = g.vx > 0 ? Math.floor(nx + PW) - PW - 1e-4 : Math.floor(nx) + 1 + 1e-4
      g.vx = 0
      g.runT = 0
    } else {
      g.px = nx
    }
    const ny = g.py + g.vy * dt
    // Falling onto a platform: the feet cross its top, or were just past it as a lift rose.
    const deck = g.vy >= 0 ? g.platforms.find(p => g.py + PH <= p.y + PLATFORM_SPEED * DT + 1e-3 && ny + PH >= p.y && g.px < p.x + p.w && g.px + PW > p.x) : undefined
    if (hitsSolid(g, g.px, ny)) {
      g.py = g.vy > 0 ? Math.floor(ny + PH) - PH - 1e-4 : Math.floor(ny) + 1 + 1e-4
      g.vy = 0
    } else if (deck !== undefined) {
      g.py = deck.y - PH - 1e-4
      g.vy = 0
    } else {
      g.py = ny
    }
    probe(g)
    const saw = touchesSaw(g)
    if (saw !== undefined || touchesBlade(g) || g.py > g.h + 1) {
      if (saw !== undefined) saw.bloody = true
      die(g, events)
      return events
    }
    if (touchesGoal(g)) {
      g.current.push(Math.round(g.px * 100), Math.round(g.py * 100))
      g.attempts.push({ path: g.current, died: false })
      g.current = []
      g.phase = g.level + 1 < LEVELS.length ? 'kidnap' : 'replay'
      g.kidnapT = 0
      g.replayT = 0
      events.push('clear')
      return events
    }
  }

  g.runT = g.running ? g.runT + DT : 0
  g.buffer = Math.max(0, g.buffer - DT)
  g.coyote = g.onGround ? COYOTE : Math.max(0, g.coyote - DT)

  if (g.onGround) {
    const feet = Math.floor(g.py + PH + 0.02)
    for (let tx = Math.floor(g.px); tx <= Math.floor(g.px + PW - 1e-6); tx++) {
      const i = feet * g.w + tx
      if (g.tiles[i] === CRUMBLE && (g.crumbleT[i] ?? -1) < 0) {
        g.crumbleT[i] = 0
        g.crumbling.push(i)
      }
      if (g.vx !== 0 && g.time % 3 === 0) smearAt(g, tx, feet, 1)
    }
  }
  if (g.wall !== 0 && !g.onGround) smearAt(g, g.wall === 1 ? Math.floor(g.px + PW + 0.03) : Math.floor(g.px - 0.03), Math.floor(g.py + PH / 2), 1)
  g.crumbling = g.crumbling.filter(i => {
    const t = (g.crumbleT[i] ?? 0) + DT
    g.crumbleT[i] = t
    if (t >= CRUMBLE_DELAY) g.broken[i] = 1
    return t < CRUMBLE_DELAY
  })

  g.current.push(Math.round(g.px * 100), Math.round(g.py * 100))
  return events
}

// Time of the attempt that reached Bandage Girl, in milliseconds.
export function clearMs(g: Game): number {
  const won = g.attempts[g.attempts.length - 1]
  return won === undefined || won.died ? 0 : Math.round((won.path.length / 2) * DT * 1000)
}

export function grade(ms: number, par: number): string {
  return ms <= par ? 'A+' : ms <= par * 1.4 ? 'A' : ms <= par * 2 ? 'B' : 'C'
}
