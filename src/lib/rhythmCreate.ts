import { formatDate, getLang, t } from '../i18n'
import { supabase } from './supabaseClient'
import { checkWithImported, parseLimitError, type FeedCache, type ImportedNotice, type SlotConflict } from './slotLimit'
import type { PeriodDraft } from './rhythmTemplates'

// Ajoute les événements d'un modèle de rythme au calendrier, en une seule opération : si l'un d'eux est refusé
// (limite atteinte, droit manquant, réseau), aucun n'est créé.

export type CreateResult =
  | { ok: true; count: number; notice: string | null }
  | { ok: false; message: string }

// Les messages sont écrits dans la langue choisie au moment où l'erreur survient (t lit la langue courante).
function longDate(date: string): string {
  return formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, getLang())
}

function conflictMessage(conflict: SlotConflict): string {
  const names = Array.from(new Set(conflict.blockers.map((b) => b.name))).slice(0, 3)
  const when = conflict.date ? t('rhythm.error.conflictWhen', { date: longDate(conflict.date) }) : ''
  const who =
    names.length > 0 ? t('rhythm.error.conflictWho', { names: names.map((n) => t('common.quoted', { text: n })).join(', ') }) : ''
  return t('rhythm.error.conflict', { when, who })
}

function importedNotice(kind: ImportedNotice): string {
  return kind === 'unreachable' ? t('limit.imported.unreachable') : t('limit.imported.tooLong')
}

export async function createFromDrafts(calendarId: string, drafts: PeriodDraft[]): Promise<CreateResult> {
  if (drafts.length === 0) return { ok: false, message: t('rhythm.error.empty') }

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
        return { ok: false, message: t('rhythm.error.rateLimit', { count: limit.retryAfter, total: drafts.length }) }
      }
      if (limit?.kind === 'invalid') return { ok: false, message: t('rhythm.error.invalid') }
      return { ok: false, message: error.message || t('rhythm.error.failed') }
    }
    if (!data || data.length !== drafts.length) {
      return { ok: false, message: t('rhythm.error.denied') }
    }
    return { ok: true, count: data.length, notice: notice ? importedNotice(notice) : null }
  } catch {
    return { ok: false, message: t('rhythm.error.network') }
  }
}
