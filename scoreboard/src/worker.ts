// The Claude Meatboy world board: POST /runs replays a run and stores it, GET /top lists the ten fastest, GET / shows them as a page.

import { LEVELS } from '../../hooks/levels'
import { ART, BANDAGE_ART, BANDAGE_PALETTE, FETUS, FETUS_PALETTE, PALETTE } from '../../hooks/sprite'
import { verify } from '../../hooks/verify'

type Env = { DB: D1Database }

const json = (body: unknown, status = 200) => Response.json(body, { status })
const TOP = 'SELECT handle, ms, deaths FROM runs ORDER BY ms, deaths LIMIT 10'
type Row = { handle: string; ms: number; deaths: number }

// A buzzsaw, 12 x 12 pixels, for Clawd to jump.
const SAW = [
  '.....TT.....',
  '..T.TWWT.T..',
  '..TWWWWWWT..',
  '.TWWGGGGWWT.',
  '.WWGGGGGGWW.',
  'TWGGGDDGGGWT',
  'TWGGGDDGGGWT',
  '.WWGGGGGGWW.',
  '.TWWGGGGWWT.',
  '..TWWWWWWT..',
  '..T.TWWT.T..',
  '.....TT.....',
]
const SAW_PALETTE: Record<string, number> = { T: 0xc8c8d0, W: 0xe8e8ee, G: 0xa8a8b4, D: 0x55555f }

