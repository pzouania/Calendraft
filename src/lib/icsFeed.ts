import { supabase } from './supabaseClient'
import type { FeedSourceEvent } from './icsExport'

// Emploi du temps en ligne d'un calendrier, pour le fichier .ics : les événements tels que l'école les a écrits (début et fin
// réels, un événement de plusieurs jours reste entier), lus par le serveur Cloudflare (worker/index.ts, format « source »).
// L'adresse du flux ne passe jamais par ici : seul le serveur la connaît.

export type ImportedFeed =
  // Pas d'emploi du temps relié (ou personne de connecté).
  | { state: 'none' }
  // Événements lus ; staleAt = date de la dernière copie si le site de l'école ne répondait pas (sinon null) ;
  // recurring = nombre d'événements répétés de l'école (ils ne sont comptés qu'une fois, comme à l'écran).
  | { state: 'ok'; events: FeedSourceEvent[]; recurring: number; staleAt: string | null }
  // Site de l'école injoignable et aucune copie, réponse illisible ou serveur pas à jour.
  | { state: 'error' }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const MAX_EVENTS = 5000

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function timeOf(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' && TIME_RE.test(value) ? value : undefined
}

// Un événement bien formé, ou null : une ligne illisible est ignorée, elle ne fait pas échouer tout l'emploi du temps.
function toEvent(raw: unknown): FeedSourceEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  if (typeof e.startDate !== 'string' || !DAY_RE.test(e.startDate) || typeof e.endDate !== 'string' || !DAY_RE.test(e.endDate)) return null
  const startTime = timeOf(e.startTime)
  const endTime = timeOf(e.endTime)
  if (startTime === undefined || endTime === undefined) return null
  return { uid: textOf(e.uid), title: textOf(e.title), location: textOf(e.location), startDate: e.startDate, startTime, endDate: e.endDate, endTime }
}

// Lit les événements importés entre deux jours (AAAA-MM-JJ, inclus).
export async function fetchImportedEvents(calendarId: string, from: string, to: string, signal?: AbortSignal): Promise<ImportedFeed> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { state: 'none' }

    const res = await fetch('/api/feed/events', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ calendarId, from, to, format: 'source' }),
    })
    const body: unknown = await res.json().catch(() => null)
    if (typeof body !== 'object' || body === null) return { state: 'error' }
    const b = body as Record<string, unknown>

    if (b.ok === true && b.configured === false) return { state: 'none' }
    if (b.ok !== true || b.configured !== true || !Array.isArray(b.events)) return { state: 'error' }

    const events: FeedSourceEvent[] = []
    for (const raw of b.events.slice(0, MAX_EVENTS)) {
      const e = toEvent(raw)
      if (e) events.push(e)
    }
    // Des événements reçus mais aucun lisible : serveur pas à jour (ancien format par jour) ou réponse abîmée.
    if (b.events.length > 0 && events.length === 0) return { state: 'error' }

    return {
      state: 'ok',
      events,
      recurring: typeof b.recurring === 'number' && Number.isFinite(b.recurring) && b.recurring > 0 ? Math.floor(b.recurring) : 0,
      staleAt: b.stale === true && typeof b.snapshotAt === 'string' ? b.snapshotAt : null,
    }
  } catch {
    return { state: 'error' }
  }
}
