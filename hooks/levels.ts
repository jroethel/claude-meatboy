// Chapter 1. Each level is its interior: the frame of solid tiles is added here.
// # ground   = crumbles a moment after you land   S saw   H saw on patrol   V saw on a lift
// > < belt carrying right or left   0-9 guillotine, its digit how many tenths of a cycle it runs ahead
// ~ platform sliding along its - track   ^ lift riding its : track (above and below its first tile)
// | steel: stand on it, but it can't be clung to or kicked off   * ground marked gold: a ledge on the fastest route
// A spikes   a-j guillotine like 0-9, but hanging up longer each cycle
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
  frame('Wall Flower', 5800, [
    '                                 #####',
    '                                 #####',
    '                            ##   #####',
    '                       #    ##   #####',
    '                       #    ##   #####',
    '        V              #    ##   #####',
    '                       #    ##   #####',
    '                       #    ##     SSS',
    '                       #    ##',
    '            H          #    ##       B',
    '                       #    ##     ###',
    '                       #    ##',
    '               ###     #    ##',
    'P              ###          ##',
    '##################  ##########',
    '##################SS##########AAAAAAAA',
  ]),
  frame('Buzzsaw Boulevard', 9200, [
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
    '                                 #  H',
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
    '####AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  ]),
  frame('Chutes and Ladders', 10700, [
    '                    ##',
    '                    ##',
    '                    ##',
    '                    ##',
    '      ########      ##      ####',
    '|     ########      #|S     ####',
    '|     #######S      S|#     |###S    S',
    '|     ########      #|     S|###S    S',
    '|     #######      ##|     *|###S    S',
    '|     #######      ##|S     |### H',
    '|     #######      ##|*     |###S    S',
    '|     ######      ###|     S|###S    S',
    '|     ######      ###|     #|###S    S',
    '|     ######      ###|S     |###S    S',
    '|     ##### H    ####|*     |###S    S',
    '|     #####      ####|     S|###S    S',
    '|     #####      ####|     *|###S    S',
    '|     ####      #####|S     |###S    S',
    '|     ####      ######*     |###S    S',
    '|  S######      ######     S|###S    S',
    '|  #  |##      #######     #|###S    S',
    '|     |#S      S######      |###S    S',
    '|     |##                   |###S    S',
    '|  P  |#                    ####  B',
  ]),
  frame('Fetus Fury', 16000, [
    '',
    '                                     B',
    '                            :  |>>>>>>',
    '    #                       :',
    '    #                       :',
    '    #                       :',
    '    #             ~~~------ :',
    'H   #       S  S            :',
    '    #       S##S            :',
    '    #                       ^^',
    '    #AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    '    ##################################',
    '   H#   6  5  4     3  2  1',
    '    #',
    '',
    '',
    '######>>>>>>>>>>>#<<<<<<<<<<<#####',
    '3            SSSSSSSSSSSSSSS     #',
    '                                 #',
    '                                 #   H',
    '                      V          #',
    '              ##                 #',
    'P             ## H         #',
    '>>>####    ##########   ##############',
    '#######    ##########   ##############',
    '#######AAAA##########AAA##############',
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
