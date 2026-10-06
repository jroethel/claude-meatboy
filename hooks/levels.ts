// Chapter 1. Each level is its interior: the frame of solid tiles is added here.
// # ground   = crumbles a moment after you land   S saw   H saw on patrol   V saw on a lift
// P Meat Boy   B Bandage Girl. `par` is the A+ time in milliseconds.

export type LevelDef = { name: string; par: number; rows: string[] }

const WIDTH = 40

function frame(name: string, par: number, interior: string[]): LevelDef {
  const edge = '#'.repeat(WIDTH)
  const rows = interior.map(row => {
    if (row.length > WIDTH - 2) throw new Error(`${name}: a row is ${row.length} wide`)
    return `#${row.padEnd(WIDTH - 2)}#`
  })
  return { name, par, rows: [edge, ...rows, edge] }
}

export const LEVELS: LevelDef[] = [
  frame('Hello World', 5200, [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                                    B',
    'P                       S        #####',
    '######   ######     #######   ########',
    '######SSS######SSSSS#######SSS########',
    '######################################',
  ]),
  frame('Wall Flower', 6000, [
    '                                 #####',
    '                                 #####',
    '                            ##   #####',
    '                       #    ##   #####',
    '                       #    ##   #####',
    '                       #    ##   #####',
    '                       #    ##   #####',
    '                       #    ##     SSS',
    '                       #    ##',
    '                       #    ##       B',
    '                       #    ##     ###',
    '                       #    ##',
    '               ###     #    ##',
    'P              ###          ##',
    '##################  ##########',
    '##################SS##########SSSSSSSS',
  ]),
  frame('Buzzsaw Boulevard', 9100, [
    '',
    '                        V',
    '',
    '                                 #',
    '     V                           #',
    '                                 #',
    '                                 #',
    '                                 #',
    ' B       #   H    #              #',
    '##################################',
    '                                 #',
    '                                 #',
    '                        V        #',
    '                                 #',
    '                                 #',
    'P           #  H    #',
    '########   ############   ############',
    '########SSS############SSS############',
  ]),
  frame('Crumble Alley', 8500, [
    '            V             V',
    '',
    '     S            S             S',
    '',
    '            #             #',
    ' B',
    '####   ===      =   ====      =    ###',
    '####                               ###',
    '                                   ###',
    '                                 ==',
    '',
    '',
    '                             ==',
    '',
    '',
    '                         ==',
    'P',
    '####   ==   =   ==   =',
    '####',
    '####SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  ]),
  frame('Chutes and Ladders', 9000, [
    '             #S                  #####',
    '             #S                  #####',
    '             #S                  #####',
    '     ##      #S                  #####',
    'S    ##      #S  S     #####     S####',
    'S    ##      #S  #       ###     S####',
    'S    ##S    S#S      S  S###     S####',
    'S    ##S    S#S      #  S###     S####',
    'S    ##S    S#S  S      S###     S####',
    'S    ##S    S#S  #      S###   SS#####',
    'S    ##S    S#S      S  S###     SS###',
    'S    ##S    S#S      #  S###       SS#',
    'S    ###S    SS  S      S###S        S',
    'S    ###S    SS  #      S###S',
    'S    ###S    SS      S  S###S',
    'S    ####S    S      #  S####S',
    'S    ####S    S  S      S####S',
    'S    ####S    S  #      S####S',
    'S    #####S          S  S#####S',
    'S    #####S          #  S#####S',
    '     #####S             S#####SSS    B',
    '  P  #################################',
    '######################################',
    '######################################',
  ]),
  frame('Fetus Fury', 13600, [
    '',
    '',
    '',
    '',
    '',
    '              S       S',
    '    #',
    'H   #',
    '    #                           # H #B',
    '    ####### =   =   =   =   = ########',
    '    #      SSSSSSSSSSSSSSSSSSS',
    '    #',
    '   H#    V',
    '    #',
    '',
    '',
    '#############=  ==  =  ==  =######',
    '             SSSSSSSSSSSSSSS     #',
    '                                 #',
    '                                 #   H',
    '                       V         #',
    '                                 #',
    'P           #  H   #',
    '#######   ############   #############',
    '#######   ############   #############',
    '#######SSS############SSS#############',
  ]),
]

// The tallest level's rows: the map's height in the pane.
export const MAP_ROWS = Math.max(...LEVELS.map(l => l.rows.length))

// A level's best time is stored under its number and a hash of its rows, so a level that changes starts with none.
export const levelKey = (n: number): string => `${n}:${fnv(LEVELS[n]?.rows.join('/') ?? '')}`
// The local board is stored under a hash of every level: runs on other levels don't compare.
export const BOARD_KEY = `board:${fnv(LEVELS.map(l => l.rows.join('/')).join('|'))}`

function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}
