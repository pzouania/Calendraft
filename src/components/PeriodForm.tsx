import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { toDateOnly } from '../lib/dateUtils'
import { getPushState, type PushState } from '../lib/push'
import {
  choicesFor,
  loadMyReminders,
  pushHint,
  reminderInSentence,
  requestReminderSync,
  saveReminder,
} from '../lib/reminders'
import {
  checkWithImported,
  parseLimitError,
  removeBlockerDay,
  removeBlockerEvent,
  type FeedCache,
  type ImportedNotice,
  type SlotBlocker,
  type SlotConflict,
} from '../lib/slotLimit'
import type { Frequency, Period } from '../types'
import SlotConflictDialog from './SlotConflictDialog'

interface PeriodFormProps {
  calendarId: string
  // Absent : création d'un nouvel événement. Présent : modification de cet événement.
  period?: Period
  // Le message éventuel signale un souci sans gravité (par exemple : événement enregistré, rappel non enregistré).
  onSaved: (notice?: string) => void
  onCancel: () => void
  // Appelé quand le formulaire a supprimé quelque chose pour libérer un créneau (la liste des événements doit se rafraîchir).
  onChanged?: () => void
}

type Repeat = 'none' | 'weekly' | 'monthly'
type TimeMode = 'allday' | 'timed'

const COLORS = ['#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#475569']

const MONTH_WEEKS: { value: number; label: string }[] = [
  { value: 1, label: '1er' },
  { value: 2, label: '2e' },
  { value: 3, label: '3e' },
  { value: 4, label: '4e' },
  { value: -1, label: 'dernier' },
]

const labelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  display: 'block',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  borderRadius: 10,
  border: '1px solid var(--border)',
  fontSize: '0.9rem',
  outline: 'none',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  width: '100%',
}

const hintStyle: React.CSSProperties = {
  margin: '0.4rem 0 0',
  fontSize: '0.78rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.45,
}

const sectionStyle: React.CSSProperties = {
  paddingTop: '1.1rem',
  borderTop: '1px solid var(--border-soft)',
}

// Les colonnes qui décident des jours où tombe l'événement.
type Schedule = Pick<
  Period,
  'start_date' | 'frequency' | 'duration_days' | 'interval_weeks' | 'week_of_month' | 'start_time' | 'end_time'
>

// Les anciennes répétitions « alternance » et « jours personnalisés » s'affichent comme une répétition par semaines.
function repeatOf(p: Period): Repeat {
  if (p.frequency === 'once') return 'none'
  if (p.frequency === 'monthly') return 'monthly'
  return 'weekly'
}

function intervalOf(p: Period): number {
  return p.frequency === 'custom_days' ? 1 : Math.max(1, p.interval_weeks || 1)
}

// « 08:00:00 » (base de données) -> « 08:00 » (champ d'heure)
function hhmm(time: string | null): string {
  return time ? time.slice(0, 5) : ''
}

// Empreinte des jours de l'événement. Quand elle change (date de départ, répétition, durée, passage de minuit),
// les jours retirés un par un n'ont plus de sens : la base de données les remet à zéro (voir periods_edit.sql,
// dont la fonction period_structure_key suit exactement la même règle).
function structureKey(s: Schedule): string {
  const kind = s.frequency === 'once' ? 'once' : s.frequency === 'monthly' ? 'monthly' : 'weekly'
  const interval = kind === 'weekly' ? (s.frequency === 'custom_days' ? 1 : s.interval_weeks) : 0
  const week = kind === 'monthly' ? (s.week_of_month ?? 1) : 0
  const overnight = !!s.start_time && !!s.end_time && s.end_time <= s.start_time ? 1 : 0
  return [s.start_date, kind, interval, week, s.duration_days, overnight].join('|')
}

function weekdayOf(date: string): string {
  if (!date) return ''
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long' })
}

