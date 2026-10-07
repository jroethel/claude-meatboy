import type { RenderPropsOf } from 'claude-code'
import type { Mounted } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { LEVELS, MAP_ROWS, levelKey } from '../hooks/levels'
import { KIDNAP_FRAMES } from '../hooks/game'
import { verify } from '../hooks/verify'
import { SOLUTIONS } from './solutions'

// A command as the person types it at the prompt.
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

const PANE: RenderPropsOf['Pane'] = {
  title: 'Meat Boy',
  isFocused: true,
  bodyColumns: 80,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: MAP_ROWS + 2 },
  view: {},
}
const KEYS = { right: 'right', left: 'left', jump: 'space', hop: 'z', stop: 'down' } as const
// Long enough for a level's title card to clear: the level waits behind it.
const PAST_CARD_MS = 33 * 42
// Waits out the title card to the frame before the level's first, where its script's frame 0 begins:
// on levels with saws that move, a frame late is a different level.
async function pastCard(ui: Ui): Promise<void> {
  while ((await ui.find({ in: 'game', text: /CHAPTER 1/ })) !== undefined) await ui.advance(33)
}
// Frames for level n's script to reach the replay: its last input, the rest of the way, and Dr. Fetus.
const playFrames = (n: number) => (SOLUTIONS[n]?.at(-1)?.[0] ?? 0) + 40 + KIDNAP_FRAMES

// The engine beneath, as a session answers it: the Meat Boy pane is open.
const paneOpen = (on: Parameters<typeof mock.store>[0]) =>
  on('ui.panes', () => ({ value: [{ id: 'meat-boy', title: 'Meat Boy', isShown: true, isFocused: true, isPlaced: true }] }))

for (const surface of ['terminal', 'desktop'] as const) {
  test(`level 1 played with the keyboard on ${surface} records a best time and a jingle`, { timeoutMs: 20_000 }, async ($, on) => {
    mock.store(on)
    paneOpen(on)
    const played: string[] = []
    on('audio.play', (_$, e) => {
      if (e.clip.asset !== undefined) played.push(e.clip.asset)
      return { value: undefined }
    })
    const ui = await $.ui.mount({ plugin: 'meatboy', surface, component: 'Pane', requestId: 'meat-boy', props: PANE })
    await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
    await ui.advance(40)
    expect(await ui.find({ in: 'game', text: /HELLO WORLD/ })).toBeDefined()
    await ui.advance(PAST_CARD_MS)

    const script = new Map(SOLUTIONS[0])
    for (let f = 0; f < 200; f++) {
      const action = script.get(f)
      if (action) await ui.key({ key: KEYS[action] })
      await ui.advance(33)
    }
    expect(await ui.find({ in: 'game', text: /LEVEL CLEAR/ })).toBeDefined()
    expect(played).toContain('sounds/jump.wav')
    expect(played).toContain('sounds/clear.wav')
    // The hooks module stored the time and handed it back: the HUD now shows it as the best.
    expect(await ui.find({ in: 'game', text: /best 3\.\d\ds A\+/ })).toBeDefined()

    await ui.key({ key: 'return' })
    await ui.advance(33)
    expect(await ui.find({ in: 'game', text: /WALL FLOWER/ })).toBeDefined()
    // Clearing 1-1 opened 1-2, so the number keys now reach both.
    await ui.key({ key: '1' })
    await ui.advance(33)
    expect(await ui.find({ in: 'game', text: /HELLO WORLD/ })).toBeDefined()
    await ui.key({ key: '2' })
    await ui.advance(33)
    expect(await ui.find({ in: 'game', text: /WALL FLOWER/ })).toBeDefined()
    await ui.unmount()
  })
}

test('/meatboy mute toggles sound off and back on', async ($, on) => {
  mock.store(on)
  paneOpen(on)
  expect((await $.command.run({ command: 'meatboy', args: 'mute', ...TYPED })).text).toBe('Meat Boy is muted.')
  expect((await $.command.run({ command: 'meatboy', args: 'mute', ...TYPED })).text).toBe('Meat Boy has sound again.')
})

// Where Meat Boy is drawn, as [row, column]: the one span with his orange behind a black eye.
function meatCell(tree: unknown): [number, number] {
  type Span = { props: { backgroundColor?: string }; children: string[] }
  const lines = (tree as { children: { children: Span[] }[] }).children
  for (const [row, line] of lines.entries()) {
    let col = 0
    for (const span of line.children) {
      const text = span.children.join('')
      if (span.props.backgroundColor === '#d77757' && text.includes('•')) return [row, col + [...text].indexOf('•')]
      col += [...text].length
    }
  }
  return [-1, -1]
}
const meatRow = (tree: unknown) => meatCell(tree)[0]

