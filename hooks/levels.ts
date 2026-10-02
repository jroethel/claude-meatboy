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
  frame('Wall Flower', 5600, [
    '',
    '',
    '          #             S  B',
    '          #    ###############',
    '          #    #',
    '          #    #',
    '          #    #',
    '          #    #',
    '          #    #',
    '          #    #',
    'P              #',
    '################SSSSSSSSSSSSSSSSSSSSSS',
  ]),
  frame('Buzzsaw Boulevard', 6200, [
    '',
    '',
    '',
    '',
    '            V            V',
    '',
    '                                   B',
    '                                  ###',
    'P    #     H    #      H     #',
    '###########   #########   ###########',
    '###########SSS#########SSS###########',
    '######################################',
  ]),
  frame('Crumble Alley', 5400, [
    '',
    '',
    '',
    '',
    '',
    '              S         S',
    '',
    'P                                   B',
    '####  ===  ===  ===  ===  ===  ===  ##',
    '',
    '',
    'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  ]),
  frame('Fetus Fury', 9000, [
    '                              V  #####',
    '  B                              #####',
    '##### ===  ===  ===  === ###     #####',
    '                            #    #####',
    '                            #    #####',
    '                            #    #####',
    '                            #    #####',
    '                            #    #####',
    'P     S     #   H   #            #####',
    '########   ##########   ##############',
    '########SSS##########SSS##############',
    '######################################',
  ]),
]
