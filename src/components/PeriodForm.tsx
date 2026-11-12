import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TranslationKey } from '../i18n'
import { useI18n } from '../hooks/useI18n'
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

// 'days' : cycle en jours, créé par un modèle de rythme (4x8, 5x8...) ; il se conserve ou se remplace, mais ne se crée pas ici.
type Repeat = 'none' | 'weekly' | 'monthly' | 'days'
type TimeMode = 'allday' | 'timed'

const COLORS = ['#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#475569']

// Semaine du mois (1 à 4, -1 = dernière) -> textes de l'option du menu et du récapitulatif.
const MONTH_WEEKS: number[] = [1, 2, 3, 4, -1]

const MONTHLY_OPTION_KEYS: Record<number, TranslationKey> = {
  1: 'period.monthly.1',
  2: 'period.monthly.2',
  3: 'period.monthly.3',
  4: 'period.monthly.4',
  [-1]: 'period.monthly.last',
}

const MONTHLY_SUMMARY_KEYS: Record<number, TranslationKey> = {
  1: 'period.summary.monthly.1',
  2: 'period.summary.monthly.2',
  3: 'period.summary.monthly.3',
  4: 'period.summary.monthly.4',
  [-1]: 'period.summary.monthly.last',
}

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }

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
  if (p.frequency === 'days') return 'days'
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
  const kind = s.frequency === 'once' ? 'once' : s.frequency === 'monthly' ? 'monthly' : s.frequency === 'days' ? 'days' : 'weekly'
  const interval = kind === 'weekly' || kind === 'days' ? (s.frequency === 'custom_days' ? 1 : s.interval_weeks) : 0
  const week = kind === 'monthly' ? (s.week_of_month ?? 1) : 0
  const overnight = !!s.start_time && !!s.end_time && s.end_time <= s.start_time ? 1 : 0
  return [s.start_date, kind, interval, week, s.duration_days, overnight].join('|')
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
  const { t, formatDate } = useI18n()
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
  const weekday = startDate ? formatDate(startDate, { weekday: 'long' }) : ''

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
    const long = formatDate(startDate, LONG_DATE)
    const days = durationDays > 1 ? t('period.summary.days', { count: durationDays }) : ''

    let when: string
    if (repeat === 'none') {
      when = t(durationDays > 1 ? 'period.summary.once.multi' : 'period.summary.once.single', { date: long })
    } else if (repeat === 'days') {
      when = t('period.summary.cycle', { count: intervalWeeks, date: long })
    } else if (repeat === 'weekly') {
      when = intervalWeeks === 1
        ? t('period.summary.weekly.one', { date: long })
        : t('period.summary.weekly.many', { count: intervalWeeks, date: long })
    } else {
      when = t(MONTHLY_SUMMARY_KEYS[weekOfMonth] ?? MONTHLY_SUMMARY_KEYS[1], { weekday, date: long })
    }

    let time = t('period.summary.allDay')
    if (timed) {
      time = startTime && endTime
        ? `${t('period.summary.timed', { start: startTime, end: endTime })}${crossesMidnight ? t('period.summary.overnight') : ''}`
        : ''
    }

    const remind = reminder === null ? '' : t('period.summary.reminder', { text: reminderInSentence(reminder, timed, t) })

    return `${when}${days}${time}.${remind}`
  }, [t, formatDate, startDate, repeat, intervalWeeks, weekOfMonth, durationDays, timed, startTime, endTime, crossesMidnight, weekday, reminder])

  // Colonnes enregistrées. Un événement ancien « alternance » ou « jours personnalisés » garde sa valeur
  // tant que son rythme ne change pas, pour ne rien modifier sans raison.
  const buildSchedule = (): Schedule => {
    const keepsRhythm =
      period !== undefined && repeat === 'weekly' && repeatOf(period) === 'weekly' && intervalOf(period) === intervalWeeks
    // Cycle en jours : conservé tel quel tant que la répétition n'est pas changée.
    const keepsCycle = period !== undefined && repeat === 'days' && period.frequency === 'days'
    const frequency: Frequency =
      repeat === 'days' ? (keepsCycle ? 'days' : 'weekly')
      : repeat === 'none' ? 'once' : repeat === 'monthly' ? 'monthly' : period !== undefined && keepsRhythm ? period.frequency : 'weekly'
    return {
      start_date: startDate,
      frequency,
      duration_days: durationDays,
      interval_weeks: repeat === 'days' ? (period?.interval_weeks ?? 1) : repeat === 'weekly' ? (period !== undefined && keepsRhythm ? period.interval_weeks : intervalWeeks) : 1,
      week_of_month: repeat === 'monthly' ? weekOfMonth : null,
      start_time: timed ? startTime : null,
      end_time: timed ? endTime : null,
    }
  }

  const exceptionsWillReset =
    period !== undefined && exceptionCount > 0 && structureKey(buildSchedule()) !== structureKey(period)

  const validate = (): string | null => {
    if (!name.trim()) return t('period.error.name')
    if (!startDate) return t('period.error.date')
    if (!Number.isInteger(durationDays) || durationDays < 1) return t('period.error.duration')
    if (repeat === 'weekly' && (!Number.isInteger(intervalWeeks) || intervalWeeks < 1)) {
      return t('period.error.interval')
    }
    if (timed) {
      if (!startTime || !endTime) return t('period.error.times')
      if (startTime === endTime) return t('period.error.sameTime')
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
      setError(t('limit.rateLimit', { count: limit.retryAfter }))
    } else if (limit?.kind === 'invalid') {
      setError(t('limit.invalid'))
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
        failWith(dbError, t('period.error.updateFailed'))
        return
      }
      // Sans droit d'écriture (ou événement supprimé entre-temps), la base ne signale pas d'erreur : aucune ligne n'est modifiée.
      if (!updated || updated.length === 0) {
        failWith({ message: t('period.error.updateGone') }, '')
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
        failWith(dbError ?? {}, t('period.error.createFailed'))
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
        reminderError = t('common.networkError')
      }
      if (reminderError) {
        notice = editing ? t('period.notice.updatedReminderFailed') : t('period.notice.createdReminderFailed')
      }
    }
    // Préparation immédiate des notifications : utile seulement si un rappel est en jeu.
    if (!notice && (reminder !== null || originalReminder !== null)) requestReminderSync()

    // L'emploi du temps importé n'a pas pu être lu (en entier) : l'événement est enregistré, on le dit.
    if (importedNotice) {
      const detail = importedNotice === 'unreachable' ? t('limit.imported.unreachable') : t('limit.imported.tooLong')
      notice = notice ? `${notice} ${detail}` : `${editing ? t('period.notice.updated') : t('period.notice.created')} ${detail}`
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
    const when = formatDate(blocker.date, { day: 'numeric', month: 'long', year: 'numeric' })
    const confirmed = window.confirm(
      scope === 'day'
        ? t('period.confirm.deleteDay', { name: blocker.name, date: when })
        : t('period.confirm.deleteEvent', { name: blocker.name })
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
        {editing ? t('period.title.edit') : t('period.title.new')}
      </h3>

      <div>
        <label style={labelStyle}>{t('common.name')}</label>
        <input
          style={{ ...inputStyle, fontSize: '1rem' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('period.namePlaceholder')}
          autoFocus
          required
        />
      </div>

      <div>
        <label style={labelStyle}>{t('common.color')}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={t('period.colorAria', { color: c })}
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
            title={t('period.customColor')}
            style={{ width: 34, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--input-bg)', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>{repeat === 'none' ? t('period.date') : t('period.from')}</label>
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
            <label style={labelStyle}>{t('period.duration')}</label>
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
                {crossesMidnight ? t('period.unit.nights', { count: durationDays }) : t('period.unit.days', { count: durationDays })}
              </span>
            </div>
          </div>
        </div>
        <p style={hintStyle}>
          {crossesMidnight ? t('period.hint.nights') : t('period.hint.days')}
        </p>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>{t('period.repeat')}</label>
        <Segmented<Repeat>
          value={repeat}
          onChange={setRepeat}
          options={[
            { value: 'none', label: t('period.repeat.none') },
            { value: 'weekly', label: t('period.repeat.weekly') },
            { value: 'monthly', label: t('period.repeat.monthly') },
            ...(period?.frequency === 'days' ? [{ value: 'days' as Repeat, label: t('period.repeat.days') }] : []),
          ]}
        />

        {repeat === 'weekly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t('period.repeatEvery')}</span>
            <input
              type="number"
              min={1}
              max={52}
              style={{ ...inputStyle, width: 80 }}
              value={intervalWeeks || ''}
              onChange={(e) => setIntervalWeeks(e.target.value === '' ? 0 : Number(e.target.value))}
            />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {t('period.unit.weeks', { count: intervalWeeks })}
            </span>
          </div>
        )}
        {repeat === 'weekly' && (
          <p style={hintStyle}>{t('period.hint.weekly')}</p>
        )}
        {repeat === 'days' && (
          <p style={hintStyle}>{t('period.hint.cycle', { count: intervalWeeks })}</p>
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
                  <option key={w} value={w}>
                    {t(MONTHLY_OPTION_KEYS[w], { weekday })}
                  </option>
                ))}
              </select>
            </div>
            <p style={hintStyle}>{t('period.hint.monthly')}</p>
          </>
        )}
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>{t('period.schedule')}</label>
        <Segmented<TimeMode>
          value={timeMode}
          onChange={chooseTimeMode}
          options={[
            { value: 'allday', label: t('event.allDay') },
            { value: 'timed', label: t('period.timed') },
          ]}
        />

        {timed && (
          <>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label style={{ ...labelStyle, fontWeight: 500 }}>{t('period.start')}</label>
                <input type="time" style={inputStyle} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label style={{ ...labelStyle, fontWeight: 500 }}>{t('period.end')}</label>
                <input type="time" style={inputStyle} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            {crossesMidnight && (
              <p style={{ ...hintStyle, color: 'var(--accent-link)' }}>
                {t('period.hint.overnight')}
              </p>
            )}
            <p style={hintStyle}>{t('period.hint.limit')}</p>
          </>
        )}
      </div>

      <div style={sectionStyle}>
        <label htmlFor="period-reminder" style={labelStyle}>{t('period.reminder')}</label>
        <select
          id="period-reminder"
          style={inputStyle}
          value={reminder === null ? '' : String(reminder)}
          disabled={editing && !reminderReady}
          onChange={(e) => setReminder(e.target.value === '' ? null : Number(e.target.value))}
        >
          {choicesFor(timed, reminder, t).map((c) => (
            <option key={String(c.minutes)} value={c.minutes === null ? '' : String(c.minutes)}>
              {c.label}
            </option>
          ))}
        </select>
        <p style={hintStyle}>
          {timed ? t('period.reminderHint.timed') : t('period.reminderHint.allDay')}{' '}
          {t('period.reminderHint.personal')}
        </p>
        {reminder !== null && pushHint(pushState, t) && (
          <p style={{ ...hintStyle, color: 'var(--accent-link)' }}>{pushHint(pushState, t)}</p>
        )}
        {reminderFailed && (
          <p style={{ ...hintStyle, color: 'var(--danger)' }}>
            {t('period.reminderFailed')}
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
          {t('period.exceptionsReset', { count: exceptionCount })}
        </p>
      )}

      {summary && (
        <div
          style={{
            background: 'var(--surface-tint)', borderLeft: `4px solid ${color}`, borderRadius: 10,
            padding: '0.7rem 0.9rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tint-text)', marginBottom: 2 }}>{t('period.summaryTitle')}</div>
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
          {saving ? t('common.saving') : editing ? t('period.save') : t('period.create')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '0.7rem 1.3rem', fontSize: '0.9rem', fontWeight: 600,
          }}
        >
          {t('common.cancel')}
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
