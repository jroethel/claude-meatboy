// The Claude Meatboy world board: POST /runs replays a run and stores it, GET /top lists the ten fastest, GET / shows them as a page.

import { LEVELS } from '../../hooks/levels'
import { ART, BANDAGE_ART, BANDAGE_PALETTE, FETUS, FETUS_PALETTE, PALETTE, step2 } from '../../hooks/sprite'
import { verify } from '../../hooks/verify'

type Env = { DB: D1Database }

const json = (body: unknown, status = 200) => Response.json(body, { status })
const TOP = 'SELECT handle, ms, deaths FROM runs ORDER BY ms, deaths LIMIT 10'
type Row = { handle: string; ms: number; deaths: number }

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

// Clawd mid-stride, racing right toward Bandage Girl.
const CLAWD_SVG = pixels(step2(ART), PALETTE)
// Square for the browser tab: Clawd's 18 x 12 with 3 clear rows above and below.
const ICON = `data:image/svg+xml,${encodeURIComponent(pixels(ART, PALETTE, 3))}`

// The X and GitHub marks, from simple-icons.
const X_PATH = 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z'
const GITHUB_PATH = 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'
const mark = (href: string, label: string, d: string) => `<a href="${href}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg></a>`

// Handles need no escaping: verify admits only letters, digits and underscores.
function page(rows: Row[]): string {
  const body = rows.length === 0
    ? `<p>No runs yet.<br>Clear 1-1 through 1-${LEVELS.length} in one run to be first.</p>`
    : `<table>${rows.map((r, n) => `<tr><td>${n + 1}.</td><td>@${r.handle}</td><td>${(r.ms / 1000).toFixed(2)}s</td><td>☠ ${String(r.deaths).padStart(3)}</td></tr>`).join('')}</table>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Meatboy: global leaderboard</title><link rel="icon" href="${ICON}"><style>
body{margin:0;min-height:100vh;background:linear-gradient(#1b1030,#b4553a);color:#f3e9dc;font:16px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;display:flex;justify-content:center}
main{padding:48px 20px;width:min(520px,100%);box-sizing:border-box}h1{color:#d77757;font-size:28px;margin:0 0 16px}h1 img{display:block;width:100%;height:auto;border-radius:6px}
.sub{margin:0 0 28px;opacity:.85;text-align:center}.sub small{font-size:13px;opacity:.75}table{border-collapse:collapse;width:100%}td{padding:6px 10px;border-bottom:1px solid #f3e9dc33}
tr:last-child td{border-bottom:0}td:nth-child(3),td:nth-child(4){text-align:right;white-space:pre}
.board{border:2px solid #f3e9dc55;border-radius:8px;padding:8px 10px}.board p{margin:8px 0}
.marks{display:flex;justify-content:center;gap:24px;margin-top:20px}.marks a{color:#f3e9dc;opacity:.85}.marks a:hover{opacity:1}.marks svg{display:block;width:14px;height:14px}tr:first-child td{color:#ffd23f}a{color:#ff7aa8}
@media (max-width:480px){td{padding:6px 5px}.sub{font-size:14px}}@media (max-width:360px){table{font-size:14px}}
main{position:relative}.stage{--px:6px}.scene{position:absolute;top:340px;width:calc(36*var(--px));height:calc(40*var(--px))}
.scene div{position:absolute}.scene svg{display:block;width:100%}.left{left:calc(-36*var(--px) - 40px)}.right{right:calc(-36*var(--px) - 40px)}
.floor{left:0;right:0;bottom:0;height:calc(3*var(--px));background:#5a3825;border-top:var(--px) solid #6fbf3f}
.clawd{width:calc(18*var(--px));left:calc(12*var(--px));bottom:calc(4*var(--px))}
.dash{height:var(--px);background:#f3e9dc;border-radius:var(--px)}
.kidnap{left:0;top:calc(3*var(--px));width:calc(18*var(--px));height:calc(30*var(--px));animation:bob 1.6s ease-in-out infinite}
.fetus{width:calc(14*var(--px));left:calc(2*var(--px));top:0}.rope{left:calc(9*var(--px) - 1px);top:calc(14*var(--px));width:2px;height:calc(3*var(--px));background:#c8c8d0}
.girl{width:calc(18*var(--px));left:0;top:calc(17*var(--px));transform-origin:50% 0;animation:swing 1.6s ease-in-out infinite}
.help{left:calc(17*var(--px));top:calc(25*var(--px));padding:2px 8px;border-radius:10px;background:#fff4e8;color:#e0457b;font-weight:700;font-size:14px;line-height:1.4}
.help:before{content:"";position:absolute;left:-5px;top:7px;border:5px solid transparent;border-right-color:#fff4e8;border-left:0}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(-2*var(--px)))}}
@keyframes swing{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
@media (max-width:1120px){.stage{--px:4px;position:relative;height:calc(40*var(--px));margin:0 0 24px}.left{left:0}.right{right:0}.scene{top:0}}
@media (prefers-reduced-motion:reduce){.stage *{animation:none!important}}
</style></head><body><main><h1><img src="https://raw.githubusercontent.com/jroethel/claude-meatboy/main/header.svg" alt="Claude Meatboy" width="1032" height="352"></h1><p class="sub">Global Leaderboard<br><small>(all runs are validated)</small><br><a href="https://github.com/jroethel/claude-meatboy">Play it - Get the Mod</a><br><a href="https://raw.githubusercontent.com/jroethel/claude-meatboy/main/screenshot.png">Screenshot</a></p>
<div class="stage" aria-hidden="true"><div class="scene left"><div class="dash" style="left:calc(4*var(--px));width:calc(8*var(--px));bottom:calc(12*var(--px));opacity:.7"></div><div class="dash" style="left:calc(1*var(--px));width:calc(10*var(--px));bottom:calc(9*var(--px));opacity:.45"></div><div class="dash" style="left:calc(6*var(--px));width:calc(6*var(--px));bottom:calc(6*var(--px));opacity:.6"></div><div class="clawd">${CLAWD_SVG}</div><div class="floor"></div></div>
<div class="scene right"><div class="kidnap"><div class="fetus">${pixels(FETUS, FETUS_PALETTE)}</div><div class="rope"></div><div class="girl">${pixels(BANDAGE_ART, BANDAGE_PALETTE)}</div><div class="help">help!</div></div></div></div>
<div class="board">${body}</div>
<nav class="marks">${mark('https://x.com/jeremyroethel', 'Jeremy Roethel on X', X_PATH)}${mark('https://github.com/jroethel', 'Jeremy Roethel on GitHub', GITHUB_PATH)}</nav></main></body></html>`
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
