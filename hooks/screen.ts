// The surface module: runs the game on the drawing thread at 30 fps, reads keys and clicks,
// paints each frame as rows of colored spans, and posts sounds and results to the hooks module.

import type { ClientElements, ClientKeyEvent, ClientModule, RenderElement } from 'claude-code'

import { DT, GRAB_FRAME, PH, PW, CRUMBLE, SOLID, clearMs, grade, load, step, type Game, type GameEvent, type Input } from './game'
import { LEVELS, MAP_ROWS, levelKey } from './levels'
import { ART, ART_ARM, ART_HAPPY, BANDAGE_ART, BANDAGE_HAPPY, BANDAGE_PALETTE, CLAUDE, FETUS, FETUS_PALETTE, PALETTE, step2 } from './sprite'

export type Best = Record<string, { ms: number; deaths: number }>
// Finished runs, fastest first: only a run played 1-1 to the end in order, outside practice.
// `handle` is an X handle without its @: up to 15 letters, digits or underscores.
export type Score = { handle: string; ms: number; deaths: number }
// A soundtrack, or none.
export type Track = 'A' | 'B' | 'off'
export type ScreenProps = { best: Best; board?: Score[]; music?: Track }
// `run` goes with a board score: each level's winning inputs, for the world board to replay.
export type Post = { sfx?: GameEvent | 'end'; result?: { level: number; ms: number; deaths: number }; score?: Score; run?: number[][]; music?: 'toggle' }

type Result = { ms: number; deaths: number; keys: number[] }
export type State = {
  g: Game
  pending: Input
  card: number
  results: Result[]
  isOver: boolean
  frame: number
  // The furthest level open: the first, and each one after a level with a best time.
  top: number
  // A run that left the level order (a level picked by number): its clears are not saved.
  practice: boolean
  // The handle typed so far once a board run ends; undefined when not typing.
  handle: string | undefined
  // The run this pane put on the board, to mark it there.
  entered: Score | undefined
  // Frames left of the hug that follows the last level; the results come after.
  ending: number
}

// The pane is as tall as the tallest level plus the HUD and the controls; a shorter pane scrolls the map
// up and down with Meat Boy, and a shorter level sits in the middle between dark bands.
export const PANE_ROWS = MAP_ROWS + 2
const MIN_ROWS = 8
const TITLE_FRAMES = 40
const SAW_FRAMES = ['◐◑', '◓◒', '◑◐', '◒◓']