test('a held click jumps higher than a quick one', { timeoutMs: 20_000 }, async ($, on) => {
  mock.store(on)
  paneOpen(on)
  on('audio.play', () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.advance(PAST_CARD_MS)
  const ground = meatRow(await ui.drawn({ in: 'game' }))
  const peak = async (holdFrames: number) => {
    await ui.pointer({ type: 'down', x: 4, y: 8, button: 'left' })
    let top = ground
    for (let f = 0; f < 24; f++) {
      if (f === holdFrames) await ui.pointer({ type: 'up', x: 4, y: 8, button: 'left' })
      await ui.advance(33)
      top = Math.min(top, meatRow(await ui.drawn({ in: 'game' })))
    }
    return ground - top
  }
  const quick = await peak(0)
  const held = await peak(12)
  expect(ground).toBeGreaterThan(0)
  expect(quick).toBeGreaterThan(0)
  expect(held).toBeGreaterThan(quick + 1)
  await ui.unmount()
})

test('a pane shorter than the level scrolls the map with Meat Boy, and a taller one centers it', { timeoutMs: 20_000 }, async ($, on) => {
  mock.store(on)
  paneOpen(on)
  const lines = (tree: unknown) => (tree as { children: unknown[] }).children.length
  const short = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: { ...PANE, scroll: { offset: 0, bodyRows: 12 } } })
  await short.resize({ columns: 80, rows: 12 })
  await pastCard(short)
  // 1-1 is 14 rows, the map here 10: it scrolls down to Meat Boy, so it shows the level's last 10 rows
  // and his start, row 9 of them, is 4 rows higher, under the HUD's one.
  const low = await short.drawn({ in: 'game' })
  expect(lines(low)).toBe(12)
  expect(meatRow(low)).toBe(1 + 9 - 4)
  expect(await short.find({ in: 'game', text: /1-1 HELLO WORLD/ })).toBeDefined()
  expect(await short.find({ in: 'game', text: /R restart/ })).toBeDefined()
  await short.unmount()

  const tall = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await tall.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await pastCard(tall)
  // The tallest level fills the map; 1-1's 14 rows sit in its middle, so Meat Boy's start, row 9 of them, moves down by half the rest.
  const centered = await tall.drawn({ in: 'game' })
  expect(lines(centered)).toBe(MAP_ROWS + 2)
  expect(meatRow(centered)).toBe(1 + ((MAP_ROWS - 14) >> 1) + 9)
  await tall.unmount()
})

test('the pane opens at 1-1 even with levels open, and number keys pick any open level', async ($, on) => {
  mock.store(on, { best: { [levelKey(0)]: { ms: 3300, deaths: 0 }, [levelKey(1)]: { ms: 3200, deaths: 2 } } })
  paneOpen(on)
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /1-1 HELLO WORLD/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /keys 1-3 pick a level/ })).toBeDefined()
  await ui.key({ key: '4' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /1-1 HELLO WORLD/ })).toBeDefined()
  await ui.key({ key: '3' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /1-3 BUZZSAW BOULEVARD/ })).toBeDefined()
  await ui.unmount()
})

test('the level waits behind its title card, dropping keys pressed meanwhile', { timeoutMs: 20_000 }, async ($, on) => {
  mock.store(on)
  paneOpen(on)
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.advance(33)
  const start = meatCell(await ui.drawn({ in: 'game' }))
  await ui.key({ key: 'right' })
  await ui.key({ key: 'space' })
  await ui.advance(33 * 30)
  expect(await ui.find({ in: 'game', text: /CHAPTER 1/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /⏱ 0\.00s/ })).toBeDefined()
  await ui.advance(33 * 30)
  // The card is gone and the clock runs, but the keys pressed behind it never reached Meat Boy.
  expect(await ui.find({ in: 'game', text: /CHAPTER 1/ })).toBeUndefined()
  expect(await ui.find({ in: 'game', text: /⏱ 0\.[1-9]\ds/ })).toBeDefined()
  expect(meatCell(await ui.drawn({ in: 'game' }))).toEqual(start)
  await ui.unmount()
})

test('with nothing cleared, the pane opens at 1-1 and the number keys stay shut', async ($, on) => {
  mock.store(on)
  paneOpen(on)
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.key({ key: '2' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /1-1 HELLO WORLD/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /pick a level/ })).toBeUndefined()
  await ui.unmount()
})

