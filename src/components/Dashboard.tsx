import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { getAvatarUrl } from '../lib/avatar'
import { generateAllOccurrences } from '../lib/occurrenceEngine'
import { toDateOnly } from '../lib/dateUtils'
import Logo from './Logo'
import Icon from './icons'
import CalendarFormModal from './CalendarFormModal'
import type { Calendar, Occurrence, Period, PeriodException } from '../types'

type ShareRole = 'viewer' | 'editor'

const ROLE_LABELS: Record<ShareRole, string> = { viewer: 'Lecteur', editor: 'Éditeur' }

interface DashboardProps {
  user: User
  onOpenCalendar: (id: string) => void
  onOpenProfile: () => void
}

interface UpcomingItem {
  occ: Occurrence
  uniq: string
  calendarId: string
  calendarName: string
}

interface FeedEventDto {
  uid: string
  title: string
  location: string
  date: string
  start: string | null
  end: string | null
  segment: 'full' | 'start' | 'end'
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function sortKey(o: Occurrence): number {
  if (!o.startTime || !o.endTime) return -1
  if (o.segment === 'end') return 0
  return timeToMin(o.startTime)
}

function timeLabel(o: Occurrence): string {
  if (!o.startTime || !o.endTime) return 'Journée entière'
  const s = o.startTime.slice(0, 5)
  const e = o.endTime.slice(0, 5)
  if (o.segment === 'start') return `dès ${s}`
  if (o.segment === 'end') return `jusqu'à ${e}`
  return `${s} – ${e}`
}

function isPast(o: Occurrence, todayStr: string, nowMin: number): boolean {
  if (o.date !== todayStr) return false
  if (!o.startTime || !o.endTime) return false
  if (o.segment === 'start') return false
  return timeToMin(o.endTime) <= nowMin
}

function dayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr) return "Aujourd'hui"
  if (dateStr === tomorrowStr) return 'Demain'
  const s = new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const MOBILE_EVENT_LIMIT = 6

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

