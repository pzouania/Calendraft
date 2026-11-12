import { supabase } from './supabaseClient'

// Réglage « afficher les jours fériés » d'un calendrier (colonne calendars.public_holidays, voir public_holidays.sql).
export type FlagRead = { ok: true; enabled: boolean } | { ok: false; unavailable: boolean }
export type FlagSave = { ok: true; enabled: boolean } | { ok: false; message: string; unavailable: boolean }

function isMissingColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === '42703') return true
  return /public_holidays/.test(error.message ?? '') && /(column|schema cache)/i.test(error.message ?? '')
}

// Lecture à part du reste du calendrier : si la colonne manque encore, le calendrier s'ouvre quand même (sans jours fériés).
export async function fetchPublicHolidays(calendarId: string): Promise<FlagRead> {
  try {
    const { data, error } = await supabase.from('calendars').select('public_holidays').eq('id', calendarId).maybeSingle()
    if (error) return { ok: false, unavailable: isMissingColumn(error) }
    return { ok: true, enabled: (data as { public_holidays?: unknown } | null)?.public_holidays === true }
  } catch {
    return { ok: false, unavailable: false }
  }
}

// Réservé au propriétaire (règles de la base). Le résultat est relu : une mise à jour refusée ne renvoie aucune ligne.
export async function savePublicHolidays(calendarId: string, enabled: boolean): Promise<FlagSave> {
  try {
    const { data, error } = await supabase
      .from('calendars')
      .update({ public_holidays: enabled, updated_at: new Date().toISOString() })
      .eq('id', calendarId)
      .select('public_holidays')
    if (error) return { ok: false, message: error.message ?? '', unavailable: isMissingColumn(error) }
    const row = ((data ?? []) as { public_holidays?: unknown }[])[0]
    if (!row) return { ok: false, message: '', unavailable: false }
    return { ok: true, enabled: row.public_holidays === true }
  } catch {
    return { ok: false, message: '', unavailable: false }
  }
}