function formatLong(date: string): string {
  if (!date) return ''
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--surface-alt)', padding: 4, borderRadius: 12, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              flex: '1 1 110px',
              padding: '0.55rem 0.6rem',
              border: 'none',
              borderRadius: 9,
              fontSize: '0.84rem',
              fontWeight: 600,
              background: active ? 'var(--gradient-main)' : 'transparent',
              color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function PeriodForm({ calendarId, period, onSaved, onCancel, onChanged }: PeriodFormProps) {
  const editing = period !== undefined
  const originalTimeMode: TimeMode = period?.start_time ? 'timed' : 'allday'

  const [name, setName] = useState(period?.name ?? '')
  const [color, setColor] = useState(period?.color ?? COLORS[0])
  const [startDate, setStartDate] = useState(() => period?.start_date ?? toDateOnly(new Date()))
  const [repeat, setRepeat] = useState<Repeat>(period ? repeatOf(period) : 'none')
  const [intervalWeeks, setIntervalWeeks] = useState(period ? intervalOf(period) : 1)
  const [weekOfMonth, setWeekOfMonth] = useState(period?.week_of_month ?? 1)
  const [durationDays, setDurationDays] = useState(period?.duration_days ?? 1)
  const [timeMode, setTimeMode] = useState<TimeMode>(originalTimeMode)
  const [startTime, setStartTime] = useState(hhmm(period?.start_time ?? null))
  const [endTime, setEndTime] = useState(hhmm(period?.end_time ?? null))
  const [reminder, setReminder] = useState<number | null>(null)
  // Rappel déjà enregistré pour cet événement (modification seulement) : il se charge après l'ouverture du formulaire.
  const [originalReminder, setOriginalReminder] = useState<number | null>(null)
  const [reminderReady, setReminderReady] = useState(!editing)
  const [reminderFailed, setReminderFailed] = useState(false)
  // Nombre de jours retirés un par un de cet événement (voir l'avertissement plus bas).
  const [exceptionCount, setExceptionCount] = useState(0)
  const [pushState, setPushState] = useState<PushState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Créneau complet : la boîte propose de supprimer un des événements qui l'occupent, puis l'enregistrement reprend tout seul.
  const [conflict, setConflict] = useState<SlotConflict | null>(null)
  const [conflictBusy, setConflictBusy] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)
  // Emploi du temps importé déjà lu pendant que ce formulaire est ouvert (évite de le relire après chaque suppression).
  const [feedCache] = useState<FeedCache>(() => new Map())

  useEffect(() => {
    let cancelled = false
    getPushState()
      .then((state) => {
        if (!cancelled) setPushState(state)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const modeRef = useRef(timeMode)
  modeRef.current = timeMode

  const periodId = period?.id
  useEffect(() => {
    if (!periodId) return
    let cancelled = false

    loadMyReminders([periodId])
      .then((map) => {
        if (cancelled) return
        const value = map[periodId] ?? null
        setOriginalReminder(value)
        setReminderReady(true)
        // Si l'horaire a déjà été changé pendant le chargement, le rappel repart de « Aucun rappel ».
        if (modeRef.current === originalTimeMode) setReminder(value)
      })
      .catch(() => {
        if (!cancelled) setReminderFailed(true)
      })

    void (async () => {
      try {
        const { data, error: countError } = await supabase.from('period_exceptions').select('id').eq('period_id', periodId)
        if (!cancelled && !countError) setExceptionCount((data ?? []).length)
      } catch {
        // Sans conséquence : l'avertissement n'est qu'une information.
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId])

  const timed = timeMode === 'timed'
  const crossesMidnight = timed && !!startTime && !!endTime && endTime < startTime
  const weekday = weekdayOf(startDate)

  const chooseTimeMode = (mode: TimeMode) => {
    setTimeMode(mode)
    // Les choix de rappel ne sont pas les mêmes avec ou sans horaire : on repart de « Aucun rappel »
    // (sauf si l'on revient à l'horaire d'origine d'un événement modifié : son rappel est alors conservé).
    setReminder(editing && mode === originalTimeMode ? originalReminder : null)
    if (mode === 'timed') {
      if (!startTime) setStartTime('08:00')
      if (!endTime) setEndTime('17:00')
    }
  }

  const summary = useMemo(() => {
    if (!startDate) return ''
    const long = formatLong(startDate)
    const days = durationDays > 1 ? `, pendant ${durationDays} jours` : ''

    let when: string
    if (repeat === 'none') {
      when = `${durationDays > 1 ? 'À partir du' : 'Le'} ${long}`
    } else if (repeat === 'weekly') {
      const every = intervalWeeks === 1 ? 'Chaque semaine' : `Toutes les ${intervalWeeks} semaines`
      when = `${every}, à partir du ${long}`
    } else {
      const ord = MONTH_WEEKS.find((w) => w.value === weekOfMonth)?.label ?? ''
      when = `Le ${ord} ${weekday} de chaque mois, à partir du ${long}`
    }

    let time = ', toute la journée'
    if (timed) {
      time = startTime && endTime
        ? `, de ${startTime} à ${endTime}${crossesMidnight ? ' (jusqu\'au lendemain)' : ''}`
        : ''
    }

    const remind = reminder === null ? '' : ` Rappel : ${reminderInSentence(reminder, timed)}.`

    return `${when}${days}${time}.${remind}`
  }, [startDate, repeat, intervalWeeks, weekOfMonth, durationDays, timed, startTime, endTime, crossesMidnight, weekday, reminder])

  // Colonnes enregistrées. Un événement ancien « alternance » ou « jours personnalisés » garde sa valeur
  // tant que son rythme ne change pas, pour ne rien modifier sans raison.
  const buildSchedule = (): Schedule => {
    const keepsRhythm =
      period !== undefined && repeat === 'weekly' && repeatOf(period) === 'weekly' && intervalOf(period) === intervalWeeks
    const frequency: Frequency =
      repeat === 'none' ? 'once' : repeat === 'monthly' ? 'monthly' : period !== undefined && keepsRhythm ? period.frequency : 'weekly'
    return {
      start_date: startDate,
      frequency,
      duration_days: durationDays,
      interval_weeks: repeat === 'weekly' ? (period !== undefined && keepsRhythm ? period.interval_weeks : intervalWeeks) : 1,
      week_of_month: repeat === 'monthly' ? weekOfMonth : null,
      start_time: timed ? startTime : null,
      end_time: timed ? endTime : null,
    }
  }

  const exceptionsWillReset =
    period !== undefined && exceptionCount > 0 && structureKey(buildSchedule()) !== structureKey(period)

  const validate = (): string | null => {
    if (!name.trim()) return 'Donnez un nom à l\'événement.'
    if (!startDate) return 'Choisissez une date.'
    if (!Number.isInteger(durationDays) || durationDays < 1) return 'La durée doit être d\'au moins 1 jour.'
    if (repeat === 'weekly' && (!Number.isInteger(intervalWeeks) || intervalWeeks < 1)) {
      return 'L\'intervalle doit être d\'au moins 1 semaine.'
    }
    if (timed) {
      if (!startTime || !endTime) return 'Renseignez l\'heure de début et l\'heure de fin.'
      if (startTime === endTime) return 'L\'heure de fin doit être différente de l\'heure de début.'
    }
    return null
  }

  // Erreur de la base : limite atteinte (créneau complet, trop de créations) ou erreur ordinaire.
  const failWith = (dbError: { message?: string; details?: string | null; code?: string }, fallback: string) => {
    setSaving(false)
    const limit = parseLimitError(dbError)
    if (limit?.kind === 'slot_full') {
      setConflictError(null)
      setConflict(limit.conflict)
      return
    }
    setConflict(null)
    if (limit?.kind === 'rate_limit') {
      setError(`Vous créez des événements trop vite (10 par minute au maximum). Réessayez dans ${limit.retryAfter} seconde${limit.retryAfter > 1 ? 's' : ''}.`)
    } else if (limit?.kind === 'invalid') {
      setError("Les valeurs de l'événement ne sont pas acceptées (durée de 1 à 366 jours, répétition de 1 à 52 semaines).")
    } else {
      setError(dbError.message || fallback)
    }
  }

  // Vrai si les jours ou les heures diffèrent de l'événement enregistré (toujours vrai à la création).
  const scheduleChanged = (s: Schedule): boolean =>
    period === undefined ||
    s.start_date !== period.start_date ||
    s.frequency !== period.frequency ||
    s.interval_weeks !== period.interval_weeks ||
    s.week_of_month !== period.week_of_month ||
    s.duration_days !== period.duration_days ||
    hhmm(s.start_time) !== hhmm(period.start_time) ||
    hhmm(s.end_time) !== hhmm(period.end_time)

  const save = async () => {
    setError(null)
    setSaving(true)

    const schedule = buildSchedule()
    let savedId: string

    // Les événements importés (emploi du temps en ligne) comptent aussi dans la limite, mais la base ne les voit pas :
    // on les lui soumet avant d'enregistrer. Inutile si l'événement est sans horaire ou si ses jours et heures ne changent pas.
    let importedNotice: ImportedNotice | null = null
    const { start_time: from, end_time: until } = schedule
    if (from && until && scheduleChanged(schedule)) {
      const check = await checkWithImported({
        calendarId,
        excludeId: period?.id ?? null,
        schedule: {
          start_date: schedule.start_date,
          frequency: schedule.frequency,
          duration_days: schedule.duration_days,
          interval_weeks: schedule.interval_weeks,
          week_of_month: schedule.week_of_month,
          start_time: from,
          end_time: until,
        },
        cache: feedCache,
      })
      if (check.conflict) {
        setSaving(false)
        setConflictError(null)
        setConflict(check.conflict)
        return
      }
      importedNotice = check.notice
    }

    if (period) {
      const { data: updated, error: dbError } = await supabase
        .from('periods')
        .update({ name: name.trim(), color, ...schedule })
        .eq('id', period.id)
        .select('id')

      if (dbError) {
        failWith(dbError, "L'événement n'a pas pu être modifié.")
        return
      }
      // Sans droit d'écriture (ou événement supprimé entre-temps), la base ne signale pas d'erreur : aucune ligne n'est modifiée.
      if (!updated || updated.length === 0) {
        failWith({ message: "L'événement n'a pas pu être modifié : il a peut-être été supprimé, ou vous n'avez plus le droit de le modifier." }, '')
        return
      }
      savedId = period.id
    } else {
      const { data: created, error: dbError } = await supabase
        .from('periods')
        .insert({ calendar_id: calendarId, name: name.trim(), color, ...schedule })
        .select('id')
        .single()

      if (dbError || !created) {
        failWith(dbError ?? {}, "L'événement n'a pas pu être créé.")
        return
      }
      savedId = created.id as string
    }

    // Le rappel est personnel : il est enregistré pour la personne connectée, séparément de l'événement.
    let notice: string | undefined
    const reminderChanged = editing ? reminderReady && reminder !== originalReminder : reminder !== null
    if (reminderChanged) {
      let reminderError: string | null
      try {
        reminderError = await saveReminder(savedId, reminder)
      } catch {
        reminderError = 'Erreur réseau.'
      }
      if (reminderError) {
        notice = `L'événement est ${editing ? 'modifié' : 'créé'}, mais son rappel n'a pas pu être enregistré. Réglez-le depuis la liste des événements.`
      }
    }
    // Préparation immédiate des notifications : utile seulement si un rappel est en jeu.
    if (!notice && (reminder !== null || originalReminder !== null)) requestReminderSync()

    // L'emploi du temps importé n'a pas pu être lu (en entier) : l'événement est enregistré, on le dit.
    if (importedNotice) {
      const detail =
        importedNotice === 'unreachable'
          ? "L'emploi du temps importé ne répond pas : ses événements n'ont pas été comptés dans la limite de 3 événements en même temps."
          : "L'emploi du temps importé est trop long pour être lu en entier : certains de ses événements n'ont pas été comptés dans la limite de 3 événements en même temps."
      notice = notice ? `${notice} ${detail}` : `L'événement est ${editing ? 'modifié' : 'créé'}. ${detail}`
    }

    setSaving(false)
    onSaved(notice)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    await save()
  }

  // Ferme la boîte sans rien enregistrer ; le focus revient sur le bouton d'enregistrement.
  const closeConflict = () => {
    setConflict(null)
    window.setTimeout(() => submitRef.current?.focus(), 0)
  }

  // Libère une place en supprimant un jour (ou tout) d'un événement qui occupe le créneau, puis relance l'enregistrement.
  const freeSlot = async (blocker: SlotBlocker, scope: 'day' | 'event') => {
    const when = new Date(blocker.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    const confirmed = window.confirm(
      scope === 'day'
        ? `Supprimer « ${blocker.name} » uniquement le ${when} ? Les autres dates de cet événement ne seront pas affectées.`
        : `Supprimer définitivement « ${blocker.name} » ? Toutes ses dates seront supprimées.`
    )
    if (!confirmed) return

    setConflictBusy(true)
    setConflictError(null)
    try {
      const failure = scope === 'day' ? await removeBlockerDay(blocker) : await removeBlockerEvent(blocker)
      if (failure) {
        setConflictError(failure)
        return
      }
      onChanged?.()
      await save()
    } finally {
      setConflictBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex', flexDirection: 'column', gap: '1.1rem',
        background: 'var(--surface)', borderRadius: 16, padding: '1.5rem',
        boxShadow: 'var(--shadow-md)', maxWidth: 640,
      }}
    >
      <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
        {editing ? "Modifier l'événement" : 'Nouvel événement'}
      </h3>

      <div>
        <label style={labelStyle}>Nom</label>
        <input
          style={{ ...inputStyle, fontSize: '1rem' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. : Garde des enfants, Poste du matin..."
          autoFocus
          required
        />
      </div>

      <div>
        <label style={labelStyle}>Couleur</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
              style={{
                width: 30, height: 30, borderRadius: '50%', background: c, border: 'none',
                outline: color === c ? '2px solid var(--text-primary)' : 'none', outlineOffset: 2,
              }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Couleur personnalisée"
            style={{ width: 34, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--input-bg)', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>{repeat === 'none' ? 'Date' : 'À partir du'}</label>
            <input
              type="date"
              style={inputStyle}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            {weekday && <p style={{ ...hintStyle, textTransform: 'capitalize' }}>{weekday}</p>}
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={labelStyle}>Durée</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={1}
                max={366}
                style={{ ...inputStyle, width: 90 }}
                value={durationDays || ''}
                onChange={(e) => setDurationDays(e.target.value === '' ? 0 : Number(e.target.value))}
              />
              <span style={{ fontSize: '0.88rem', color: 'var(--text-body)' }}>
                {crossesMidnight ? (durationDays > 1 ? 'nuits' : 'nuit') : durationDays > 1 ? 'jours' : 'jour'}
              </span>
            </div>
          </div>
        </div>
        <p style={hintStyle}>
          {crossesMidnight
            ? 'Pour un horaire de nuit, la durée compte le nombre de nuits consécutives.'
            : 'Nombre de jours consécutifs (par exemple 7 pour une semaine de garde).'}
        </p>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Répétition</label>
        <Segmented<Repeat>
          value={repeat}
          onChange={setRepeat}
          options={[
            { value: 'none', label: 'Aucune' },
            { value: 'weekly', label: 'Toutes les X semaines' },
            { value: 'monthly', label: 'Chaque mois' },
          ]}
        />

        {repeat === 'weekly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Répéter toutes les</span>
            <input
              type="number"
              min={1}
              max={52}
              style={{ ...inputStyle, width: 80 }}
              value={intervalWeeks || ''}
              onChange={(e) => setIntervalWeeks(e.target.value === '' ? 0 : Number(e.target.value))}
            />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {intervalWeeks > 1 ? 'semaines' : 'semaine'}
            </span>
          </div>
        )}
        {repeat === 'weekly' && (
          <p style={hintStyle}>1 pour chaque semaine, 2 pour une semaine sur deux, 3 pour une semaine sur trois...</p>
        )}

        {repeat === 'monthly' && (
          <>
            <div style={{ marginTop: '0.8rem' }}>
              <select
                style={inputStyle}
                value={weekOfMonth}
                onChange={(e) => setWeekOfMonth(Number(e.target.value))}
              >
                {MONTH_WEEKS.map((w) => (
                  <option key={w.value} value={w.value}>
                    Le {w.label} {weekday} du mois
                  </option>
                ))}
              </select>
            </div>
            <p style={hintStyle}>Le jour de la semaine est celui de la date choisie ci-dessus.</p>
          </>
        )}
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Horaire</label>
        <Segmented<TimeMode>
          value={timeMode}
          onChange={chooseTimeMode}
          options={[
            { value: 'allday', label: 'Journée entière' },
            { value: 'timed', label: 'Horaire précis' },
          ]}
        />

        {timed && (
          <>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label style={{ ...labelStyle, fontWeight: 500 }}>Début</label>
                <input type="time" style={inputStyle} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label style={{ ...labelStyle, fontWeight: 500 }}>Fin</label>
                <input type="time" style={inputStyle} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            {crossesMidnight && (
              <p style={{ ...hintStyle, color: 'var(--accent-link)' }}>
                L'heure de fin est avant celle de début : l'événement se termine le lendemain.
              </p>
            )}
            <p style={hintStyle}>Au plus 3 événements à horaire précis en même temps par calendrier, importés compris.</p>
          </>
        )}
      </div>

      <div style={sectionStyle}>
        <label htmlFor="period-reminder" style={labelStyle}>Rappel (facultatif)</label>
        <select
          id="period-reminder"
          style={inputStyle}
          value={reminder === null ? '' : String(reminder)}
          disabled={editing && !reminderReady}
          onChange={(e) => setReminder(e.target.value === '' ? null : Number(e.target.value))}
        >
          {choicesFor(timed, reminder).map((c) => (
            <option key={String(c.minutes)} value={c.minutes === null ? '' : String(c.minutes)}>
              {c.label}
            </option>
          ))}
        </select>
        <p style={hintStyle}>
          {timed
            ? "Vous recevez une notification avant chaque occurrence de l'événement."
            : "Pour un événement sur la journée entière, la notification part à 8 h, le jour même ou la veille. Si l'événement dure plusieurs jours de suite, elle concerne le premier jour."}{' '}
          Ce rappel est personnel : les personnes avec qui le calendrier est partagé règlent le leur.
        </p>
        {reminder !== null && pushHint(pushState) && (
          <p style={{ ...hintStyle, color: 'var(--accent-link)' }}>{pushHint(pushState)}</p>
        )}
        {reminderFailed && (
          <p style={{ ...hintStyle, color: 'var(--danger)' }}>
            Votre rappel actuel n'a pas pu être chargé : il ne sera pas modifié.
          </p>
        )}
      </div>

      {exceptionsWillReset && (
        <p
          role="status"
          style={{
            margin: 0, padding: '0.65rem 0.9rem', borderRadius: 10, fontSize: '0.85rem', lineHeight: 1.45,
            background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning-text)',
          }}
        >
          {exceptionCount > 1
            ? `Vous aviez retiré ${exceptionCount} jours de cet événement. Comme les dates ou la répétition changent, ces retraits sont annulés : tous les jours de la nouvelle série seront affichés.`
            : 'Vous aviez retiré un jour de cet événement. Comme les dates ou la répétition changent, ce retrait est annulé : tous les jours de la nouvelle série seront affichés.'}
        </p>
      )}

      {summary && (
        <div
          style={{
            background: 'var(--surface-tint)', borderLeft: `4px solid ${color}`, borderRadius: 10,
            padding: '0.7rem 0.9rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tint-text)', marginBottom: 2 }}>Récapitulatif</div>
          <div style={{ fontSize: '0.88rem', color: 'var(--tint-text-body)', lineHeight: 1.5 }}>{summary}</div>
        </div>
      )}

      {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem', wordBreak: 'break-word' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          type="submit"
          ref={submitRef}
          disabled={saving}
          style={{
            background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
            borderRadius: 10, padding: '0.7rem 1.4rem', fontSize: '0.9rem', fontWeight: 700,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Enregistrement...' : editing ? 'Enregistrer les modifications' : "Créer l'événement"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '0.7rem 1.3rem', fontSize: '0.9rem', fontWeight: 600,
          }}
        >
          Annuler
        </button>
      </div>

      {conflict &&
        createPortal(
          <SlotConflictDialog
            conflict={conflict}
            eventName={name}
            busy={conflictBusy}
            error={conflictError}
            onDeleteDay={(b) => void freeSlot(b, 'day')}
            onDeleteEvent={(b) => void freeSlot(b, 'event')}
            onCancel={closeConflict}
          />,
          document.body
        )}
    </form>
  )
}
