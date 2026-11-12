// Mode essai (sans compte) : l'éditeur fonctionne avec un faux « serveur » gardé en mémoire.
// Rien n'est envoyé à Supabase. Les données restent dans l'onglet (sessionStorage) : une actualisation garde l'essai,
// fermer l'onglet l'efface.
// Pendant le mode essai, les fonctions du client Supabase (from, rpc, auth) sont remplacées ; elles sont rétablies à la sortie.
import { supabase } from './supabaseClient'

export const GUEST_CALENDAR_ID = 'guest-calendar'
const GUEST_USER_ID = 'guest-user'

type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { message: string; code?: string } | null }

let active = false
let counter = 0
let tables: Record<string, Row[]> = {}
const STORE_KEY = 'calendraft.guest'
let saved: { from: unknown; rpc: unknown; getUser: unknown; getSession: unknown } | null = null

export function isGuest(): boolean {
  return active
}

function persist(): void {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ tables, counter }))
  } catch {
    // Stockage indisponible : l'essai reste en mémoire seulement.
  }
}

// Vrai si un essai est en cours dans cet onglet (avant une actualisation de la page).
export function hasStoredGuest(): boolean {
  try {
    return window.sessionStorage.getItem(STORE_KEY) !== null
  } catch {
    return false
  }
}

function newId(): string {
  counter += 1
  return `guest-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

function builder(table: string): any {
  const filters: ((row: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | Row[] | null = null
  let ordering: { column: string; ascending: boolean } | null = null
  let returning = false

  const run = (): Result => {
    const rows = (tables[table] ??= [])
    if (op === 'insert') {
      const made = (Array.isArray(payload) ? payload : [payload ?? {}]).map((row) => ({
        id: newId(),
        created_at: new Date().toISOString(),
        ...row,
      }))
      rows.push(...made)
      persist()
      return { data: returning ? made : null, error: null }
    }
    const hit = rows.filter((row) => filters.every((f) => f(row)))
    if (op === 'update') {
      hit.forEach((row) => Object.assign(row, payload))
      persist()
      return { data: returning ? hit : null, error: null }
    }
    if (op === 'delete') {
      tables[table] = rows.filter((row) => !hit.includes(row))
      if (table === 'periods') {
        const ids = hit.map((row) => row.id)
        tables.period_exceptions = (tables.period_exceptions ?? []).filter((e) => !ids.includes(e.period_id))
      }
      persist()
      return { data: returning ? hit : null, error: null }
    }
    const list = [...hit]
    if (ordering) {
      const { column, ascending } = ordering
      list.sort((a, b) => (String(a[column] ?? '') < String(b[column] ?? '') ? -1 : String(a[column] ?? '') > String(b[column] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
    }
    return { data: list, error: null }
  }

  const one = (required: boolean) => {
    const result = run()
    const row = result.data?.[0] ?? null
    return Promise.resolve({ data: row, error: row || !required ? null : { message: 'not found', code: 'PGRST116' } })
  }

  const q: any = {
    select: () => {
      returning = true
      return q
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value)
      return q
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]))
      return q
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      ordering = { column, ascending: options?.ascending !== false }
      return q
    },
    limit: () => q,
    insert: (value: Row | Row[]) => {
      op = 'insert'
      payload = value
      return q
    },
    update: (value: Row) => {
      op = 'update'
      payload = value
      return q
    },
    delete: () => {
      op = 'delete'
      return q
    },
    single: () => one(true),
    maybeSingle: () => one(false),
    then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  }
  return q
}

function install(): void {
  const client = supabase as any
  saved = { from: client.from, rpc: client.rpc, getUser: client.auth.getUser, getSession: client.auth.getSession }
  client.from = (table: string) => builder(table)
  client.rpc = async (name: string) =>
    name === 'check_event_slot' ? { data: null, error: null } : { data: null, error: { message: 'guest', code: 'guest' } }
  client.auth.getUser = async () => ({ data: { user: { id: GUEST_USER_ID, email: '' } }, error: null })
  client.auth.getSession = async () => ({ data: { session: null }, error: null })
  active = true
}

// Entrée dans le mode essai : un calendrier vide, créé en mémoire.
export function enterGuest(calendarName: string): void {
  if (active) return
  const now = new Date().toISOString()
  tables = {
    calendars: [
      { id: GUEST_CALENDAR_ID, user_id: GUEST_USER_ID, name: calendarName, icon: 'calendar', color: '#2563eb', year_mode: 'calendar', school_zone: null, created_at: now, updated_at: now },
    ],
    periods: [],
    period_exceptions: [],
  }
  install()
  persist()
}

// Reprise de l'essai après une actualisation de la page. Renvoie false s'il n'y a rien à reprendre.
export function restoreGuest(): boolean {
  if (active) return true
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as { tables?: Record<string, Row[]>; counter?: number }
    if (!data.tables || !Array.isArray(data.tables.calendars)) return false
    tables = data.tables
    counter = typeof data.counter === 'number' ? data.counter : 0
    install()
    return true
  } catch {
    return false
  }
}

// Sortie du mode essai : le client Supabase est rétabli et les données d'essai sont effacées.
export function leaveGuest(): void {
  if (!active || !saved) return
  const client = supabase as any
  client.from = saved.from
  client.rpc = saved.rpc
  client.auth.getUser = saved.getUser
  client.auth.getSession = saved.getSession
  saved = null
  tables = {}
  active = false
  try {
    window.sessionStorage.removeItem(STORE_KEY)
  } catch {
    // Rien à faire.
  }
}
