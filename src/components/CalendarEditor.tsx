import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PeriodForm from './PeriodForm'
import YearCalendar from './YearCalendar'
import ShareModal from './ShareModal'
import FeedSettings from './FeedSettings'
import Logo from './Logo'
import { getPushState, type PushState } from '../lib/push'
import { choicesFor, loadMyReminders, pushHint, requestReminderSync, saveReminder } from '../lib/reminders'
import type { Period, YearMode } from '../types'

interface CalendarEditorProps {
  calendarId: string
  onBack: () => void
}

type Role = 'owner' | 'editor' | 'viewer'
type Tab = 'calendar' | 'events' | 'import'

function formatFrequency(p: Period): string {
  switch (p.frequency) {
    case 'once':
      return 'une seule fois'
    case 'weekly':
      return p.interval_weeks > 1 ? `toutes les ${p.interval_weeks} semaines` : 'chaque semaine'
    case 'alternating':
      return `alternance (1 semaine sur ${p.interval_weeks})`
    case 'custom_days':
      return 'chaque semaine, même jour'
    case 'monthly': {
      const labels: Record<number, string> = { 1: '1ère', 2: '2e', 3: '3e', 4: '4e', [-1]: 'dernière' }
      return `${labels[p.week_of_month ?? 1]} semaine de chaque mois`
    }
    default:
      return p.frequency
  }
}

// 2026-10-14 -> 14/10/2026 (plus lisible, et ne se coupe pas en fin de ligne)
function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function useIsNarrow(maxWidth = 640): boolean {
  const query = `(max-width: ${maxWidth}px)`
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return narrow
}

const ShareIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </svg>
)

const BellIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
)