// Pixel art as an SVG, one rect per run of a color in a row; '.' is clear. `pad` adds clear rows to square it.
function pixels(art: string[], palette: Record<string, number>, pad = 0): string {
  const w = art[0]?.length ?? 0
  let rects = ''
  art.forEach((row, y) => {
    for (let x = 0; x < w; ) {
      const c = row[x] ?? '.'
      let n = 1
      while (row[x + n] === c) n++
      const color = palette[c]
      if (color !== undefined) rects += `<rect x="${x}" y="${y + pad}" width="${n}" height="1" fill="#${color.toString(16).padStart(6, '0')}"/>`
      x += n
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${art.length + pad * 2}" shape-rendering="crispEdges">${rects}</svg>`
}

const CLAWD_SVG = pixels(ART, PALETTE)
// Square for the browser tab: Clawd's 18 x 12 with 3 clear rows above and below.
const ICON = `data:image/svg+xml,${encodeURIComponent(pixels(ART, PALETTE, 3))}`

// Handles need no escaping: verify admits only letters, digits and underscores.
function page(rows: Row[]): string {
  const body = rows.length === 0
    ? `<p>No runs yet.<br>Clear 1-1 through 1-${LEVELS.length} in one run to be first.</p>`
    : `<table>${rows.map((r, n) => `<tr><td>${n + 1}.</td><td>@${r.handle}</td><td>${(r.ms / 1000).toFixed(2)}s</td><td>☠ ${String(r.deaths).padStart(3)}</td></tr>`).join('')}</table>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Meatboy: global leaderboard</title><link rel="icon" href="${ICON}"><style>
body{margin:0;min-height:100vh;background:linear-gradient(#1b1030,#b4553a);color:#f3e9dc;font:16px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;display:flex;justify-content:center}
main{padding:48px 20px;width:min(520px,100%);box-sizing:border-box}h1{color:#d77757;font-size:28px;margin:0 0 4px}
.sub{margin:0 0 28px;opacity:.85}table{border-collapse:collapse;width:100%}td{padding:6px 10px;border-bottom:1px solid #f3e9dc33}
td:nth-child(3),td:nth-child(4){text-align:right;white-space:pre}tr:first-child td{color:#ffd23f}a{color:#ff7aa8}
@media (max-width:480px){td{padding:6px 5px}.sub{font-size:14px}}@media (max-width:360px){table{font-size:14px}}
main{position:relative}.stage{--px:6px}.scene{position:absolute;top:150px;width:calc(36*var(--px));height:calc(40*var(--px))}
.scene div{position:absolute}.scene svg{display:block;width:100%}.left{left:calc(-36*var(--px) - 40px)}.right{right:calc(-36*var(--px) - 40px)}
.floor{left:0;right:0;bottom:0;height:calc(3*var(--px));background:#5a3825;border-top:var(--px) solid #6fbf3f}
.left{overflow:hidden}.clawd{width:calc(18*var(--px));left:calc(9*var(--px));bottom:calc(4*var(--px));animation:hop 1.6s linear infinite}
.saw{width:calc(10*var(--px));left:0;bottom:calc(4*var(--px));animation:roll 1.6s linear infinite}
.saw svg{animation:spin .35s linear infinite reverse}
.kidnap{left:0;top:calc(3*var(--px));width:calc(18*var(--px));height:calc(30*var(--px));animation:bob 1.6s ease-in-out infinite}
.fetus{width:calc(14*var(--px));left:calc(2*var(--px));top:0}.rope{left:calc(9*var(--px) - 1px);top:calc(14*var(--px));width:2px;height:calc(3*var(--px));background:#c8c8d0}
.girl{width:calc(18*var(--px));left:0;top:calc(17*var(--px));transform-origin:50% 0;animation:swing 1.6s ease-in-out infinite}
.help{left:calc(17*var(--px));top:calc(25*var(--px));padding:2px 8px;border-radius:10px;background:#fff4e8;color:#e0457b;font-weight:700;font-size:14px;line-height:1.4}
.help:before{content:"";position:absolute;left:-5px;top:7px;border:5px solid transparent;border-right-color:#fff4e8;border-left:0}
@keyframes hop{0%,20%{transform:translateY(0);animation-timing-function:ease-out}45%{transform:translateY(calc(-20*var(--px)));animation-timing-function:ease-in}70%,100%{transform:translateY(0)}}
@keyframes roll{from{transform:translateX(calc(48*var(--px)))}to{transform:translateX(calc(-30*var(--px)))}}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(-2*var(--px)))}}
@keyframes swing{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
@media (max-width:1120px){.stage{--px:4px;position:relative;height:calc(40*var(--px));margin:0 0 24px}.left{left:calc(6*var(--px))}.right{right:0}.scene{top:0}}
@media (prefers-reduced-motion:reduce){.stage *{animation:none!important}}
</style></head><body><main><h1>Claude Meatboy</h1><p class="sub">Global leaderboard.<br>Every run is replayed before it counts.<br><a href="https://github.com/jroethel/claude-meatboy">Play it in Claude Code</a></p>
<div class="stage" aria-hidden="true"><div class="scene left"><div class="saw">${pixels(SAW, SAW_PALETTE)}</div><div class="clawd">${CLAWD_SVG}</div><div class="floor"></div></div>
<div class="scene right"><div class="kidnap"><div class="fetus">${pixels(FETUS, FETUS_PALETTE)}</div><div class="rope"></div><div class="girl">${pixels(BANDAGE_ART, BANDAGE_PALETTE)}</div><div class="help">help!</div></div></div></div>
${body}</main></body></html>`
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (request.method === 'GET' && pathname === '/top') {
      const { results } = await env.DB.prepare(TOP).all()
      return json(results)
    }
    if (request.method === 'GET' && pathname === '/') {
      const { results } = await env.DB.prepare(TOP).all<Row>()
      return new Response(page(results), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    if (request.method === 'POST' && pathname === '/runs') {
      const text = await request.text()
      if (text.length > 100_000) return json({ error: 'too large' }, 413)
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        return json({ error: 'not JSON' }, 400)
      }
      const checked = verify(body)
      if ('error' in checked) return json(checked, 422)
      const { handle, ms, deaths, levels } = checked.run
      await env.DB.prepare('INSERT INTO runs (handle, ms, deaths, levels) VALUES (?, ?, ?, ?)').bind(handle, ms, deaths, JSON.stringify(levels)).run()
      return json({ ms }, 201)
    }
    return json({ error: 'not found' }, 404)
  },
}
