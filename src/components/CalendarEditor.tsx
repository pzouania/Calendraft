import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PeriodForm from './PeriodForm'
import YearCalendar from './YearCalendar'
import ShareModal from './ShareModal'
import FeedSettings from './FeedSettings'
import Logo from './Logo'
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

    if (error) setError(error.message)
    else setPeriods(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadCalendarInfo()
    loadPeriods()
  }, [calendarId])

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
    background: active ? 'var(--gradient-main)' : 'white',
    color: active ? 'white' : 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: isNarrow ? '0.8rem' : '0.85rem',
    boxShadow: active ? '0 4px 12px rgba(37, 99, 235, 0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
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
            boxShadow: '0 4px 20px rgba(30, 64, 175, 0.25)',
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
            boxShadow: '0 4px 20px rgba(30, 64, 175, 0.25)',
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

        {error && <p className="no-print" style={{ color: '#dc2626' }}>{error}</p>}

        {tab === 'events' && (
          <>
            {canEdit && !showForm && (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  background: 'var(--gradient-main)', color: 'white', border: 'none',
                  borderRadius: 12, padding: '0.8rem 1.4rem', fontSize: '0.9rem', fontWeight: 700,
                  boxShadow: '0 6px 16px rgba(37, 99, 235, 0.35)', marginBottom: isNarrow ? '1rem' : '1.5rem',
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
                  onCreated={() => {
                    setShowForm(false)
                    loadPeriods()
                  }}
                  onCancel={() => setShowForm(false)}
                />
              </div>
            )}

            {loading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
            ) : periods.length === 0 ? (
              <div
                style={{
                  background: 'white', borderRadius: 16, padding: '2.5rem 1.5rem', textAlign: 'center',
                  color: 'var(--text-secondary)', boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
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
                      background: 'white', borderRadius: 12, padding: isNarrow ? '0.8rem 0.9rem' : '0.9rem 1.2rem',
                      display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: isNarrow ? 'nowrap' : 'wrap',
                      boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)',
                    }}
                  >
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, backgroundColor: p.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: isNarrow ? 0 : 160 }}>
                      <strong style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{p.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {formatFrequency(p)} — à partir du&nbsp;{formatDateFr(p.start_date)}
                        {p.start_time && ` — ${p.start_time.slice(0, 5)} à ${p.end_time?.slice(0, 5)}`}
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(p.id)}
                        style={{
                          background: 'transparent', border: '1px solid #fecaca', color: '#dc2626',
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
