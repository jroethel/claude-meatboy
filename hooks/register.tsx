import type { EngineInterface, Register } from 'claude-code'

import { LEVELS, MAP_ROWS } from './levels'
import type { Best, Post, Score, ScreenProps, Track } from './screen'

const PANE = 'meat-boy'
// The tallest level, the HUD above it and the controls below.
const PANE_ROWS = MAP_ROWS + 2
const SFX = {
  jump: 'sounds/jump.wav',
  walljump: 'sounds/walljump.wav',
  death: 'sounds/death.wav',
  clear: 'sounds/clear.wav',
  end: 'sounds/end.wav',
  kidnap: 'sounds/fetus.wav',
} as const

const readBest = async ($: EngineInterface): Promise<Best> => ((await $.store.get('best')) as Best | undefined) ?? {}
// Boards saved before handles hold 3-letter `initials`, read here as the handle.
const readBoard = async ($: EngineInterface): Promise<Score[]> =>
  (((await $.store.get('board')) as (Score & { initials?: string })[] | undefined) ?? []).map(({ initials, ...b }) => ({ ...b, handle: b.handle ?? initials ?? '' }))
// ponytail: keeps the 100 fastest runs, enough for one machine's board.
const BOARD_MAX = 100
// The world board: a Cloudflare Worker that replays each run before it takes it (scoreboard/).
const WORLD = 'https://meatboy-scores.jroethel.workers.dev'
// The world's top ten, or why it cannot be reached (a session with nonessential traffic off refuses it).
const readWorld = async ($: EngineInterface): Promise<Score[] | string> => {
  try {
    const res = await $.http.fetch(`${WORLD}/top`)
    return res.ok ? (JSON.parse(res.text) as Score[]) : `status ${res.status}`
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`
// The soundtracks, at gains that play them equally loud; M cycles A, B, off.
const TRACKS = {
  A: { asset: 'sounds/music-a.wav', name: 'Meat Grinder (darksynth)', gain: 0.22 },
  B: { asset: 'sounds/music-b.wav', name: 'Chapter One (chiptune)', gain: 0.49 },
} as const
const NEXT: Record<Track, Track> = { A: 'B', B: 'off', off: 'A' }
const readTrack = async ($: EngineInterface): Promise<Track> => {
  const track = await $.store.get('track')
  return track === 'A' || track === 'B' || track === 'off' ? track : 'A'
}
// What should be heard: the chosen track, unless all sound is muted.
const audibleTrack = async ($: EngineInterface): Promise<Track> => ((await $.store.get('muted')) === true ? 'off' : readTrack($))
const readProps = async ($: EngineInterface): Promise<ScreenProps> => ({ best: await readBest($), board: await readBoard($), music: await audibleTrack($) })
const describeTrack = (track: Track) => (track === 'off' ? 'Meat Boy music is off.' : `Meat Boy music: soundtrack ${track}, ${TRACKS[track].name}.`)

// The loop playing now, and which one.
let music: { track: Exclude<Track, 'off'>; stop: AbortController } | undefined

function stopMusic(): void {
  music?.stop.abort()
  music = undefined
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
}

// Plays the chosen loop while the pane is open and sound is on, switching or stopping it otherwise.
async function syncMusic($: EngineInterface): Promise<void> {
  const track = (await isPaneOpen($)) ? await audibleTrack($) : 'off'
  if (music !== undefined && music.track !== track) stopMusic()
  if (track === 'off' || music !== undefined) return
  const playing = { track, stop: new AbortController() }
  music = playing
  // Forgotten once it ends for any reason, stopped, refused or failed, so the next sync can start it again.
  void $.audio
    .play({ asset: TRACKS[track].asset }, { shouldLoop: true, gain: TRACKS[track].gain, signal: playing.stop.signal })
    .catch(() => undefined)
    .finally(() => {
      if (music === playing) music = undefined
    })
}

// Moves to the named track, or the next one in the cycle.
async function chooseTrack($: EngineInterface, to: Track | undefined): Promise<Track> {
  const track = to ?? NEXT[await readTrack($)]
  await $.store.set('track', track)
  await syncMusic($)
  return track
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'meatboy',
      description: 'Play Super Meat Boy, Chapter 1, in a pane (/meatboy scores shows the board, /meatboy music cycles soundtrack A, B and off, /meatboy mute toggles all sound)',
      argumentHint: '[scores|music [a|b|off]|mute]',
    })
    return next(e)
  })

  on('command.run', { command: 'meatboy' }, async ($, e) => {
    if (e.args.trim() === 'mute') {
      const isMuted = (await $.store.get('muted')) !== true
      await $.store.set('muted', isMuted)
      await syncMusic($)
      return { text: isMuted ? 'Meat Boy is muted.' : 'Meat Boy has sound again.' }
    }
    const [word, choice] = e.args.trim().split(/\s+/)
    if (word === 'music') {
      const to = choice?.toUpperCase() === 'A' ? 'A' : choice?.toUpperCase() === 'B' ? 'B' : choice === 'off' ? 'off' : undefined
      return { text: describeTrack(await chooseTrack($, to)) }
    }
    if (e.args.trim() === 'scores') {
      const world = await readWorld($)
      const isOffline = typeof world === 'string'
      const board = isOffline ? await readBoard($) : world
      const title = isOffline ? `Meat Boy scoreboard, this machine only. The world board is out of reach: ${world}` : 'Meat Boy world board'
      if (board.length === 0) return { text: `${title}\nThe board is empty: clear 1-1 through 1-${LEVELS.length} in one run, outside practice, to make it.` }
      const rows = board.slice(0, 10).map((b, n) => `${String(n + 1).padStart(2)}. ${`@${b.handle}`.padEnd(16)}  ${seconds(b.ms).padStart(7)}  ☠ ${b.deaths}`)
      return { text: [title, ...rows].join('\n') }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Meat Boy', focus: true, closeOnEscape: true, holdToasts: true, rows: PANE_ROWS, columns: 82 })
    if (!opened.isPlaced) return { text: `Meat Boy could not open: ${opened.reason}` }
    await $.ui.focus({ requestId: PANE, key: 'game' })
    return { text: 'Meat Boy is up. Click the level, then ← → to run, Space to jump, Z to hop, hold a click to jump higher, Esc to quit.' }
  })

  // Closed by the person, or the module unloading: the music goes with the pane.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) stopMusic()
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // The pane being drawn is what starts the music; ui.close stops it.
    await syncMusic($)
    const props = await readProps($)
    if (e.surface === 'terminal' || e.surface === 'desktop') {
      const { Client } = $.ui.resolve(e)
      // No taller than the pane shows: a short terminal gets a short map that scrolls, not a cut-off one.
      const height = Math.min(PANE_ROWS, e.props.scroll.bodyRows || PANE_ROWS)
      return <Client key="game" module="./screen.ts" props={props} width={Math.min(e.props.bodyColumns, 80)} height={height} />
    }
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>Meat Boy runs in the terminal and the desktop app.</Text>
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const post = e.data as Post
    if (post.music === 'toggle') {
      await chooseTrack($, undefined)
      return { props: await readProps($) }
    }
    if (post.sfx !== undefined && (await $.store.get('muted')) !== true) {
      void $.audio.play({ asset: SFX[post.sfx] }, { gain: 0.6 }).catch(() => undefined)
    }
    if (post.score !== undefined) {
      const { score } = post
      const board = [...(await readBoard($)), score].sort((a, b) => a.ms - b.ms || a.deaths - b.deaths).slice(0, BOARD_MAX)
      await $.store.set('board', board)
      // ponytail: one try, no retry queue; a run sent while offline stays on this machine's board only.
      if (post.run !== undefined) {
        const body = JSON.stringify({ ...score, levels: post.run })
        void $.http.fetch(`${WORLD}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => undefined)
      }
      return { props: await readProps($) }
    }
    if (post.result === undefined) return next(e)
    const { level, ms, deaths } = post.result
    const best = await readBest($)
    const prior = best[String(level)]
    if (prior !== undefined && prior.ms <= ms) return next(e)
    const updated: Best = { ...best, [String(level)]: { ms, deaths } }
    await $.store.set('best', updated)
    return { props: await readProps($) }
  })
}
