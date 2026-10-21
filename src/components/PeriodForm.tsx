import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { toDateOnly } from '../lib/dateUtils'
import { getPushState, type PushState } from '../lib/push'
import {
  choicesFor,
  pushHint,
  reminderInSentence,
  requestReminderSync,
  saveReminder,
} from '../lib/reminders'

interface PeriodFormProps {
  calendarId: string
  // Le message éventuel signale un souci sans gravité (par exemple : événement créé, rappel non enregistré).
  onCreated: (notice?: string) => void
  onCancel: () => void
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

export default function PeriodForm({ calendarId, onCreated, onCancel }: PeriodFormProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [startDate, setStartDate] = useState(() => toDateOnly(new Date()))
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [intervalWeeks, setIntervalWeeks] = useState(1)
  const [weekOfMonth, setWeekOfMonth] = useState(1)
  const [durationDays, setDurationDays] = useState(1)
  const [timeMode, setTimeMode] = useState<TimeMode>('allday')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reminder, setReminder] = useState<number | null>(null)
  const [pushState, setPushState] = useState<PushState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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

  const timed = timeMode === 'timed'
  const crossesMidnight = timed && !!startTime && !!endTime && endTime < startTime
  const weekday = weekdayOf(startDate)

  const chooseTimeMode = (mode: TimeMode) => {
    setTimeMode(mode)
    // Les choix de rappel ne sont pas les mêmes avec ou sans horaire : on repart de « Aucun rappel ».
    setReminder(null)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setSaving(true)

    const { data: created, error: dbError } = await supabase
      .from('periods')
      .insert({
        calendar_id: calendarId,
        name: name.trim(),
        color,
        start_date: startDate,
        frequency: repeat === 'none' ? 'once' : repeat,
        duration_days: durationDays,
        interval_weeks: repeat === 'weekly' ? intervalWeeks : 1,
        week_of_month: repeat === 'monthly' ? weekOfMonth : null,
        start_time: timed ? startTime : null,
        end_time: timed ? endTime : null,
      })
      .select('id')
      .single()

    if (dbError || !created) {
      setSaving(false)
      setError(dbError ? dbError.message : "L'événement n'a pas pu être créé.")
      return
    }

    // Le rappel est personnel : il est enregistré pour la personne connectée, séparément de l'événement.
    let notice: string | undefined
    if (reminder !== null) {
      let reminderError: string | null
      try {
        reminderError = await saveReminder(created.id as string, reminder)
      } catch {
        reminderError = 'Erreur réseau.'
      }
      if (reminderError) {
        notice = "L'événement est créé, mais son rappel n'a pas pu être enregistré. Réglez-le depuis la liste des événements."
      } else {
        requestReminderSync()
      }
    }

    setSaving(false)
    onCreated(notice)
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
      <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Nouvel événement</h3>

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
          </>
        )}
      </div>

      <div style={sectionStyle}>
        <label htmlFor="period-reminder" style={labelStyle}>Rappel (facultatif)</label>
        <select
          id="period-reminder"
          style={inputStyle}
          value={reminder === null ? '' : String(reminder)}
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
      </div>

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
          disabled={saving}
          style={{
            background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
            borderRadius: 10, padding: '0.7rem 1.4rem', fontSize: '0.9rem', fontWeight: 700,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Enregistrement...' : "Créer l'événement"}
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
    </form>
  )
}