test('a level picked by number is practice: its clear is not saved and opens nothing', { timeoutMs: 20_000 }, async ($, on) => {
  mock.store(on, { best: { [levelKey(0)]: { ms: 9000, deaths: 0 }, [levelKey(1)]: { ms: 9000, deaths: 0 } } })
  paneOpen(on)
  on('audio.play', () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /PRACTICE/ })).toBeUndefined()
  expect(await ui.find({ in: 'game', text: /⏱ / })).toBeDefined()
  await ui.key({ key: '2' })
  await ui.advance(33)
  // PRACTICE takes the clock's place in the top line.
  expect(await ui.find({ in: 'game', text: /PRACTICE/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /⏱ / })).toBeUndefined()
  await pastCard(ui)

  const script = new Map(SOLUTIONS[1])
  for (let f = 0; f < playFrames(1); f++) {
    const action = script.get(f)
    if (action) await ui.key({ key: KEYS[action] })
    await ui.advance(33)
  }
  expect(await ui.find({ in: 'game', text: /LEVEL CLEAR.*PRACTICE, NOT SAVED/ })).toBeDefined()
  // A 5.3s clear beats the stored 9.00s, but practice leaves the best as it was.
  expect(await ui.find({ in: 'game', text: /best 9\.00s/ })).toBeDefined()

  // Practice carries on to the next level, and 1-4 stays shut.
  await ui.key({ key: 'return' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /1-3 BUZZSAW BOULEVARD/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /PRACTICE/ })).toBeDefined()
  await ui.key({ key: '4' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /1-3 BUZZSAW BOULEVARD/ })).toBeDefined()
  // 1 is a fresh run from the top, not practice.
  await ui.key({ key: '1' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /1-1 HELLO WORLD/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /PRACTICE/ })).toBeUndefined()
  expect(await ui.find({ in: 'game', text: /⏱ / })).toBeDefined()
  await ui.unmount()
})

type Ui = Mounted<'terminal', 'Pane'>

// Plays one level by its winning script and moves past its replay.
async function clearLevel(ui: Ui, n: number): Promise<void> {
  await pastCard(ui)
  const script = new Map(SOLUTIONS[n])
  for (let f = 0; f < playFrames(n); f++) {
    const action = script.get(f)
    if (action) await ui.key({ key: KEYS[action] })
    await ui.advance(33)
  }
  expect(await ui.find({ in: 'game', text: /LEVEL CLEAR/ })).toBeDefined()
  await ui.key({ key: 'return' })
  await ui.advance(33)
}

test('a run from 1-1 to the end asks for a handle and puts it on the board, here and in the world', { timeoutMs: 60_000 }, async ($, on) => {
  mock.store(on)
  paneOpen(on)
  on('audio.play', () => ({ value: undefined }))
  // The world board, as the Worker answers: it keeps what it is sent, once offline is over.
  const sent: unknown[] = []
  let isOnline = false
  on('http.fetch', (_$, e) => {
    if (!isOnline) throw new Error('offline')
    if (e.init?.method === 'POST') sent.push(JSON.parse(e.init.body ?? ''))
    const top = [{ handle: 'zz_top', ms: 18000, deaths: 0 }]
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(top) } }
  })
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  for (let n = 0; n < LEVELS.length; n++) await clearLevel(ui, n)
  // The hug plays first, then ends on its own.
  await ui.advance(33 * 60)
  expect(await ui.find({ in: 'game', text: /TOGETHER AGAIN/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /@handle/ })).toBeUndefined()
  await ui.advance(33 * 65)
  expect(await ui.find({ in: 'game', text: /@handle/ })).toBeDefined()
  // Shift capitalizes, symbols other than _ are refused, and the handle stops at X's 15 characters.
  await ui.key({ key: 'j', shift: true })
  for (const key of ['r', 'backspace', 'q', '-', '@', 'x', '_', '9', ...'abcdefghijk']) await ui.key({ key })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /@Jqx_9abcdefghij / })).toBeDefined()
  isOnline = true
  await ui.key({ key: 'return' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /SCOREBOARD/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /1\.  @Jqx_9abcdefghij / })).toBeDefined()
  // The run went to the world board, and its replay there gives the time the pane showed.
  expect(sent).toHaveLength(1)
  const checked = verify(sent[0])
  expect(checked).toHaveProperty('run')
  expect(await ui.find({ in: 'game', text: new RegExp(`Jqx_9abcdefghij +${'run' in checked ? (checked.run.ms / 1000).toFixed(2) : 'none'}s`) })).toBeDefined()
  const world = await $.command.run({ command: 'meatboy', args: 'scores', ...TYPED })
  expect(world.text).toMatch(/world board\n 1\. @zz_top +18\.00s/)
  isOnline = false
  const local = await $.command.run({ command: 'meatboy', args: 'scores', ...TYPED })
  expect(local.text).toMatch(/this machine only[^\n]*\n 1\. @Jqx_9abcdefghij /)
  await ui.unmount()
})

test('a practice run to the end gets no handle prompt and no board', { timeoutMs: 20_000 }, async ($, on) => {
  const best = { ms: 9000, deaths: 0 }
  mock.store(on, { best: Object.fromEntries([0, 1, 2, 3, 4].map(n => [levelKey(n), best])) })
  paneOpen(on)
  on('audio.play', () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.key({ key: '6' })
  await ui.advance(33)
  await clearLevel(ui, 5)
  // Enter skips the hug straight to the results.
  await ui.key({ key: 'return' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /YOU SAVED BANDAGE GIRL/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /@handle/ })).toBeUndefined()
  expect(await ui.find({ in: 'game', text: /practice run: times not saved/ })).toBeDefined()
  await ui.unmount()
})

