// Claude as Meat Boy: Clawd from Claude Code's banner at twice its size, with Meat Boy's narrowed eyes and grin.
// 18 x 12 pixels facing right, drawn two pixels to a cell with ▀. '.' is clear.
export const CLAUDE = 0xd77757

export const PALETTE: Record<string, number> = {
  O: CLAUDE, // Clawd's orange, as the banner draws it
  K: 0x000000, // eyes and grin, black as the banner's eyes
}
export const ART = [
  '..OOOOOOOOOOOOOO..',
  '..OOOOOOOOOOOOOO..',
  '..OOKOOOOOOOOKOO..',
  '..OOKKOOOOOOKKOO..',
  'OOOOKKOOOOOOKKOOOO',
  'OOOOOOOOOOOOOOOOOO',
  '..OOOKOOOOOOKOOO..',
  '..OOOOKKKKKKOOOO..',
  '..OOOOOOOOOOOOOO..',
  '..O.O........O.O..',
  '..O.O........O.O..',
  '..................',
]

// Dr. Fetus in his jar, 10 x 10 pixels: the dr-fetus mod's encounter art cut down to fit a level.
export const FETUS_PALETTE: Record<string, number> = {
  M: 0x5b616b, // jar base and lid
  m: 0x8c939e, // jar rim
  g: 0x9fd3e6, // glass
  h: 0xd8f3ff, // glass highlight
  l: 0x2f7d5d, // the liquid
  p: 0xf2a1a8, // his head
  d: 0xd97f8e, // his body
  k: 0x151515, // top hat and brows
  e: 0x151515, // eyes
  y: 0xffd23f, // monocle
  w: 0xffffff, // teeth
}
export const FETUS = [
  '.MMMMMMMM.',
  'glllkklllg',
  'ghkkkkkklg',
  'ghpkppyypg',
  'ghpeppyeyg',
  'glpwkwkppg',
  'glllddlllg',
  'gllldddllg',
  'mmmmmmmmmm',
  '.MMMMMMMM.',
]

// Clawd hugging: eyes closed into happy arcs.
export const ART_HAPPY = ART.map((row, y) =>
  y === 2 ? '..OOOOOOOOOOOOOO..' : y === 3 ? '..OOOKOOOOOOKOOO..' : y === 4 ? 'OOOOKOKOOOOKOKOOOO' : row,
)
// His right arm alone, drawn last in a hug so it wraps around her.
export const ART_ARM = ART.map((row, y) => (y === 4 || y === 5 ? '................OO' : '.'.repeat(row.length)))

// Bandage Girl, 18 x 12 pixels facing left: Clawd's build in pink, with a bandage bow and headband.
export const BANDAGE_PALETTE: Record<string, number> = {
  P: 0xff7aa8, // her pink
  W: 0xfff4e8, // bandages
  K: 0x000000, // eyes and smile
  r: 0xe0457b, // blush
}
export const BANDAGE_ART = [
  '.....WWW..WWW.....',
  '..PPPPPPWWPPPPPP..',
  '..PWWWWWWWWWWWWP..',
  '..PPPPPPPPPPPPPP..',
  'PPPPKKPPPPPPKKPPPP',
  'PPPPKKPPPPPPKKPPPP',
  '..PrPPKPPPPKPPrP..',
  '..PPPPPKKKKPPPPP..',
  '..PPPPPPPPPPPPPP..',
  '..P.P........P.P..',
  '..P.P........P.P..',
  '..................',
]
export const BANDAGE_HAPPY = BANDAGE_ART.map((row, y) => (y === 5 ? 'PPPKPPKPPPPKPPKPPP' : row))

// A walking step: the legs shift one pixel inward on alternate steps.
export const step2 = (art: string[]) => art.map((row, y) => (y === 9 || y === 10 ? '...' + row.slice(2, 5) + '......' + row.slice(13, 16) + '...' : row))
