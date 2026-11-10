import { supabase } from './supabaseClient'
import { parseZone, type SchoolZone } from './schoolHolidays'

// Zone de vacances scolaires d'un calendrier (colonne calendars.school_zone, voir school_holidays.sql).

export const ZONE_UNAVAILABLE =
  'Les vacances scolaires ne sont pas encore activées sur le serveur (le script SQL school_holidays.sql doit être exécuté dans Supabase).'

const NETWORK_ERROR = 'Erreur réseau. Réessayez dans un instant.'
const NOT_OWNER = 'Seul le propriétaire du calendrier peut changer la zone de vacances.'

// La colonne n'existe pas encore dans la base (le script SQL n'a pas été exécuté).
export function isMissingZoneColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === '42703') return true
  const message = error.message ?? ''
  return /school_zone/.test(message) && /(column|schema cache)/i.test(message)
}

export type ZoneRead = { ok: true; zone: SchoolZone | null } | { ok: false; unavailable: boolean }
export type ZoneSave = { ok: true; zone: SchoolZone | null } | { ok: false; message: string }

// Lecture à part du reste du calendrier : si la colonne manque encore, le calendrier s'ouvre quand même (sans vacances).
export async function fetchSchoolZone(calendarId: string): Promise<ZoneRead> {
  try {
    const { data, error } = await supabase.from('calendars').select('school_zone').eq('id', calendarId).maybeSingle()
    if (error) return { ok: false, unavailable: isMissingZoneColumn(error) }
    return { ok: true, zone: parseZone((data as { school_zone?: unknown } | null)?.school_zone) }
  } catch {
    return { ok: false, unavailable: false }
  }
}

// Réservé au propriétaire (règles de la base). Le résultat est relu : une mise à jour refusée ne renvoie aucune ligne.
export async function saveSchoolZone(calendarId: string, zone: SchoolZone | null): Promise<ZoneSave> {
  try {
    const { data, error } = await supabase
      .from('calendars')
      .update({ school_zone: zone, updated_at: new Date().toISOString() })
      .eq('id', calendarId)
      .select('school_zone')
    if (error) return { ok: false, message: isMissingZoneColumn(error) ? ZONE_UNAVAILABLE : error.message || NETWORK_ERROR }
    const row = ((data ?? []) as { school_zone?: unknown }[])[0]
    if (!row) return { ok: false, message: NOT_OWNER }
    return { ok: true, zone: parseZone(row.school_zone) }
  } catch {
    return { ok: false, message: NETWORK_ERROR }
  }
}

// Zone d'un calendrier partagé par lien (la personne n'a pas de compte : fonction publique de la base). null si inconnue.
export async function fetchLinkSchoolZone(token: string): Promise<SchoolZone | null> {
  try {
    const { data, error } = await supabase.rpc('get_link_school_zone', { p_token: token })
    if (error) return null
    return parseZone(data)
  } catch {
    return null
  }
}