test('Enter skips Dr. Fetus straight to the replay', { timeoutMs: 20_000 }, async ($, on) => {
  mock.store(on)
  paneOpen(on)
  on('audio.play', () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.advance(PAST_CARD_MS)
  const script = new Map(SOLUTIONS[0])
  for (let f = 0; f < 200 && (await ui.find({ in: 'game', text: /DR\. FETUS!/ })) === undefined; f++) {
    const action = script.get(f)
    if (action) await ui.key({ key: KEYS[action] })
    await ui.advance(33)
  }
  expect(await ui.find({ in: 'game', text: /DR\. FETUS!/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /LEVEL CLEAR/ })).toBeUndefined()
  await ui.key({ key: 'return' })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /LEVEL CLEAR/ })).toBeDefined()
  await ui.unmount()
})

test('M cycles soundtrack A, B and off in the open pane; /meatboy music and mute do the same', async ($, on) => {
  mock.store(on)
  paneOpen(on)
  const loops: string[] = []
  on('audio.play', (_$, e) => {
    if (e.shouldLoop) loops.push(String(e.clip.asset))
    return { value: undefined }
  })
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.advance(33)
  const hud = async () => (await ui.find({ in: 'game', text: /♪ [AB]/ }))?.text.match(/♪ ([AB])/)?.[1] ?? 'off'
  expect(loops).toEqual(['sounds/music-a.wav'])
  expect(await hud()).toBe('A')
  expect(await ui.find({ in: 'game', text: /M music: A, B, off/ })).toBeDefined()
  const press = async () => {
    await ui.key({ key: 'm' })
    await ui.advance(33)
  }
  await press()
  expect(await hud()).toBe('B')
  await press()
  expect(await hud()).toBe('off')
  await press()
  expect(await hud()).toBe('A')
  expect(loops).toEqual(['sounds/music-a.wav', 'sounds/music-b.wav', 'sounds/music-a.wav'])

  expect((await $.command.run({ command: 'meatboy', args: 'music', ...TYPED })).text).toBe('Meat Boy music: soundtrack B, Chapter One (chiptune).')
  expect((await $.command.run({ command: 'meatboy', args: 'music a', ...TYPED })).text).toBe('Meat Boy music: soundtrack A, Meat Grinder (darksynth).')
  expect((await $.command.run({ command: 'meatboy', args: 'mute', ...TYPED })).text).toBe('Meat Boy is muted.')
  expect((await $.command.run({ command: 'meatboy', args: 'music off', ...TYPED })).text).toBe('Meat Boy music is off.')
  expect((await $.command.run({ command: 'meatboy', args: 'music b', ...TYPED })).text).toBe('Meat Boy music: soundtrack B, Chapter One (chiptune).')
  // Muted, choosing B plays nothing until sound comes back.
  expect(loops).toHaveLength(5)
  await $.command.run({ command: 'meatboy', args: 'mute', ...TYPED })
  expect(loops.at(-1)).toBe('sounds/music-b.wav')
  expect(loops).toHaveLength(6)
  await ui.unmount()
})

test('with the world board out of reach and nothing saved, scores says why', async ($, on) => {
  mock.store(on)
  on('http.fetch', () => {
    throw new Error('refused: nonessential network traffic is disabled for this session')
  })
  const scores = await $.command.run({ command: 'meatboy', args: 'scores', ...TYPED })
  expect(scores.text).toMatch(/this machine only. The world board is out of reach: [^\n]+\nThe board is empty/)
})

test('runs and best times saved on other levels are left behind', async ($, on) => {
  // As the store was before 1-6: a board under its old key, and best times by level number.
  mock.store(on, { board: [{ handle: 'JJR', ms: 20000, deaths: 2 }], best: { '0': { ms: 3300, deaths: 0 }, '1': { ms: 3200, deaths: 0 } } })
  paneOpen(on)
  const scores = await $.command.run({ command: 'meatboy', args: 'scores', ...TYPED })
  expect(scores.text).toMatch(/The board is empty/)
  const ui = await $.ui.mount({ plugin: 'meatboy', surface: 'terminal', component: 'Pane', requestId: 'meat-boy', props: PANE })
  await ui.resize({ columns: 80, rows: MAP_ROWS + 2 })
  await ui.advance(33)
  expect(await ui.find({ in: 'game', text: /pick a level/ })).toBeUndefined()
  expect(await ui.find({ in: 'game', text: /par 5\.20s/ })).toBeDefined()
  await ui.unmount()
})