export default function Dashboard({ user, onOpenCalendar, onOpenProfile }: DashboardProps) {
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [exceptions, setExceptions] = useState<PeriodException[]>([])
  const [feedItems, setFeedItems] = useState<UpcomingItem[]>([])
  const [hasFeeds, setHasFeeds] = useState(false)
  const [feedsLoading, setFeedsLoading] = useState(true)
  const [roles, setRoles] = useState<Record<string, ShareRole>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; calendar?: Calendar } | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [showAllEvents, setShowAllEvents] = useState(false)
  const isNarrow = useIsNarrow()

  const myEmail = (user.email ?? '').toLowerCase()

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(id)
  }, [])

  const loadFeeds = async (cals: Calendar[]) => {
    setFeedsLoading(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token || cals.length === 0) {
      setFeedItems([])
      setHasFeeds(false)
      setFeedsLoading(false)
      return
    }

    const start = new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const from = toDateOnly(start)
    const to = toDateOnly(end)

    const results = await Promise.all(
      cals.map(async (cal) => {
        try {
          const res = await fetch('/api/feed/events', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${token}`,
              'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ calendarId: cal.id, from, to }),
          })
          const body = await res.json().catch(() => null)
          if (!body || !body.ok || !body.configured) return { configured: false, items: [] as UpcomingItem[] }

          const items = (body.events as FeedEventDto[]).map((e) => ({
            occ: {
              periodId: 'feed',
              name: e.title,
              color: body.color as string,
              date: e.date,
              startTime: e.start,
              endTime: e.end,
              segment: e.segment,
              readOnly: true,
              location: e.location,
            } as Occurrence,
            uniq: `feed|${cal.id}|${e.uid}|${e.date}`,
            calendarId: cal.id,
            calendarName: cal.name,
          }))
          return { configured: true, items }
        } catch {
          return { configured: false, items: [] as UpcomingItem[] }
        }
      })
    )

    setFeedItems(results.flatMap((r) => r.items))
    setHasFeeds(results.some((r) => r.configured))
    setFeedsLoading(false)
  }

  const loadCalendars = async () => {
    setLoading(true)
    const [calRes, shareRes, perRes, excRes] = await Promise.all([
      supabase.from('calendars').select('*').order('updated_at', { ascending: false }),
      supabase.from('calendar_shares').select('calendar_id, role').eq('email', myEmail),
      supabase.from('periods').select('*'),
      supabase.from('period_exceptions').select('*'),
    ])

    if (calRes.error) setError(calRes.error.message)
    else setCalendars(calRes.data ?? [])

    if (!perRes.error) setPeriods((perRes.data ?? []) as Period[])
    if (!excRes.error) setExceptions((excRes.data ?? []) as PeriodException[])

    const map: Record<string, ShareRole> = {}
    if (!shareRes.error) {
      for (const row of shareRes.data ?? []) {
        map[row.calendar_id] = row.role as ShareRole
      }
    }
    setRoles(map)
    setLoading(false)

    void loadFeeds((calRes.data ?? []) as Calendar[])
  }

  useEffect(() => {
    loadCalendars()
  }, [])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = window.confirm('Supprimer ce calendrier ? Cette action est irréversible.')
    if (!confirmed) return

    const { error } = await supabase.from('calendars').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    loadCalendars()
  }

  const handleLeave = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = window.confirm(
      'Quitter ce calendrier ? Vous n’y aurez plus accès, sauf nouvelle invitation.'
    )
    if (!confirmed) return

    const { error } = await supabase
      .from('calendar_shares')
      .delete()
      .eq('calendar_id', id)
      .eq('email', myEmail)
    if (error) {
      setError(error.message)
      return
    }
    loadCalendars()
  }

  const upcoming = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)

    const exByPeriod = new Map<string, Set<string>>()
    for (const ex of exceptions) {
      const set = exByPeriod.get(ex.period_id) ?? new Set<string>()
      set.add(ex.exception_date)
      exByPeriod.set(ex.period_id, set)
    }

    const periodById = new Map(periods.map((p) => [p.id, p]))
    const calendarById = new Map(calendars.map((c) => [c.id, c]))

    const items: UpcomingItem[] = []
    for (const occ of generateAllOccurrences(periods, start, end, exByPeriod)) {
      const period = periodById.get(occ.periodId)
      if (!period) continue
      items.push({
        occ,
        uniq: `${occ.periodId}|${occ.date}`,
        calendarId: period.calendar_id,
        calendarName: calendarById.get(period.calendar_id)?.name ?? '',
      })
    }
    items.push(...feedItems)

    const byDate = new Map<string, UpcomingItem[]>()
    const seen = new Set<string>()
    for (const item of items) {
      seen.add(item.uniq)
      const list = byDate.get(item.occ.date) ?? []
      list.push(item)
      byDate.set(item.occ.date, list)
    }

    const days = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, list]) => ({
        date,
        items: [...list].sort((x, y) => sortKey(x.occ) - sortKey(y.occ)),
      }))

    return { days, count: seen.size }
  }, [periods, exceptions, calendars, feedItems])

  const todayStr = toDateOnly(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = toDateOnly(tomorrow)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const q = search.toLowerCase()
  const matches = (c: Calendar) => c.name.toLowerCase().includes(q)
  const owned = calendars.filter((c) => c.user_id === user.id && matches(c))
  const shared = calendars.filter((c) => c.user_id !== user.id && matches(c))
  const ownedCount = calendars.filter((c) => c.user_id === user.id).length
  const sharedCount = calendars.filter((c) => c.user_id !== user.id).length
  const hasShared = sharedCount > 0

  const totalItems = upcoming.days.reduce((n, d) => n + d.items.length, 0)

  // Sur mobile, la liste est repliée : seuls les prochains événements (hors cours déjà passés
  // aujourd'hui) sont affichés, jusqu'à MOBILE_EVENT_LIMIT.
  let remaining = MOBILE_EVENT_LIMIT
  const collapsedDays = upcoming.days.flatMap((day) => {
    if (remaining <= 0) return []
    const items = day.items.filter((it) => !isPast(it.occ, todayStr, nowMin)).slice(0, remaining)
    remaining -= items.length
    return items.length > 0 ? [{ date: day.date, items }] : []
  })
  const collapsedCount = collapsedDays.reduce((n, d) => n + d.items.length, 0)
  const canCollapse = isNarrow && collapsedCount < totalItems
  const isCollapsed = canCollapse && !showAllEvents
  const visibleDays = isCollapsed ? collapsedDays : upcoming.days

  const stats = [
    { icon: 'calendar', label: 'Calendriers', value: ownedCount },
    { icon: 'users', label: 'Partagés avec moi', value: sharedCount },
    { icon: 'briefcase', label: 'Événements créés', value: periods.length },
    { icon: 'star', label: 'Événements (7 jours)', value: upcoming.count },
  ]

  const username = user.user_metadata?.username as string | undefined
  const displayLabel = username || user.email || '?'
  const initial = displayLabel[0]?.toUpperCase() ?? '?'
  const avatarUrl = getAvatarUrl(user)

  const sectionTitle: React.CSSProperties = {
    margin: '0 0 0.8rem',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#0f172a',
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '1.2rem',
  }

  const renderCard = (cal: Calendar, isShared: boolean) => (
    <div
      key={cal.id}
      onClick={() => onOpenCalendar(cal.id)}
      style={{
        background: 'white', borderRadius: 16, padding: '1.3rem',
        boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)', cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s', position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(30, 64, 175, 0.16)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(30, 64, 175, 0.08)'
      }}
    >
      {isShared ? (
        <span
          style={{
            position: 'absolute', top: 12, right: 12, background: '#eff6ff', color: '#1e40af',
            borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.7rem', fontWeight: 700,
          }}
        >
          {ROLE_LABELS[roles[cal.id] ?? 'viewer']}
        </span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setModal({ mode: 'edit', calendar: cal })
          }}
          title="Modifier"
          style={{
            position: 'absolute', top: 10, right: 10, background: '#f1f5f9', border: 'none',
            borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          ✎
        </button>
      )}

      <div
        style={{
          width: 40, height: 40, borderRadius: 10, background: cal.color || 'var(--blue-main)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.8rem',
        }}
      >
        <Icon name={cal.icon || 'calendar'} size={20} color="white" />
      </div>
      <h3 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: 'var(--text-primary)', paddingRight: '1.5rem' }}>{cal.name}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.8rem' }}>
        Modifié le {new Date(cal.updated_at).toLocaleDateString('fr-FR')}
      </p>

      {isShared ? (
        <button
          onClick={(e) => handleLeave(cal.id, e)}
          style={{
            background: 'transparent', border: '1px solid #e2e8f0', color: '#475569',
            borderRadius: 8, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 600,
          }}
        >
          Quitter
        </button>
      ) : (
        <button
          onClick={(e) => handleDelete(cal.id, e)}
          style={{
            background: 'transparent', border: '1px solid #fecaca', color: '#dc2626',
            borderRadius: 8, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 600,
          }}
        >
          Supprimer
        </button>
      )}
    </div>
  )

  const header = (
    <header
      style={{
        background: 'var(--gradient-main)',
        padding: isNarrow ? '0.6rem 1rem' : '0.9rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 20px rgba(30, 64, 175, 0.25)',
        gap: '1rem',
        flexWrap: isNarrow ? 'nowrap' : 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: isNarrow ? '0.7rem' : '1.2rem', minWidth: 0 }}>
        <div
          style={{
            background: 'white', borderRadius: 10,
            padding: isNarrow ? '0.3rem 0.8rem' : '0.4rem 1rem',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Logo height={isNarrow ? 30 : 38} />
        </div>
        {!isNarrow && (
          <span style={{ color: 'white', fontSize: '1rem', fontWeight: 600, opacity: 0.95 }}>
            Mes calendriers
          </span>
        )}
      </div>

      <button
        onClick={onOpenProfile}
        title="Mon profil"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 999,
          padding: username && !isNarrow ? '0.3rem 0.9rem 0.3rem 0.3rem' : '0.3rem',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: isNarrow ? 36 : 34, height: isNarrow ? 36 : 34, borderRadius: '50%',
            background: 'white', color: 'var(--blue-dark)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '0.9rem', flexShrink: 0, overflow: 'hidden',
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            initial
          )}
        </div>
        {username && !isNarrow && (
          <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>{username}</span>
        )}
      </button>
    </header>
  )

  const statsGrid = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: isNarrow ? '0.6rem' : '1rem',
        marginBottom: isNarrow ? 0 : '1.5rem',
        marginTop: isNarrow ? '1.5rem' : 0,
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            background: 'white', borderRadius: 14,
            padding: isNarrow ? '0.65rem 0.7rem' : '0.9rem 1rem',
            display: 'flex', alignItems: 'center', gap: isNarrow ? '0.6rem' : '0.8rem',
            boxShadow: '0 2px 10px rgba(30, 64, 175, 0.07)',
          }}
        >
          <div
            style={{
              width: isNarrow ? 32 : 40, height: isNarrow ? 32 : 40, borderRadius: isNarrow ? 9 : 11,
              background: 'var(--gradient-main)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Icon name={s.icon} size={isNarrow ? 16 : 20} color="white" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: isNarrow ? '1.2rem' : '1.4rem', fontWeight: 700,
                color: '#0f172a', lineHeight: 1.1,
              }}
            >
              {loading ? '–' : s.value}
            </div>
            <div style={{ fontSize: isNarrow ? '0.7rem' : '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>
              {s.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const actions = (
    <div
      style={{
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: isNarrow ? '0.7rem' : '1rem',
        marginBottom: '1.5rem',
        alignItems: isNarrow ? 'stretch' : 'center',
      }}
    >
      <button
        onClick={() => setModal({ mode: 'create' })}
        style={{
          background: 'var(--gradient-main)', color: 'white', border: 'none',
          borderRadius: 12, padding: '0.8rem 1.4rem', fontSize: '0.95rem', fontWeight: 700,
          boxShadow: '0 6px 16px rgba(37, 99, 235, 0.35)',
        }}
      >
        + Nouveau calendrier
      </button>
      <input
        type="text"
        placeholder="Rechercher un calendrier..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          flex: isNarrow ? 'none' : 1, minWidth: isNarrow ? 0 : 200, boxSizing: 'border-box',
          width: isNarrow ? '100%' : undefined,
          padding: '0.8rem 1rem', borderRadius: 12,
          border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', background: 'white',
        }}
      />
    </div>
  )

  const errorBlock = error ? <p style={{ color: '#dc2626' }}>{error}</p> : null

  const calendarsList = loading ? (
    <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
  ) : owned.length === 0 && shared.length === 0 ? (
    <div
      style={{
        background: 'white', borderRadius: 16, padding: '3rem 1.5rem', textAlign: 'center',
        color: 'var(--text-secondary)', boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
      }}
    >
      Aucun calendrier pour l'instant. Créez-en un pour commencer.
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {owned.length > 0 && (
        <section>
          {hasShared && <h2 style={sectionTitle}>Mes calendriers</h2>}
          <div style={gridStyle}>{owned.map((cal) => renderCard(cal, false))}</div>
        </section>
      )}
      {shared.length > 0 && (
        <section>
          <h2 style={sectionTitle}>Partagés avec moi</h2>
          <div style={gridStyle}>{shared.map((cal) => renderCard(cal, true))}</div>
        </section>
      )}
    </div>
  )

  const recap = (
    <aside
      style={
        isNarrow
          ? {
              background: 'white', borderRadius: 16, padding: '1rem',
              boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)', marginBottom: '1.2rem',
            }
          : {
              flex: '1 1 300px', minWidth: 0, background: 'white', borderRadius: 16,
              padding: '1.2rem', boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
              maxHeight: 560, overflowY: 'auto',
            }
      }
    >
      <h2 style={{ margin: '0 0 0.2rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
        Prochains événements
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Les 7 prochains jours, tous calendriers confondus
      </p>

      {loading ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Chargement...</p>
      ) : (
        <>
          {upcoming.days.length === 0 && !feedsLoading && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {periods.length === 0 && !hasFeeds
                ? 'Ajoutez des événements ou un emploi du temps en ligne à vos calendriers pour les voir apparaître ici.'
                : 'Aucun événement prévu dans les 7 prochains jours.'}
            </p>
          )}

          {isCollapsed && visibleDays.length === 0 && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Plus rien de prévu pour le moment.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {visibleDays.map((day) => (
              <section key={day.date}>
                <div
                  style={{
                    fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem',
                    color: day.date === todayStr ? 'var(--blue-dark)' : '#475569',
                  }}
                >
                  {dayLabel(day.date, todayStr, tomorrowStr)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {day.items.map((item, i) => {
                    const past = isPast(item.occ, todayStr, nowMin)
                    return (
                      <button
                        key={`${item.uniq}-${item.occ.segment ?? 'full'}-${i}`}
                        onClick={() => onOpenCalendar(item.calendarId)}
                        style={{
                          textAlign: 'left', width: '100%', background: '#f8fafc', border: 'none',
                          borderLeft: `4px solid ${item.occ.color}`, borderRadius: 10,
                          padding: isNarrow ? '0.6rem 0.7rem' : '0.5rem 0.7rem', opacity: past ? 0.5 : 1,
                        }}
                      >
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                          {item.occ.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                          {timeLabel(item.occ)}
                          {item.occ.location ? ` · ${item.occ.location}` : ''}
                          {item.calendarName ? ` · ${item.calendarName}` : ''}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          {canCollapse && (
            <button
              onClick={() => setShowAllEvents((v) => !v)}
              style={{
                marginTop: '0.9rem', width: '100%', background: '#eff6ff', color: 'var(--blue-dark)',
                border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.6rem 1rem',
                fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              {isCollapsed
                ? `Voir toute la semaine (${totalItems - collapsedCount} de plus)`
                : 'Réduire'}
            </button>
          )}

          {feedsLoading && (
            <p style={{ margin: '0.8rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Chargement de l'emploi du temps...
            </p>
          )}
        </>
      )}
    </aside>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      {header}

      <main style={{ maxWidth: 1150, margin: '0 auto', padding: isNarrow ? '1rem' : '2rem 1.5rem' }}>
        {isNarrow ? (
          <>
            {recap}
            {actions}
            {errorBlock}
            {calendarsList}
            {statsGrid}
          </>
        ) : (
          <>
            {statsGrid}
            {actions}
            {errorBlock}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-start' }}>
              <div style={{ flex: '2 1 460px', minWidth: 0 }}>{calendarsList}</div>
              {recap}
            </div>
          </>
        )}
      </main>

      {modal && (
        <CalendarFormModal
          mode={modal.mode}
          calendar={modal.calendar}
          onClose={() => setModal(null)}
          onSaved={(id) => {
            setModal(null)
            if (modal.mode === 'create') {
              onOpenCalendar(id)
            } else {
              loadCalendars()
            }
          }}
        />
      )}
    </div>
  )
}
