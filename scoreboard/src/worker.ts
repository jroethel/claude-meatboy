// The Claude Meatboy world board: POST /runs replays a run and stores it, GET /top lists the ten fastest, GET / shows them as a page.

import { LEVELS } from '../../hooks/levels'
import { verify } from '../../hooks/verify'

type Env = { DB: D1Database }

const json = (body: unknown, status = 200) => Response.json(body, { status })
const TOP = 'SELECT handle, ms, deaths FROM runs ORDER BY ms, deaths LIMIT 10'
type Row = { handle: string; ms: number; deaths: number }

// Handles need no escaping: verify admits only letters, digits and underscores.
function page(rows: Row[]): string {
  const body = rows.length === 0
    ? `<p>No runs yet.<br>Clear 1-1 through 1-${LEVELS.length} in one run to be first.</p>`
    : `<table>${rows.map((r, n) => `<tr><td>${n + 1}.</td><td>@${r.handle}</td><td>${(r.ms / 1000).toFixed(2)}s</td><td>☠ ${String(r.deaths).padStart(3)}</td></tr>`).join('')}</table>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Meatboy: global leaderboard</title><style>
body{margin:0;min-height:100vh;background:linear-gradient(#1b1030,#b4553a);color:#f3e9dc;font:16px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;display:flex;justify-content:center}
main{padding:48px 20px;width:min(520px,100%);box-sizing:border-box}h1{color:#d77757;font-size:28px;margin:0 0 4px}
.sub{margin:0 0 28px;opacity:.85}table{border-collapse:collapse;width:100%}td{padding:6px 10px;border-bottom:1px solid #f3e9dc33}
td:nth-child(3),td:nth-child(4){text-align:right;white-space:pre}tr:first-child td{color:#ffd23f}a{color:#ff7aa8}
@media (max-width:480px){td{padding:6px 5px}}
</style></head><body><main><h1>Claude Meatboy</h1><p class="sub">Global leaderboard.<br>Every run is replayed before it counts.<br><a href="https://github.com/jroethel/claude-meatboy">Play it in Claude Code</a></p>
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
