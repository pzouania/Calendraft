import { supabase } from './supabaseClient'
import type { PushState } from './push'

// Rappels par événement. Chaque personne règle SON rappel (table period_reminders, protégée par
// des règles de sécurité : on ne lit et n'écrit que ses propres lignes). Le serveur transforme ensuite
// ces réglages en notifications (voir worker/reminders.ts).

// Délai en minutes avant le début. Pour un événement sur la journée entière, le calcul part de 8 h :
// 0 = le jour même à 8 h, 840 = la veille à 18 h, 1440 = la veille à 8 h.
export interface ReminderChoice {
  minutes: number | null
  label: string
}

export const TIMED_CHOICES: ReminderChoice[] = [
  { minutes: null, label: 'Aucun rappel' },
  { minutes: 0, label: "À l'heure de début" },
  { minutes: 10, label: '10 minutes avant' },
  { minutes: 30, label: '30 minutes avant' },
  { minutes: 60, label: '1 heure avant' },
  { minutes: 120, label: '2 heures avant' },
  { minutes: 1440, label: '1 jour avant' },
]

export const ALLDAY_CHOICES: ReminderChoice[] = [
  { minutes: null, label: 'Aucun rappel' },
  { minutes: 0, label: 'Le jour même à 8 h' },
  { minutes: 840, label: 'La veille à 18 h' },
  { minutes: 1440, label: 'La veille à 8 h' },
]

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

// Texte d'un délai qui ne fait pas partie des choix proposés (valeur ancienne ou saisie ailleurs).
function genericLabel(minutes: number): string {
  if (minutes === 0) return "À l'heure de début"
  if (minutes % 1440 === 0) return `${plural(minutes / 1440, 'jour', 'jours')} avant`
  if (minutes % 60 === 0) return `${plural(minutes / 60, 'heure', 'heures')} avant`
  return `${plural(minutes, 'minute', 'minutes')} avant`
}

// Choix à proposer pour un événement, en gardant la valeur actuelle visible même si elle est inhabituelle.
export function choicesFor(timed: boolean, current: number | null): ReminderChoice[] {
  const base = timed ? TIMED_CHOICES : ALLDAY_CHOICES
  if (current === null || base.some((c) => c.minutes === current)) return base
  return [...base, { minutes: current, label: genericLabel(current) }]
}

export function reminderLabel(minutes: number | null, timed: boolean): string {
  const found = choicesFor(timed, minutes).find((c) => c.minutes === minutes)
  return found ? found.label : 'Aucun rappel'
}

// « 30 minutes avant » -> « 30 minutes avant » ; « À l'heure de début » -> « à l'heure de début » (pour une phrase).
export function reminderInSentence(minutes: number | null, timed: boolean): string {
  const label = reminderLabel(minutes, timed)
  return label.charAt(0).toLowerCase() + label.slice(1)
}

// Message utile quand le rappel est réglé mais que cet appareil ne pourra pas l'afficher.
export function pushHint(state: PushState | null): string | null {
  if (!state) return null
  if (state.kind === 'off') {
    return "Les rappels ne sont pas encore activés sur cet appareil. Activez-les dans votre profil (Rappels sur cet appareil) pour les recevoir ici."
  }
  if (state.kind === 'denied') {
    return 'Les notifications sont bloquées pour calendraft.fr dans ce navigateur. Autorisez-les dans les réglages du site, puis activez les rappels dans votre profil.'
  }
  if (state.kind === 'unsupported' && state.reason === 'ios_needs_install') {
    return "Sur iPhone, ajoutez Calendraft à l'écran d'accueil, puis activez les rappels dans votre profil."
  }
  return null
}

// Lit les rappels de la personne connectée pour une liste d'événements : { id de l'événement: minutes }.
export async function loadMyReminders(periodIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (let i = 0; i < periodIds.length; i += 100) {
    const part = periodIds.slice(i, i + 100)
    const { data, error } = await supabase
      .from('period_reminders')
      .select('period_id, minutes_before')
      .in('period_id', part)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as Array<{ period_id: string; minutes_before: number }>) {
      out[row.period_id] = row.minutes_before
    }
  }
  return out
}

// Enregistre (ou retire, avec null) le rappel de la personne connectée. Renvoie un message d'erreur, ou null si tout va bien.
export async function saveReminder(periodId: string, minutes: number | null): Promise<string | null> {
  if (minutes === null) {
    const { error } = await supabase.from('period_reminders').delete().eq('period_id', periodId)
    return error ? error.message : null
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) return 'Délai de rappel invalide.'
  const { error } = await supabase
    .from('period_reminders')
    .upsert({ period_id: periodId, minutes_before: minutes }, { onConflict: 'user_id,period_id' })
  return error ? error.message : null
}

// ---------------------------------------------------------------------------------------------
// Préparation immédiate des notifications côté serveur.
// Sans cet appel, un nouveau rappel serait pris en compte au prochain passage automatique (au plus tard
// dans l'heure). Les appels rapprochés sont regroupés en un seul, et un éventuel refus « trop rapide »
// du serveur (une préparation par personne toutes les 5 secondes) est retenté une fois.

let syncTimer: ReturnType<typeof setTimeout> | null = null

async function syncNow(retry: boolean): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    const res = await fetch('/api/reminders/sync', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      keepalive: true,
    })
    const body = (await res.json()) as { throttled?: boolean }
    if (body.throttled && retry) setTimeout(() => void syncNow(false), 5500)
  } catch {
    // Sans conséquence : le passage automatique rattrape le retard.
  }
}

export function requestReminderSync(): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void syncNow(true)
  }, 1000)
}