// Rappel personnel de l'événement (chaque personne règle le sien, y compris en lecture seule).
function ReminderSelect({
  name, timed, value, busy, saved, onChange,
}: {
  name: string
  timed: boolean
  value: number | null
  busy: boolean
  saved: boolean
  onChange: (minutes: number | null) => void
}) {
  const active = value !== null
  return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: '1 1 150px', maxWidth: 240, minWidth: 0 }}>
        <span
          style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', display: 'flex',
            color: active ? 'var(--accent-link)' : 'var(--text-muted)', pointerEvents: 'none',
          }}
        >
          <BellIcon />
        </span>
        <select
          aria-label={`Rappel pour ${name}`}
          value={value === null ? '' : String(value)}
          disabled={busy}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          style={{
            width: '100%', padding: '0.35rem 0.5rem 0.35rem 30px', minHeight: 34, borderRadius: 8, fontSize: '0.82rem',
            fontWeight: active ? 600 : 400, border: `1px solid ${active ? 'var(--tint-border)' : 'var(--border)'}`,
            background: active ? 'var(--surface-tint)' : 'var(--surface)', color: active ? 'var(--accent-link)' : 'var(--text-body)', opacity: busy ? 0.6 : 1,
          }}
        >
          {choicesFor(timed, value).map((c) => (
            <option key={String(c.minutes)} value={c.minutes === null ? '' : String(c.minutes)}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {saved && <span role="status" style={{ fontSize: '0.75rem', color: 'var(--success-strong)', fontWeight: 600 }}>Enregistré</span>}
    </div>
  )
}

function withReminder(map: Record<string, number>, id: string, minutes: number | null): Record<string, number> {
  const next = { ...map }
  if (minutes === null) delete next[id]
  else next[id] = minutes
  return next
}

export default function CalendarEditor({ calendarId, onBack }: CalendarEditorProps) {
  const [tab, setTab] = useState<Tab>('calendar')
  const [calendarName, setCalendarName] = useState('')
  const [calendarIcon, setCalendarIcon] = useState('calendar')
  const [calendarColor, setCalendarColor] = useState('#2563eb')
  const [yearMode, setYearMode] = useState<YearMode>('calendar')
  const [infoLoaded, setInfoLoaded] = useState(false)
  const [role, setRole] = useState<Role | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [periods, setPeriods] = useState<Period[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [myReminders, setMyReminders] = useState<Record<string, number>>({})
  const [remindersOk, setRemindersOk] = useState(false)
  const [savingReminderId, setSavingReminderId] = useState<string | null>(null)
  const [savedReminderId, setSavedReminderId] = useState<string | null>(null)
  const [pushState, setPushState] = useState<PushState | null>(null)
  const isNarrow = useIsNarrow()

  const isOwner = role === 'owner'
  const canEdit = role === 'owner' || role === 'editor'

  const loadCalendarInfo = async () => {
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user

    const { data } = await supabase
      .from('calendars')
      .select('name, icon, color, user_id, year_mode')
      .eq('id', calendarId)
      .single()

    if (data) {
      setCalendarName(data.name)
      setCalendarIcon(data.icon ?? 'calendar')
      setCalendarColor(data.color ?? '#2563eb')
      setYearMode(data.year_mode === 'school' ? 'school' : 'calendar')

      if (user && data.user_id === user.id) {
        setRole('owner')
      } else {
        const { data: share } = await supabase
          .from('calendar_shares')
          .select('role')
          .eq('calendar_id', calendarId)
          .eq('email', (user?.email ?? '').toLowerCase())
          .maybeSingle()
        setRole(share?.role === 'editor' ? 'editor' : 'viewer')
      }
    }

    setInfoLoaded(true)
  }

  const loadPeriods = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('periods')
      .select('*')
      .eq('calendar_id', calendarId)
      .order('created_at', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      const list = (data ?? []) as Period[]
      setPeriods(list)
      try {
        setMyReminders(await loadMyReminders(list.map((p) => p.id)))
        setRemindersOk(true)
      } catch {
        setRemindersOk(false)
        setError("Vos rappels n'ont pas pu être chargés. Actualisez la page.")
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    loadCalendarInfo()
    loadPeriods()
  }, [calendarId])

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

  const handleReminderChange = async (periodId: string, minutes: number | null) => {
    const previous = myReminders[periodId] ?? null
    setError(null)
    setSavingReminderId(periodId)
    setSavedReminderId(null)
    setMyReminders((current) => withReminder(current, periodId, minutes))

    let failure: string | null
    try {
      failure = await saveReminder(periodId, minutes)
    } catch {
      failure = 'Erreur réseau.'
    }

    if (failure) {
      setMyReminders((current) => withReminder(current, periodId, previous))
      setError(`Le rappel n'a pas pu être enregistré : ${failure}`)
    } else {
      requestReminderSync()
      setSavedReminderId(periodId)
      window.setTimeout(() => setSavedReminderId((current) => (current === periodId ? null : current)), 2500)
    }
    setSavingReminderId(null)
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Supprimer cet événement ?')
    if (!confirmed) return
    const { error } = await supabase.from('periods').delete().eq('id', id)
    if (error) setError(error.message)
    else loadPeriods()
  }

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: isNarrow ? '0.6rem 0.3rem' : '0.6rem 1.2rem',
    borderRadius: 999,
    border: 'none',
    background: active ? 'var(--gradient-main)' : 'var(--surface)',
    color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: isNarrow ? '0.8rem' : '0.85rem',
    boxShadow: active ? 'var(--shadow-accent-sm)' : '0 1px 4px rgba(0,0,0,0.06)',
    ...(isNarrow ? { flex: 1, minWidth: 0, whiteSpace: 'nowrap' as const } : {}),
  })

  const roleLabel = role === 'editor' ? 'Partagé · éditeur' : 'Partagé · lecture seule'

  return (
    <div style={{ minHeight: '100vh' }}>
      {isNarrow ? (
        <header
          className="no-print"
          style={{
            background: 'var(--gradient-main)',
            padding: '0.6rem 1rem',
            display: 'flex',
            alignItems: 'center',
            boxShadow: 'var(--shadow-header)',
            gap: '0.7rem',
          }}
        >
          <button
            onClick={onBack}
            aria-label="Retour"
            style={{
              background: 'white', color: 'var(--blue-dark)', border: 'none',
              borderRadius: 999, padding: '0.5rem 0.9rem', fontSize: '0.85rem', fontWeight: 700,
              flexShrink: 0, minHeight: 36,
            }}
          >
            ← Retour
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: 'white', fontSize: '1rem', fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {calendarName}
            </div>
            {(role === 'viewer' || role === 'editor') && (
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.72rem', fontWeight: 600 }}>
                {roleLabel}
              </div>
            )}
          </div>
          {isOwner && (
            <button
              onClick={() => setShowShare(true)}
              aria-label="Partager"
              title="Partager"
              style={{
                background: 'rgba(255,255,255,0.18)', color: 'white',
                border: '1px solid rgba(255,255,255,0.55)', borderRadius: '50%',
                width: 38, height: 38, padding: 0, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ShareIcon size={17} />
            </button>
          )}
        </header>
      ) : (
        <header
          className="no-print"
          style={{
            background: 'var(--gradient-main)',
            padding: '0.9rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-header)',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', minWidth: 0 }}>
            <div style={{ background: 'white', borderRadius: 10, padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Logo height={32} />
            </div>
            <span style={{ color: 'white', fontSize: '1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {calendarName}
            </span>
            {(role === 'viewer' || role === 'editor') && (
              <span
                style={{
                  background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 999,
                  padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 600,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {roleLabel}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
            {isOwner && (
              <button
                onClick={() => setShowShare(true)}
                style={{
                  background: 'rgba(255,255,255,0.18)', color: 'white',
                  border: '1px solid rgba(255,255,255,0.55)',
                  borderRadius: 999, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <ShareIcon size={15} />
                Partager
              </button>
            )}
            <button
              onClick={onBack}
              style={{
                background: 'white', color: 'var(--blue-dark)', border: 'none',
                borderRadius: 999, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700,
              }}
            >
              ← Retour
            </button>
          </div>
        </header>
      )}

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: isNarrow ? '1rem' : '1.5rem' }}>
        <div
          className="no-print"
          style={{ display: 'flex', gap: isNarrow ? '0.4rem' : '0.6rem', marginBottom: isNarrow ? '1rem' : '1.5rem', flexWrap: 'wrap' }}
        >
          <button style={tabButtonStyle(tab === 'calendar')} onClick={() => setTab('calendar')}>
            {isNarrow ? 'Calendrier' : 'Calendrier annuel'}
          </button>
          <button style={tabButtonStyle(tab === 'events')} onClick={() => setTab('events')}>Événements</button>
          {isOwner && (
            <button style={tabButtonStyle(tab === 'import')} onClick={() => setTab('import')}>
              {isNarrow ? 'Importation' : 'Importation calendrier'}
            </button>
          )}
        </div>

        {error && <p className="no-print" style={{ color: 'var(--danger)' }}>{error}</p>}

        {tab === 'events' && (
          <>
            {canEdit && !showForm && (
              <button
                onClick={() => {
                  setNotice(null)
                  setShowForm(true)
                }}
                style={{
                  background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
                  borderRadius: 12, padding: '0.8rem 1.4rem', fontSize: '0.9rem', fontWeight: 700,
                  boxShadow: 'var(--shadow-accent)', marginBottom: isNarrow ? '1rem' : '1.5rem',
                  width: isNarrow ? '100%' : undefined,
                }}
              >
                + Ajouter un événement
              </button>
            )}

            {canEdit && showForm && (
              <div style={{ marginBottom: isNarrow ? '1rem' : '1.5rem' }}>
                <PeriodForm
                  calendarId={calendarId}
                  onCreated={(message) => {
                    setShowForm(false)
                    setNotice(message ?? null)
                    loadPeriods()
                  }}
                  onCancel={() => setShowForm(false)}
                />
              </div>
            )}

            {notice && (
              <p
                role="status"
                style={{
                  margin: '0 0 1rem', padding: '0.65rem 0.9rem', borderRadius: 10, fontSize: '0.85rem', lineHeight: 1.45,
                  background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning-text)',
                }}
              >
                {notice}
              </p>
            )}

            {Object.keys(myReminders).length > 0 && pushHint(pushState) && (
              <p
                style={{
                  margin: '0 0 1rem', padding: '0.65rem 0.9rem', borderRadius: 10, fontSize: '0.85rem', lineHeight: 1.45,
                  background: 'var(--surface-tint)', border: '1px solid var(--tint-border)', color: 'var(--tint-text)',
                }}
              >
                {pushHint(pushState)}
              </p>
            )}

            {loading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
            ) : periods.length === 0 ? (
              <div
                style={{
                  background: 'var(--surface)', borderRadius: 16, padding: '2.5rem 1.5rem', textAlign: 'center',
                  color: 'var(--text-secondary)', boxShadow: 'var(--shadow-md)',
                }}
              >
                Aucun événement pour l'instant.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {periods.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: 'var(--surface)', borderRadius: 12, padding: isNarrow ? '0.8rem 0.9rem' : '0.9rem 1.2rem',
                      display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: isNarrow ? 'nowrap' : 'wrap',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, backgroundColor: p.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: isNarrow ? 0 : 160 }}>
                      <strong style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{p.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {formatFrequency(p)} — à partir du&nbsp;{formatDateFr(p.start_date)}
                        {p.start_time && ` — ${p.start_time.slice(0, 5)} à ${p.end_time?.slice(0, 5)}`}
                      </div>
                      {remindersOk && (
                        <ReminderSelect
                          name={p.name}
                          timed={Boolean(p.start_time)}
                          value={myReminders[p.id] ?? null}
                          busy={savingReminderId === p.id}
                          saved={savedReminderId === p.id}
                          onChange={(minutes) => handleReminderChange(p.id, minutes)}
                        />
                      )}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(p.id)}
                        style={{
                          background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                          borderRadius: 8, padding: isNarrow ? '0.4rem 0.6rem' : '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0,
                        }}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'import' && isOwner && <FeedSettings calendarId={calendarId} />}

        {tab === 'calendar' &&
          (infoLoaded ? (
            <YearCalendar
              calendarId={calendarId}
              calendarName={calendarName}
              calendarIcon={calendarIcon}
              calendarColor={calendarColor}
              canEdit={canEdit}
              yearMode={yearMode}
            />
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>Chargement du calendrier...</p>
          ))}
      </main>

      {showShare && (
        <ShareModal
          calendarId={calendarId}
          calendarName={calendarName}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}