const SKY_TOP = 0x1b1030
const SKY_LOW = 0xb4553a
const HILL = 0x3b1f38
const HILL_FAR = 0x5a2b3e
const DIRT = 0x5a3825
const DIRT_DARK = 0x4a2d1d
const GRASS = 0x6fbf3f
const MEAT = 0xd81e28
const BLOOD = 0x8e0d14
const CRUMBLE_BG = 0xa07b45
const CRUMBLE_FG = 0x6e5030
const BANDAGE = 0xff7aa8
const WHITE = 0xffffff
const INK = 0x140a14
const GOLD = 0xffd23f

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`
const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s
  return ch(16) | ch(8) | ch(0)
}

// A frame is a grid of cells; painting is writing into it, drawing is merging runs into spans.
export class Canvas {
  ch: string[]
  fg: number[]
  bg: number[]
  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.ch = new Array<string>(cols * rows).fill(' ')
    this.fg = new Array<number>(cols * rows).fill(WHITE)
    this.bg = new Array<number>(cols * rows).fill(0)
  }
  set(x: number, y: number, ch: string, fg: number, bg?: number) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return
    const i = y * this.cols + x
    this.ch[i] = ch
    this.fg[i] = fg
    if (bg !== undefined) this.bg[i] = bg
  }
  text(x: number, y: number, s: string, fg: number, bg: number) {
    ;[...s].forEach((c, k) => this.set(x + k, y, c, fg, bg))
  }
  center(y: number, s: string, fg: number, bg: number) {
    this.text(Math.max(0, Math.floor((this.cols - [...s].length) / 2)), y, s, fg, bg)
  }
}

function paintWorld(c: Canvas, s: State, camX: number): void {
  const { g } = s
  const t = s.frame
  for (let y = 0; y < c.rows; y++) {
    const sky = mix(SKY_TOP, SKY_LOW, y / (c.rows - 1))
    for (let x = 0; x < c.cols; x++) c.set(x, y, ' ', WHITE, sky)
  }
  // Two layers of hills drift slower than the ground.
  for (let x = 0; x < c.cols; x++) {
    const far = (camX * 2 + x) * 0.25
    const near = (camX * 2 + x) * 0.5
    const farTop = Math.round(c.rows - 7 - 2 * Math.sin(far * 0.11) - Math.sin(far * 0.29))
    const nearTop = Math.round(c.rows - 4 - 2 * Math.sin(near * 0.07 + 1) - Math.sin(near * 0.23))
    for (let y = Math.max(0, farTop); y < c.rows; y++) c.set(x, y, ' ', WHITE, HILL_FAR)
    if (farTop > 0) c.set(x, farTop - 1, '▄', HILL_FAR)
    for (let y = Math.max(0, nearTop); y < c.rows; y++) c.set(x, y, ' ', WHITE, HILL)
    if (nearTop > 0) c.set(x, nearTop - 1, '▄', HILL)
  }
  const tilesAcross = Math.ceil(c.cols / 2) + 1
  for (let ty = 0; ty < g.h; ty++) {
    for (let k = 0; k < tilesAcross; k++) {
      const tx = Math.floor(camX) + k
      if (tx >= g.w) break
      const i = ty * g.w + tx
      const tile = g.tiles[i]
      const sx = Math.round((tx - camX) * 2)
      const smear = (g.smear[i] ?? 0) / 3
      if (tile === SOLID) {
        const isTop = ty > 0 && g.tiles[i - g.w] === 0
        const bg = mix(DIRT, BLOOD, smear * 0.8)
        for (let d = 0; d < 2; d++) {
          if (isTop) c.set(sx + d, ty, '▀', mix(GRASS, MEAT, smear), bg)
          else c.set(sx + d, ty, ((tx * 7 + ty * 13 + d) % 9 === 0) ? '░' : ' ', DIRT_DARK, bg)
        }
      } else if (tile === CRUMBLE && g.broken[i] === 0) {
        const shaking = (g.crumbleT[i] ?? -1) >= 0
        const glyph = shaking && t % 2 === 0 ? '▓' : '▒'
        for (let d = 0; d < 2; d++) c.set(sx + d, ty, glyph, CRUMBLE_FG, mix(CRUMBLE_BG, BLOOD, smear * 0.7))
      }
    }
  }
}

function paintActors(c: Canvas, s: State, camX: number): void {
  const { g } = s
  const t = s.frame
  const col = (x: number) => Math.round((x - camX) * 2)
  const gx = col(g.goal.x)
  const fetus = g.phase === 'kidnap' ? fetusAt(g) : undefined
  // The jar stays inside the side walls, centered over Bandage Girl where it can be.
  const jar = FETUS[0]?.length ?? 0
  const jx = Math.max(2, Math.min(c.cols - jar - 2, gx - jar / 2 + 1)) + (fetus?.dx ?? 0)
  // Once grabbed, she hangs under the jar; where it came down over her, she stays put until it rises past her.
  const isTaken = fetus !== undefined && g.kidnapT >= GRAB_FRAME
  const bx = isTaken ? jx + jar / 2 - 1 : gx
  const by = isTaken ? Math.min(g.goal.y, fetus.top + FETUS.length / 2) : g.goal.y
  // Gone with him once the jar has left the screen.
  if (!isTaken || fetus.top + FETUS.length / 2 > 0) {
    c.set(bx, by, '•', INK, BANDAGE)
    c.set(bx + 1, by, '•', INK, BANDAGE)
  }
  if (fetus === undefined && t % 30 < 20) c.set(gx + 1, g.goal.y - 1, '♥', 0xff4d88)
  if (fetus !== undefined) paintArt(c, FETUS, FETUS_PALETTE, jx, fetus.top)
  for (const p of g.particles) c.set(col(p.x), Math.floor(p.y), p.stuck ? '▪' : '•', p.stuck ? BLOOD : MEAT)
  for (const saw of g.saws) {
    const glyphs = SAW_FRAMES[(t >> 1) % SAW_FRAMES.length] ?? '◐◑'
    const x = col(saw.x - 0.5)
    const y = Math.floor(saw.y)
    c.set(x, y, glyphs[0] ?? '◐', saw.bloody ? 0xff4040 : 0xe8e8e8)
    c.set(x + 1, y, glyphs[1] ?? '◑', saw.bloody ? 0xff4040 : 0xe8e8e8)
  }

  if (g.phase === 'play' || g.phase === 'kidnap') {
    const x = col(g.px + PW / 2 - 0.5)
    const y = Math.floor(g.py + PH / 2)
    // Clawd's black eye, on the side he faces.
    c.set(x, y, g.facing === 1 ? ' ' : '•', 0x000000, CLAUDE)
    c.set(x + 1, y, g.facing === 1 ? '•' : ' ', 0x000000, CLAUDE)
  }
  if (g.phase === 'replay') {
    // Every attempt at once, as the game shows it after a clear: the dead ones burst at their saw.
    g.attempts.forEach((a, n) => {
      const frames = a.path.length / 2
      const f = Math.min(g.replayT, frames - 1)
      const x = col((a.path[f * 2] ?? 0) / 100 + PW / 2 - 0.5)
      const y = Math.floor((a.path[f * 2 + 1] ?? 0) / 100 + PH / 2)
      if (a.died && g.replayT >= frames) {
        if (g.replayT < frames + 8) c.set(x, y, '✶', MEAT)
        return
      }
      const isWinner = !a.died
      const bg = isWinner ? CLAUDE : mix(0x4a2418, CLAUDE, n / Math.max(1, g.attempts.length))
      c.set(x, y, isWinner ? '•' : ' ', WHITE, bg)
      c.set(x + 1, y, '•', isWinner ? WHITE : 0xd08080, bg)
    })
  }
}

// Where Dr. Fetus is during the kidnap: he drops from above the screen to just over Bandage Girl,
// shakes as he grabs her, then rises out of sight with her.
function fetusAt(g: Game): { top: number; dx: number } {
  const t = g.kidnapT
  const from = -FETUS.length / 2 - 1
  const over = Math.max(0, g.goal.y - FETUS.length / 2)
  const hold = GRAB_FRAME + 8
  if (t < GRAB_FRAME) {
    const k = t / GRAB_FRAME
    return { top: Math.round(from + (over - from) * (1 - (1 - k) ** 2)), dx: 0 }
  }
  if (t < hold) return { top: over, dx: t % 4 < 2 ? 1 : -1 }
  return { top: Math.round(over - (t - hold) * 0.6), dx: 0 }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

function hud(c: Canvas, s: State, best: Best, track: Track): void {
  const { g } = s
  const def = LEVELS[g.level]
  const bar = 0x120812
  for (let x = 0; x < c.cols; x++) c.set(x, 0, ' ', WHITE, bar)
  const title = `1-${g.level + 1} ${def?.name.toUpperCase() ?? ''}`
  c.text(1, 0, title, GOLD, bar)
  const ms = Math.round((g.current.length / 2) * DT * 1000)
  const mine = best[levelKey(g.level)]
  // In practice the clock gives way to the word, until a run from 1-1 begins.
  const before = `${track === 'off' ? '' : `♪ ${track}   `}☠ ${g.deaths}   `
  const clock = s.practice ? ' PRACTICE ' : `⏱ ${seconds(g.phase === 'replay' || g.phase === 'kidnap' ? clearMs(g) : ms)}`
  const after = `   ${mine ? `best ${seconds(mine.ms)} ${grade(mine.ms, def?.par ?? 0)}` : `par ${seconds(def?.par ?? 0)}`} `
  const x = Math.max(0, c.cols - [...(before + clock + after)].length)
  c.text(x, 0, before, WHITE, bar)
  c.text(x + [...before].length, 0, clock, s.practice ? INK : WHITE, s.practice ? 0x9fd3e6 : bar)
  c.text(x + [...before + clock].length, 0, after, WHITE, bar)
}

function footer(c: Canvas, s: State): void {
  const y = c.rows - 1
  const bar = 0x120812
  for (let x = 0; x < c.cols; x++) c.set(x, y, ' ', WHITE, bar)
  const tips =
    s.g.phase === 'kidnap'
      ? ['Enter skip']
      : s.g.phase === 'replay'
      ? ['Enter or → next level  ·  R play it again', 'Enter next  ·  R again']
      : [
          '← → run  ·  ↓ stop  ·  Space jump  ·  Z hop  ·  hold click: higher  ·  R restart',
          '← → run  ·  ↓ stop  ·  Space jump  ·  Z hop  ·  click jump  ·  R restart',
          '← → run  ·  ↓ stop  ·  Space jump  ·  Z hop  ·  R restart',
          '← → ↓  Space  Z  R',
        ]
  const tip = tips.find(t => [...t].length <= c.cols) ?? ''
  c.center(y, tip, 0xb8a0b8, bar)
}

const CARD_WIDTH = 50

// The colors of a cell's upper and lower halves, read through a half block drawn there.
function halves(c: Canvas, x: number, y: number): [number, number] {
  const i = y * c.cols + x
  const fg = c.fg[i] ?? INK
  const bg = c.bg[i] ?? INK
  return c.ch[i] === '▀' ? [fg, bg] : c.ch[i] === '▄' ? [bg, fg] : [bg, bg]
}

// Pixel art, two pixels to a cell: ▀ in the top pixel's color over the bottom one's; a clear pixel shows what is beneath.
function paintArt(c: Canvas, art: string[], palette: Record<string, number>, x0: number, y0: number): void {
  for (let r = 0; r < art.length / 2; r++) {
    for (let k = 0; k < (art[0]?.length ?? 0); k++) {
      const top = art[r * 2]?.[k] ?? '.'
      const bottom = art[r * 2 + 1]?.[k] ?? '.'
      if (top === '.' && bottom === '.') continue
      const [upper, lower] = halves(c, x0 + k, y0 + r)
      c.set(x0 + k, y0 + r, '▀', palette[top] ?? upper, palette[bottom] ?? lower)
    }
  }
}

// `top` is the map's first row on the canvas.
function overlays(c: Canvas, s: State, best: Best, top: number): void {
  const { g } = s
  const mid = 1 + Math.floor((c.rows - 2) / 2)
  if (s.card > 0 && g.phase === 'play') {
    const pick = s.top > 0 ? `keys 1-${s.top + 1} pick a level` : ''
    const lines: [string, number][] = [[`CHAPTER 1 · LEVEL ${g.level + 1}`, GOLD], [LEVELS[g.level]?.name.toUpperCase() ?? '', WHITE], ['', WHITE], ...(pick ? [[pick, 0xb8a0b8] as [string, number]] : []), ['M music: A, B, off', 0xb8a0b8]]
    if (c.cols >= CARD_WIDTH) {
      // Claude as Meat Boy beside the level's name.
      const x0 = Math.floor((c.cols - CARD_WIDTH) / 2)
      const y0 = mid - 5
      for (let y = y0; y < y0 + ART.length / 2 + 4; y++) for (let x = x0; x < x0 + CARD_WIDTH; x++) c.set(x, y, ' ', WHITE, INK)
      paintArt(c, ART, PALETTE, x0 + 2, y0 + 2)
      lines.forEach(([text, fg], k) => c.text(x0 + 23, y0 + 3 + k, text, fg, INK))
    } else {
      const width = 30
      lines.forEach(([text, fg], k) => {
        const pad = width - [...text].length
        c.center(mid - 1 + k, ' '.repeat(Math.floor(pad / 2)) + text + ' '.repeat(Math.ceil(pad / 2)), fg, INK)
      })
    }
  }
  if (g.phase === 'kidnap' && g.kidnapT >= 4) c.center(top + 1, '  DR. FETUS!  ', WHITE, 0xc41e3a)
  if (g.phase === 'replay') {
    const ms = clearMs(g)
    const mark = grade(ms, LEVELS[g.level]?.par ?? 0)
    const prior = best[levelKey(g.level)]
    const isRecord = !s.practice && (prior === undefined || ms <= prior.ms)
    const tag = s.practice ? '  PRACTICE, NOT SAVED' : isRecord ? '  NEW BEST' : ''
    c.center(top + 1, `  ★ LEVEL CLEAR ★  ${seconds(ms)}  ${mark}  ☠ ${g.deaths}${tag}  `, INK, GOLD)
  }
}

export const ENDING_FRAMES = 120
const WALK_FRAMES = 45

// The last level cleared: Claude as Meat Boy and Bandage Girl walk in from either side and hug, and hearts rise.
function hugScreen(c: Canvas, s: State): void {
  const t = ENDING_FRAMES - s.ending
  const ground = c.rows - 4
  for (let y = 0; y < c.rows; y++) {
    const sky = mix(SKY_TOP, SKY_LOW, Math.min(1, y / ground))
    for (let x = 0; x < c.cols; x++) {
      if (y < ground) c.set(x, y, ' ', WHITE, sky)
      else if (y === ground) c.set(x, y, '▄', GRASS, sky)
      else c.set(x, y, (x * 7 + y * 13) % 9 === 0 ? '░' : ' ', DIRT_DARK, DIRT)
    }
  }
  const width = ART[0]?.length ?? 0
  const height = ART.length / 2
  const meetX = Math.floor(c.cols / 2) - 16
  const isWalking = t < WALK_FRAMES
  const k = 1 - (1 - Math.min(1, t / WALK_FRAMES)) ** 2
  const hisX = Math.round(-width + (meetX + width) * k)
  // In the hug her near arm overlaps his body by two pixels, and his far arm is drawn over her.
  const herX = Math.round(c.cols + (meetX + 14 - c.cols) * k)
  const stepping = isWalking && (t >> 2) % 2 === 1
  const top = ground - height + 1
  paintArt(c, isWalking ? (stepping ? step2(ART) : ART) : ART_HAPPY, PALETTE, hisX, top)
  paintArt(c, isWalking ? (stepping ? step2(BANDAGE_ART) : BANDAGE_ART) : BANDAGE_HAPPY, BANDAGE_PALETTE, herX, top)
  if (!isWalking) paintArt(c, ART_ARM, PALETTE, hisX, top)
  if (t >= WALK_FRAMES + 5) {
    c.center(2, '  ♥  TOGETHER AGAIN  ♥  ', INK, BANDAGE)
    // A heart every five frames, each drifting up from above the pair at its own column.
    const drift = [-6, 5, -2, 8, -9, 2, -4, 6, 0, -7]
    for (let n = 0; WALK_FRAMES + 5 + n * 5 <= t; n++) {
      const age = t - (WALK_FRAMES + 5 + n * 5)
      const y = top - 1 - Math.floor(age / 6)
      if (y > 3) c.set(meetX + 16 + (drift[n % drift.length] ?? 0), y, '♥', n % 2 === 0 ? BANDAGE : 0xff4d88)
    }
  }
  c.center(c.rows - 1, 'Enter skip', 0xb8a0b8, DIRT)
}

function total(s: State): { ms: number; deaths: number } {
  return s.results.reduce((a, r) => ({ ms: a.ms + r.ms, deaths: a.deaths + r.deaths }), { ms: 0, deaths: 0 })
}

// A run makes the board when it cleared every level, in order from 1-1, outside practice.
function isBoardRun(s: State): boolean {
  return !s.practice && LEVELS.every((_, i) => s.results[i] !== undefined)
}

const BOARD_ROWS = 8
// X allows up to 15 characters in a handle.
const HANDLE_MAX = 15

function boardScreen(c: Canvas, s: State, board: Score[]): void {
  c.center(4, 'SCOREBOARD', GOLD, INK)
  const mine = board.findIndex(b => b.handle === s.entered?.handle && b.ms === s.entered.ms && b.deaths === s.entered.deaths)
  const line = (n: number) => {
    const b = board[n]
    return b === undefined ? '' : `${String(n + 1).padStart(3)}.  ${`@${b.handle}`.padEnd(16)}  ${seconds(b.ms).padStart(7)}  ☠ ${String(b.deaths).padEnd(3)}`
  }
  for (let n = 0; n < Math.min(BOARD_ROWS, board.length); n++) c.center(5 + n, line(n), n === mine ? GOLD : WHITE, INK)
  if (mine >= BOARD_ROWS) c.center(5 + BOARD_ROWS, line(mine), GOLD, INK)
}

function endScreen(c: Canvas, s: State, board: Score[]): void {
  for (let i = 0; i < c.bg.length; i++) {
    c.ch[i] = ' '
    c.bg[i] = INK
  }
  const sum = total(s)
  c.center(2, '♥  YOU SAVED BANDAGE GIRL  ♥', BANDAGE, INK)
  if (s.entered !== undefined) {
    boardScreen(c, s, board)
    c.center(14, '...but Dr. Fetus has escaped.  Enter to play again.', 0xb8a0b8, INK)
    return
  }
  s.results.forEach((r, i) => {
    const name = `1-${i + 1} ${LEVELS[i]?.name ?? ''}`.padEnd(24)
    c.center(4 + i, `${name} ${seconds(r.ms).padStart(7)}  ${grade(r.ms, LEVELS[i]?.par ?? 0).padEnd(2)}  ☠ ${r.deaths}`, WHITE, INK)
  })
  c.center(5 + s.results.length, `total ${seconds(sum.ms)}   deaths ${sum.deaths}`, GOLD, INK)
  if (s.handle !== undefined) {
    const cursor = s.handle.length < HANDLE_MAX && s.frame % 20 < 10 ? '▌' : ''
    c.center(7 + s.results.length, `  FOR THE BOARD, YOUR X HANDLE:  ${`@${s.handle}${cursor}`.padEnd(HANDLE_MAX + 1)}  `, INK, GOLD)
    c.center(9 + s.results.length, `up to ${HANDLE_MAX} letters, digits or _  ·  Backspace fixes  ·  Enter saves`, 0xb8a0b8, INK)
    return
  }
  c.center(7 + s.results.length, '...but Dr. Fetus has escaped.  Enter to play again.', 0xb8a0b8, INK)
  if (s.practice) c.center(9 + s.results.length, 'practice run: times not saved', 0x9fd3e6, INK)
}

function draw(c: Canvas, { Box, Text }: ClientElements): RenderElement {
  const lines: RenderElement[] = []
  for (let y = 0; y < c.rows; y++) {
    const spans: RenderElement[] = []
    let x = 0
    while (x < c.cols) {
      const i = y * c.cols + x
      const fg = c.fg[i] ?? WHITE
      const bg = c.bg[i] ?? 0
      let run = ''
      while (x < c.cols && c.fg[y * c.cols + x] === fg && c.bg[y * c.cols + x] === bg) {
        run += c.ch[y * c.cols + x]
        x++
      }
      spans.push(Text({ color: hex(fg), backgroundColor: hex(bg), children: run }))
    }
    lines.push(Text({ wrap: 'truncate', children: spans }))
  }
  return Box({ flexDirection: 'column', children: lines })
}

function onKey(s: State, ev: ClientKeyEvent, post: (p: Post) => void): void {
  const k = ev.key.toLowerCase()
  if (s.isOver && s.ending > 0) {
    if (k === 'return') s.ending = 0
    return
  }
  if (s.handle !== undefined) {
    const typed = ev.shift === true ? ev.key.toUpperCase() : ev.key
    if (/^\w$/.test(typed) && s.handle.length < HANDLE_MAX) s.handle += typed
    if (k === 'backspace' || k === 'delete') s.handle = s.handle.slice(0, -1)
    if (k === 'return' && s.handle.length > 0) {
      s.entered = { handle: s.handle, ...total(s) }
      post({ score: s.entered, run: s.results.map(r => r.keys) })
      s.handle = undefined
    }
    return
  }
  if (k === 'm') {
    post({ music: 'toggle' })
    return
  }
  // 1 starts a run from the top, in order; any other level picked is practice.
  const pick = /^[1-9]$/.test(k) ? Number(k) - 1 : -1
  if (pick >= 0 && pick <= s.top) {
    Object.assign(s, fresh(pick, pick === 0 ? [] : s.results, s.top), { frame: s.frame, practice: pick !== 0 })
    return
  }
  if (s.isOver) {
    if (k === 'return') Object.assign(s, fresh(0, [], s.top))
    return
  }
  if (s.g.phase === 'kidnap') {
    if (k === 'return') s.g.phase = 'replay'
    return
  }
  if (s.g.phase === 'replay') {
    if (k === 'return' || k === 'right' || k === 'd') advance(s)
    if (k === 'r') s.g.replayT = 0
    return
  }
  if (k === 'left' || k === 'a' || k === 'h') s.pending.left = true
  if (k === 'right' || k === 'd' || k === 'l') s.pending.right = true
  if (k === 'down' || k === 's' || k === 'j') s.pending.stop = true
  if (k === 'up' || k === 'w' || k === 'k' || k === ' ' || k === 'space') s.pending.jump = true
  if (k === 'z') s.pending.hop = true
  if (k === 'r') {
    const deaths = s.g.deaths
    s.g = load(s.g.level)
    s.g.deaths = deaths
  }
}

export function fresh(level: number, results: Result[], top: number): State {
  return { g: load(level), pending: {}, card: TITLE_FRAMES, results, isOver: false, frame: 0, top, practice: false, handle: undefined, entered: undefined, ending: 0 }
}

export function highest(best: Best): number {
  let n = 0
  while (n + 1 < LEVELS.length && best[levelKey(n)] !== undefined) n++
  return n
}

function advance(s: State): void {
  s.results[s.g.level] = { ms: clearMs(s.g), deaths: s.g.deaths, keys: s.g.keys }
  if (s.g.level + 1 >= LEVELS.length) {
    s.isOver = true
    s.ending = ENDING_FRAMES
    if (isBoardRun(s)) s.handle = ''
    return
  }
  Object.assign(s, fresh(s.g.level + 1, s.results, s.top), { frame: s.frame, practice: s.practice })
}

// The end screens are laid out for this many rows, and sit in the middle of a taller pane.
const END_ROWS = 16

function blit(to: Canvas, from: Canvas, fromY: number, toY: number, rows: number): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < to.cols; x++) {
      const i = (fromY + y) * from.cols + x
      to.set(x, toY + y, from.ch[i] ?? ' ', from.fg[i] ?? WHITE, from.bg[i] ?? INK)
    }
  }
}

// The whole frame for a state: the map with the HUD above and the controls below.
export function compose(s: State, best: Best, columns: number, board: Score[] = [], track: Track = 'off', height = PANE_ROWS): Canvas {
  const cols = Math.min(Math.max(20, columns || 80), s.g.w * 2)
  const rows = Math.min(PANE_ROWS, Math.max(MIN_ROWS, height || PANE_ROWS))
  const c = new Canvas(cols, rows)
  for (let i = 0; i < c.bg.length; i++) c.bg[i] = INK
  if (s.isOver && s.ending > 0) {
    hugScreen(c, s)
    return c
  }
  if (s.isOver) {
    const end = new Canvas(cols, END_ROWS)
    endScreen(end, s, board)
    blit(c, end, Math.max(0, (END_ROWS - rows) >> 1), Math.max(0, (rows - END_ROWS) >> 1), Math.min(rows, END_ROWS))
    return c
  }
  const { g } = s
  const isPlay = g.phase === 'play'
  const view = cols / 2
  const camX = Math.max(0, Math.min(g.w - view, (isPlay ? g.px : g.goal.x) - view / 2))
  const mapRows = rows - 2
  const viewRows = Math.min(g.h, mapRows)
  // ponytail: the camera centers Meat Boy every frame, no dead zone; add one if the scrolling feels busy.
  const camY = Math.round(Math.max(0, Math.min(g.h - viewRows, (isPlay ? g.py + PH / 2 : g.goal.y) - viewRows / 2)))
  const top = 1 + ((mapRows - viewRows) >> 1)
  const world = new Canvas(cols, g.h)
  paintWorld(world, s, camX)
  paintActors(world, s, camX)
  blit(c, world, camY, top, viewRows)
  hud(c, s, best, track)
  footer(c, s)
  overlays(c, s, best, top)
  return c
}

const Screen: ClientModule<ScreenProps, State> = (props, surface) => {
  let s = surface.state
  if (s === undefined) {
    // Always open at 1-1; the number keys reach any level already open.
    s = fresh(0, [], highest(props.best ?? {}))
    const live = s
    surface.onKey(ev => onKey(live, ev, p => surface.post(p)))
    surface.onPointer(ev => {
      // The mouse is the one input with a release: hold the button to jump higher.
      if (ev.type === 'down' && live.g.phase === 'play') live.pending.jump = true
      if (ev.type === 'up') live.pending.release = true
    })
    surface.every(Math.round(DT * 1000), () => {
      live.frame += 1
      if (live.card > 0) {
        // The level waits behind its title card, and keys pressed meanwhile are dropped.
        live.card -= 1
        live.pending = {}
      } else if (!live.isOver) {
        const events = step(live.g, live.pending)
        live.pending = {}
        const post: Post = {}
        for (const e of events) post.sfx = e
        if (events.includes('clear') && !live.practice) {
          live.top = Math.max(live.top, Math.min(live.g.level + 1, LEVELS.length - 1))
          post.result = { level: live.g.level, ms: clearMs(live.g), deaths: live.g.deaths }
        }
        if (post.sfx !== undefined) surface.post(post)
      } else if (live.ending > 0) {
        // The victory jingle opens the hug.
        if (live.ending === ENDING_FRAMES) surface.post({ sfx: 'end' })
        live.ending -= 1
      }
      surface.setState({ ...live })
    })
    surface.setState(s)
  }

  const c = compose(s, props.best ?? {}, surface.columns, props.board ?? [], props.music ?? 'off', surface.rows)
  return draw(c, surface.elements)
}

export default Screen
