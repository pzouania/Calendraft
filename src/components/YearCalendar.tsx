import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { generateAllOccurrences } from '../lib/occurrenceEngine'
import MonthGrid from './MonthGrid'
import DayDetail from './DayDetail'
import Icon from './icons'
import type { Period, Occurrence, PeriodException } from '../types'

interface YearCalendarProps {
  calendarId: string
  calendarName: string
  calendarIcon: string
  calendarColor: string
  canEdit: boolean
  staticData?: { periods: Period[]; exceptions: PeriodException[] }
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

interface FeedInfo {
  label: string
  color: string
  events: FeedEventDto[]
}

export default function YearCalendar({ calendarId, calendarName, calendarIcon, calendarColor, canEdit, staticData }: YearCalendarProps) {
  const [periods, setPeriods] = useState<Period[]>(staticData?.periods ?? [])
  const [exceptions, setExceptions] = useState<PeriodException[]>(staticData?.exceptions ?? [])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(!staticData)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [feed, setFeed] = useState<FeedInfo | null>(null)
  const [feedNotice, setFeedNotice] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    const { data: periodsData } = await supabase
      .from('periods')
      .select('*')
      .eq('calendar_id', calendarId)

    const periodIds = (periodsData ?? []).map((p) => p.id)
    let exceptionsData: PeriodException[] = []
    if (periodIds.length > 0) {
      const { data } = await supabase
        .from('period_exceptions')
        .select('*')
        .in('period_id', periodIds)
      exceptionsData = data ?? []
    }

    setPeriods(periodsData ?? [])
    setExceptions(exceptionsData)
    setLoading(false)
  }

  useEffect(() => {
    if (!staticData) loadData()
  }, [calendarId])

  useEffect(() => {
    if (staticData || !calendarId) return
    let cancelled = false
    setFeedNotice(null)

    const loadFeed = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return

      try {
        const res = await fetch('/api/feed/events', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ calendarId, from: `${year}-01-01`, to: `${year}-12-31` }),
        })
        const body = await res.json().catch(() => null)
        if (cancelled || !body) return

        if (body.ok && body.configured) {
          setFeed({ label: body.label, color: body.color, events: body.events })
        } else if (body.ok && !body.configured) {
          setFeed(null)
        } else if (body.reason === 'feed_unreachable') {
          setFeedNotice("L'emploi du temps en ligne est momentanément indisponible.")
        } else if (body.reason === 'secret_missing') {
          setFeedNotice("L'emploi du temps en ligne n'est pas encore configuré côté serveur.")
        }
      } catch {
        if (!cancelled) setFeedNotice("L'emploi du temps en ligne est momentanément indisponible.")
      }
    }

    loadFeed()
    return () => {
      cancelled = true
    }
  }, [calendarId, year])

  const exceptionsByPeriod = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const ex of exceptions) {
      const set = map.get(ex.period_id) ?? new Set<string>()
      set.add(ex.exception_date)
      map.set(ex.period_id, set)
    }
    return map
  }, [exceptions])

  const occurrencesByDate = useMemo(() => {
    const rangeStart = new Date(year, 0, 1)
    const rangeEnd = new Date(year, 11, 31)
    const all: Occurrence[] = generateAllOccurrences(periods, rangeStart, rangeEnd, exceptionsByPeriod)

    if (feed) {
      for (const e of feed.events) {
        all.push({
          periodId: 'feed',
          name: e.title,
          color: feed.color,
          date: e.date,
          startTime: e.start,
          endTime: e.end,
          segment: e.segment,
          readOnly: true,
          location: e.location,
        })
      }
    }

    const map = new Map<string, Occurrence[]>()
    for (const o of all) {
      const list = map.get(o.date) ?? []
      list.push(o)
      map.set(o.date, list)
    }
    return map
  }, [periods, year, exceptionsByPeriod, feed])

  const handleExportPDF = () => {
    const previousTitle = document.title
    document.title = `${calendarName} ${year}`
    window.print()
    document.title = previousTitle
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Chargement du calendrier...</p>

  const hasLegend = periods.length > 0 || !!feed

  return (
    <div>
      <div
        className="no-print"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.2rem', flexWrap: 'wrap',
          background: 'white', borderRadius: 12, padding: '0.7rem 1rem', boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)',
        }}
      >
        <button
          onClick={() => setYear((y) => y - 1)}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, color: 'var(--text-primary)', fontWeight: 700 }}
        >
          ◀
        </button>
        <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem', minWidth: 50, textAlign: 'center' }}>{year}</strong>
        <button
          onClick={() => setYear((y) => y + 1)}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, color: 'var(--text-primary)', fontWeight: 700 }}
        >
          ▶
        </button>
        <button
          onClick={handleExportPDF}
          style={{
            marginLeft: 'auto', background: 'var(--gradient-main)', color: 'white', border: 'none',
            borderRadius: 10, padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: 700,
          }}
        >
          Exporter en PDF
        </button>
      </div>

      {feedNotice && (
        <p
          className="no-print"
          style={{
            margin: '0 0 1rem', padding: '0.6rem 0.9rem', borderRadius: 10,
            background: '#fffbeb', color: '#92400e', fontSize: '0.85rem',
          }}
        >
          {feedNotice}
        </p>
      )}

      {periods.length === 0 && !feed && (
        <p className="no-print" style={{ color: 'var(--text-secondary)' }}>
          Aucune période définie{canEdit ? ' — ajoutez-en dans l\'onglet "Périodes".' : '.'}
        </p>
      )}

      <div
        className="printable-header"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem',
          marginBottom: '1.2rem',
        }}
      >
        <div
          className="printable-header-icon"
          style={{
            width: 44, height: 44, borderRadius: 12, background: calendarColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Icon name={calendarIcon} size={22} color="white" />
        </div>
        <h2 className="printable-title" style={{ margin: 0, color: 'var(--text-primary)' }}>{calendarName} — {year}</h2>
      </div>

      <div className="year-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
        {Array.from({ length: 12 }, (_, m) => (
          <MonthGrid
            key={m}
            year={year}
            month={m}
            occurrencesByDate={occurrencesByDate}
            onDayClick={(dateStr) => setSelectedDate(dateStr)}
            accentColor={calendarColor}
          />
        ))}
      </div>

      {hasLegend && (
        <div
          className="legend"
          style={{
            marginTop: '1.2rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap',
            background: 'white', borderRadius: 12, padding: '0.9rem 1.2rem', boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)',
          }}
        >
          {periods.map((p) => (
            <div
              key={p.id}
              className="legend-pill"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-primary)',
                background: `${p.color}18`, borderRadius: 999, padding: '0.3rem 0.7rem 0.3rem 0.4rem',
              }}
            >
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: p.color }} />
              {p.name}
            </div>
          ))}
          {feed && (
            <div
              className="legend-pill"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-primary)',
                background: `${feed.color}18`, borderRadius: 999, padding: '0.3rem 0.7rem 0.3rem 0.4rem',
              }}
            >
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: feed.color }} />
              {feed.label}
            </div>
          )}
        </div>
      )}

      {selectedDate && (
        <div className="no-print">
          <DayDetail
            date={selectedDate}
            occurrences={occurrencesByDate.get(selectedDate) ?? []}
            canEdit={canEdit}
            onClose={() => setSelectedDate(null)}
            onChanged={() => {
              if (!staticData) loadData()
              setSelectedDate(null)
            }}
          />
        </div>
      )}
    </div>
  )
}
