interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const ALLOWED_HOSTS = ['edtweb.univ-cotedazur.fr']
const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 8000

interface RawEvent {
  summary?: string
  start?: string
  end?: string
  location?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function unfold(text: string): string[] {
  const lines: string[] = []
  for (const line of text.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()
}

function parse(text: string) {
  const events: RawEvent[] = []
  let current: RawEvent | null = null
  let hasRecurrence = false
  let hasTzid = false

  for (const line of unfold(text)) {
    const marker = line.trim().toUpperCase()
    if (marker === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (marker === 'END:VEVENT') {
      if (current) events.push(current)
      current = null
      continue
    }
    if (!current) continue

    const idx = line.indexOf(':')
    if (idx < 0) continue
    const head = line.slice(0, idx)
    const value = line.slice(idx + 1)
    const name = head.split(';')[0].toUpperCase()

    if (name === 'SUMMARY') current.summary = unescapeText(value)
    else if (name === 'LOCATION') current.location = unescapeText(value)
    else if (name === 'DTSTART') {
      current.start = value
      if (/TZID=/i.test(head)) hasTzid = true
    } else if (name === 'DTEND') current.end = value
    else if (name === 'RRULE') hasRecurrence = true
  }

  return { events, hasRecurrence, hasTzid }
}

async function handleIcsTest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405)

  let target: URL
  try {
    const body = (await request.json()) as { url?: string }
    target = new URL(String(body.url ?? '').trim())
  } catch {
    return json({ ok: false, reason: 'bad_url' }, 400)
  }

  if (target.protocol !== 'https:') return json({ ok: false, reason: 'https_only' }, 400)
  if (!ALLOWED_HOSTS.includes(target.hostname)) {
    return json({ ok: false, reason: 'host_not_allowed', host: target.hostname }, 403)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'user-agent': 'Calendraft/1.0 (+https://calendraft.fr)',
        accept: 'text/calendar, text/plain, */*',
      },
    })

    const contentType = res.headers.get('content-type') ?? ''

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? ''
      let redirectHost = ''
      try {
        redirectHost = new URL(location, target).hostname
      } catch {
        redirectHost = 'inconnu'
      }
      return json({ ok: false, reason: 'redirect', status: res.status, redirectHost })
    }

    if (!res.ok) return json({ ok: false, reason: 'http_error', status: res.status, contentType })

    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_BYTES) return json({ ok: false, reason: 'too_large', status: res.status })

    const text = await res.text()
    if (text.length > MAX_BYTES) return json({ ok: false, reason: 'too_large', status: res.status })

    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return json({
        ok: false,
        reason: 'not_ics',
        status: res.status,
        contentType,
        startsWith: text.slice(0, 80).replace(/\s+/g, ' '),
      })
    }

    const { events, hasRecurrence, hasTzid } = parse(text)
    const days = events
      .map((e) => e.start?.slice(0, 8))
      .filter((d): d is string => !!d && /^\d{8}$/.test(d))
      .sort()

    return json({
      ok: true,
      status: res.status,
      contentType,
      bytes: text.length,
      eventCount: events.length,
      hasRecurrence,
      hasTzid,
      earliest: days[0] ?? null,
      latest: days[days.length - 1] ?? null,
      sample: events.slice(0, 3),
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return json({ ok: false, reason: timedOut ? 'timeout' : 'network_error' })
  } finally {
    clearTimeout(timer)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname === '/api/ics-test') return handleIcsTest(request)
    if (pathname.startsWith('/api/')) return json({ ok: false, reason: 'not_found' }, 404)

    return env.ASSETS.fetch(request)
  },
}
