// The Meat Boy world board: POST /runs replays a run and stores it, GET /top lists the ten fastest.

import { verify } from '../../hooks/verify'

type Env = { DB: D1Database }

const json = (body: unknown, status = 200) => Response.json(body, { status })

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (request.method === 'GET' && pathname === '/top') {
      const { results } = await env.DB.prepare('SELECT handle, ms, deaths FROM runs ORDER BY ms, deaths LIMIT 10').all()
      return json(results)
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
