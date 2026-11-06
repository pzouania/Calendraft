import { supabase } from './supabaseClient'
import { checkWithImported, parseLimitError, type FeedCache, type ImportedNotice, type SlotConflict } from './slotLimit'
import type { PeriodDraft } from './rhythmTemplates'

// Ajoute les événements d'un modèle de rythme au calendrier, en une seule opération : si l'un d'eux est refusé
// (limite atteinte, droit manquant, réseau), aucun n'est créé.

export type CreateResult =
  | { ok: true; count: number; notice: string | null }
  | { ok: false; message: string }

function longDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function conflictMessage(conflict: SlotConflict): string {
  const names = Array.from(new Set(conflict.blockers.map((b) => b.name))).slice(0, 3)
  const when = conflict.date ? ` le ${longDate(conflict.date)}` : ''
  const who = names.length > 0 ? ` (avec ${names.map((n) => `« ${n} »`).join(', ')})` : ''
  return `Ce modèle ferait dépasser la limite de 3 événements à horaire précis en même temps${when}${who}. Supprimez ou déplacez un de ces événements, puis recommencez.`
}

function importedNotice(kind: ImportedNotice): string {
  return kind === 'unreachable'
    ? "L'emploi du temps importé ne répond pas : ses événements n'ont pas été comptés dans la limite de 3 événements en même temps."
    : "L'emploi du temps importé est trop long pour être lu en entier : certains de ses événements n'ont pas été comptés dans la limite de 3 événements en même temps."
}

export async function createFromDrafts(calendarId: string, drafts: PeriodDraft[]): Promise<CreateResult> {
  if (drafts.length === 0) return { ok: false, message: 'Aucun événement à ajouter.' }

  // Les événements importés comptent dans la limite de 3 événements en même temps, mais la base ne les voit pas :
  // on les lui soumet avant d'enregistrer (comme le fait le formulaire d'un événement).
  const cache: FeedCache = new Map()
  let notice: ImportedNotice | null = null
  for (const d of drafts) {
    if (!d.start_time || !d.end_time) continue
    const check = await checkWithImported({
      calendarId,
      excludeId: null,
      schedule: {
        start_date: d.start_date,
        frequency: d.frequency,
        duration_days: d.duration_days,
        interval_weeks: d.interval_weeks,
        week_of_month: d.week_of_month,
        start_time: d.start_time,
        end_time: d.end_time,
      },
      cache,
    })
    if (check.conflict) return { ok: false, message: conflictMessage(check.conflict) }
    notice = notice ?? check.notice
  }

  try {
    const { data, error } = await supabase
      .from('periods')
      .insert(drafts.map((d) => ({ calendar_id: calendarId, ...d })))
      .select('id')

    if (error) {
      const limit = parseLimitError(error)
      if (limit?.kind === 'slot_full') return { ok: false, message: conflictMessage(limit.conflict) }
      if (limit?.kind === 'rate_limit') {
        return {
          ok: false,
          message: `Vous créez des événements trop vite (10 par minute au maximum) et ce modèle en ajoute ${drafts.length}. Réessayez dans ${limit.retryAfter} seconde${limit.retryAfter > 1 ? 's' : ''}.`,
        }
      }
      if (limit?.kind === 'invalid') return { ok: false, message: "Les valeurs du modèle ne sont pas acceptées." }
      return { ok: false, message: error.message || "Le modèle n'a pas pu être ajouté." }
    }
    if (!data || data.length !== drafts.length) {
      return { ok: false, message: "Le modèle n'a pas pu être ajouté : vous n'avez peut-être plus le droit de modifier ce calendrier." }
    }
    return { ok: true, count: data.length, notice: notice ? importedNotice(notice) : null }
  } catch {
    return { ok: false, message: 'Erreur réseau. Le modèle n’a pas été ajouté.' }
  }
}
