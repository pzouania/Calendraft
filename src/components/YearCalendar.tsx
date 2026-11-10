import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { generateAllOccurrences } from '../lib/occurrenceEngine'
import { useI18n } from '../hooks/useI18n'
import type { TranslationKey } from '../i18n'
import MonthGrid from './MonthGrid'
import DayDetail from './DayDetail'
import PdfExportDialog from './PdfExportDialog'
import IcsExportDialog from './IcsExportDialog'
import { toDateOnly } from '../lib/dateUtils'
import { snapshotLabel } from '../lib/partialShare'
import { HOLIDAY_COLOR, holidayLegendLabel, holidaysByDay, outsideCoverage, HOLIDAY_COVERAGE, type SchoolZone } from '../lib/schoolHolidays'
import Icon from './icons'
import type { Period, Occurrence, PeriodException, YearMode } from '../types'

interface YearCalendarProps {
  calendarId: string
  calendarName: string
  calendarIcon: string
  calendarColor: string
  canEdit: boolean
  // Propriétaire du calendrier : peut partager un jour ou un événement.
  canShare?: boolean
  yearMode?: YearMode
  // Zone de vacances scolaires du calendrier (A, B ou C) : les jours de vacances sont colorés. Absente : rien n'est affiché.
  schoolZone?: SchoolZone | null
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

function currentStartYear(mode: YearMode): number {
  const now = new Date()
  if (mode === 'school') return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return now.getFullYear()
}

function buildMonths(year: number, isSchool: boolean): { year: number; month: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    if (isSchool) {
      const m = (8 + i) % 12
      return { year: m >= 8 ? year : year + 1, month: m }
    }
    return { year, month: i }
  })
}

// Position (0 à 11) du mois en cours dans l'année affichée, ou 0 si on est hors de cette année.
function initialMonthIndex(year: number, isSchool: boolean): number {
  const now = new Date()
  const idx = buildMonths(year, isSchool).findIndex(
    (m) => m.year === now.getFullYear() && m.month === now.getMonth()
  )
  return idx >= 0 ? idx : 0
}

// Décale une date « AAAA-MM-JJ » de quelques jours.
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return toDateOnly(new Date(y, m - 1, d + days))
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

// Première lettre en majuscule (les mois s'écrivent en minuscules en français).
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Sur téléphone, la grille des 12 mois est masquée à l'écran mais reste utilisée pour l'impression (PDF).
const PRINT_RULES = `
@media print {
  .year-grid-print-only { display: grid !important; }
  .printable-header-print-only { display: flex !important; }
}
`

export default function YearCalendar({
  calendarId,
  calendarName,
  calendarIcon,
  calendarColor,
  canEdit,
  canShare = false,
  yearMode = 'calendar',
  schoolZone = null,
  staticData,
}: YearCalendarProps) {
  const { t, monthName, formatDate } = useI18n()
  const [periods, setPeriods] = useState<Period[]>(staticData?.periods ?? [])
  const [exceptions, setExceptions] = useState<PeriodException[]>(staticData?.exceptions ?? [])
  const [year, setYear] = useState(() => currentStartYear(yearMode))
  const [loading, setLoading] = useState(!staticData)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [feed, setFeed] = useState<FeedInfo | null>(null)
  // Clé de traduction (et non le texte) : le message suit la langue même si elle change pendant qu'il est affiché.
  const [feedNotice, setFeedNotice] = useState<TranslationKey | null>(null)
  // Emploi du temps en ligne injoignable : date de la dernière copie affichée à la place (sinon null).
  const [feedStaleAt, setFeedStaleAt] = useState<string | null>(null)
  const isNarrow = useIsNarrow()
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month')
  // Fenêtre « Exporter en PDF » (année, mois ou semaine).
  const [exportOpen, setExportOpen] = useState(false)
  // Fenêtre « Exporter vers un agenda » (fichier .ics et lien de synchronisation).
  const [icsOpen, setIcsOpen] = useState(false)

  const isSchool = yearMode === 'school'
  const [monthIdx, setMonthIdx] = useState(() => initialMonthIndex(year, isSchool))
  const yearLabel = isSchool ? `${year}-${year + 1}` : String(year)

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
    setFeedStaleAt(null)

    // 7 jours de marge de chaque côté : une semaine exportée en PDF peut déborder sur l'année voisine.
    const from = shiftDate(isSchool ? `${year}-09-01` : `${year}-01-01`, -7)
    const to = shiftDate(isSchool ? `${year + 1}-08-31` : `${year}-12-31`, 7)

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
          body: JSON.stringify({ calendarId, from, to }),
        })
        const body = await res.json().catch(() => null)
        if (cancelled || !body) return

        if (body.ok && body.configured) {
          setFeed({ label: body.label, color: body.color, events: body.events })
          setFeedStaleAt(body.stale && typeof body.snapshotAt === 'string' ? body.snapshotAt : null)
        } else if (body.ok && !body.configured) {
          setFeed(null)
        } else if (body.reason === 'feed_unreachable') {
          setFeedNotice('calendar.feed.unavailable')
        } else if (body.reason === 'secret_missing') {
          setFeedNotice('calendar.feed.notConfigured')
        }
      } catch {
        if (!cancelled) setFeedNotice('calendar.feed.unavailable')
      }
    }

    loadFeed()
    return () => {
      cancelled = true
    }
  }, [calendarId, year, yearMode])

  const exceptionsByPeriod = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const ex of exceptions) {
      const set = map.get(ex.period_id) ?? new Set<string>()
      set.add(ex.exception_date)
      map.set(ex.period_id, set)
    }
    return map
  }, [exceptions])

  const months = useMemo(() => buildMonths(year, isSchool), [year, isSchool])

  // Événements importés (emploi du temps en ligne), sous la même forme que les événements du calendrier.
  const feedOccurrences = useMemo<Occurrence[]>(
    () =>
      feed
        ? feed.events.map((e) => ({
            periodId: 'feed',
            name: e.title,
            color: feed.color,
            date: e.date,
            startTime: e.start,
            endTime: e.end,
            segment: e.segment,
            readOnly: true,
            location: e.location,
            feedUid: e.uid || undefined,
          }))
        : [],
    [feed],
  )

  const occurrencesByDate = useMemo(() => {
    const rangeStart = isSchool ? new Date(year, 8, 1) : new Date(year, 0, 1)
    const rangeEnd = isSchool ? new Date(year + 1, 7, 31) : new Date(year, 11, 31)
    const all: Occurrence[] = generateAllOccurrences(periods, rangeStart, rangeEnd, exceptionsByPeriod)

    all.push(...feedOccurrences)

    const map = new Map<string, Occurrence[]>()
    for (const o of all) {
      const list = map.get(o.date) ?? []
      list.push(o)
      map.set(o.date, list)
    }
    return map
  }, [periods, year, isSchool, exceptionsByPeriod, feedOccurrences])

  // Jours de vacances scolaires de l'année affichée (avec 7 jours de marge : une semaine imprimée peut déborder sur l'année voisine).
  const holidaysByDate = useMemo(() => {
    if (!schoolZone) return undefined
    const from = isSchool ? `${year}-09-01` : `${year}-01-01`
    const to = isSchool ? `${year + 1}-08-31` : `${year}-12-31`
    return holidaysByDay(schoolZone, shiftDate(from, -7), shiftDate(to, 7))
  }, [schoolZone, year, isSchool])
  // Une partie de l'année affichée est hors des dates connues : on le dit plutôt que de laisser croire qu'il n'y a pas de vacances.
  const holidayGap = useMemo(() => {
    if (!schoolZone) return false
    const from = isSchool ? `${year}-09-01` : `${year}-01-01`
    const to = isSchool ? `${year + 1}-08-31` : `${year}-12-31`
    return outsideCoverage(from, to)
  }, [schoolZone, year, isSchool])

  // Bornes de l'année affichée et événements entre deux dates (la semaine à exporter peut déborder sur l'année voisine).
  const exportRangeStart = useMemo(() => (isSchool ? new Date(year, 8, 1) : new Date(year, 0, 1)), [year, isSchool])
  const exportRangeEnd = useMemo(() => (isSchool ? new Date(year + 1, 7, 31) : new Date(year, 11, 31)), [year, isSchool])
  const getOccurrencesBetween = (start: Date, end: Date): Occurrence[] => {
    const first = toDateOnly(start)
    const last = toDateOnly(end)
    return [
      ...generateAllOccurrences(periods, start, end, exceptionsByPeriod),
      ...feedOccurrences.filter((o) => o.date >= first && o.date <= last),
    ]
  }

  // Impression de l'année : la page elle-même (grille des 12 mois).
  const handleExportPDF = () => {
    const previousTitle = document.title
    document.title = `${calendarName} ${yearLabel}`
    window.print()
    document.title = previousTitle
  }

  const monthView = isNarrow && viewMode === 'month'
  const currentMonth = months[monthIdx] ?? months[0]
  const now = new Date()
  const isCurrentMonth = currentMonth.year === now.getFullYear() && currentMonth.month === now.getMonth()

  const goPrev = () => {
    if (!monthView) {
      setYear((y) => y - 1)
    } else if (monthIdx === 0) {
      setYear((y) => y - 1)
      setMonthIdx(11)
    } else {
      setMonthIdx(monthIdx - 1)
    }
  }

  const goNext = () => {
    if (!monthView) {
      setYear((y) => y + 1)
    } else if (monthIdx === 11) {
      setYear((y) => y + 1)
      setMonthIdx(0)
    } else {
      setMonthIdx(monthIdx + 1)
    }
  }

  const goToday = () => {
    const startYear = currentStartYear(yearMode)
    setYear(startYear)
    setMonthIdx(initialMonthIndex(startYear, isSchool))
  }

  const openMonth = (index: number) => {
    setMonthIdx(index)
    setViewMode('month')
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>{t('calendar.loading')}</p>

  const hasLegend = periods.length > 0 || !!feed || !!schoolZone
  const navButtonSize = isNarrow ? 40 : 32
  const toolbarTitle = monthView ? `${capitalize(monthName(currentMonth.month))} ${currentMonth.year}` : yearLabel

  const navButtonStyle: React.CSSProperties = {
    background: 'var(--surface-alt)', border: 'none', borderRadius: 8,
    width: navButtonSize, height: navButtonSize, color: 'var(--text-primary)', fontWeight: 700, flexShrink: 0,
  }

  const modeButtonStyle = (active: boolean): React.CSSProperties => ({
    border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700,
    background: active ? 'var(--gradient-main)' : 'transparent',
    color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
  })

  const monthCards = months.map(({ year: y, month: m }) => (
    <MonthGrid
      key={`${y}-${m}`}
      year={y}
      month={m}
      occurrencesByDate={occurrencesByDate}
      onDayClick={(dateStr) => setSelectedDate(dateStr)}
      accentColor={calendarColor}
      showYear={isSchool}
      holidaysByDate={holidaysByDate}
      holidayZone={schoolZone}
    />
  ))

  return (
    <div>
      <style>{PRINT_RULES}</style>

      {isNarrow ? (
        <div
          className="no-print"
          style={{
            display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.9rem',
            background: 'var(--surface)', borderRadius: 12, padding: '0.6rem', boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--surface-alt)', padding: 3, borderRadius: 10 }}>
              <button type="button" onClick={() => setViewMode('month')} style={modeButtonStyle(viewMode === 'month')}>
                {t('calendar.view.month')}
              </button>
              <button type="button" onClick={() => setViewMode('year')} style={modeButtonStyle(viewMode === 'year')}>
                {t('calendar.view.year')}
              </button>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {monthView && !isCurrentMonth && (
                <button
                  type="button"
                  onClick={goToday}
                  style={{
                    background: 'var(--surface-tint)', color: 'var(--accent-text)', border: '1px solid var(--tint-border)',
                    borderRadius: 10, padding: '0.45rem 0.8rem', fontSize: '0.82rem', fontWeight: 700,
                  }}
                >
                  {t('calendar.today')}
                </button>
              )}
              <button
                type="button"
                data-testid="ics-open"
                onClick={() => setIcsOpen(true)}
                aria-label="Exporter vers un agenda"
                style={{
                  background: 'var(--surface)', color: 'var(--accent-link)', border: 'none', boxShadow: 'inset 0 0 0 1px var(--tint-border)',
                  borderRadius: 10, padding: '0.45rem 0.8rem', fontSize: '0.82rem', fontWeight: 700,
                }}
              >
                Agenda
              </button>
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                aria-label={t('calendar.exportPdf')}
                style={{
                  background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
                  borderRadius: 10, padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700,
                }}
              >
                PDF
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={goPrev}
              aria-label={monthView ? t('calendar.prevMonth') : t('calendar.prevYear')}
              style={navButtonStyle}
            >
              ◀
            </button>
            <strong
              style={{
                flex: 1, textAlign: 'center', color: 'var(--text-primary)', fontSize: '1.1rem',
              }}
            >
              {toolbarTitle}
            </strong>
            <button
              type="button"
              onClick={goNext}
              aria-label={monthView ? t('calendar.nextMonth') : t('calendar.nextYear')}
              style={navButtonStyle}
            >
              ▶
            </button>
          </div>
        </div>
      ) : (
        <div
          className="no-print"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.2rem', flexWrap: 'wrap',
            background: 'var(--surface)', borderRadius: 12, padding: '0.7rem 1rem', boxShadow: 'var(--shadow-sm)',
          }}
        >
          <button
            onClick={goPrev}
            aria-label={t('calendar.prevYear')}
            style={{ background: 'var(--surface-alt)', border: 'none', borderRadius: 8, width: 32, height: 32, color: 'var(--text-primary)', fontWeight: 700 }}
          >
            ◀
          </button>
          <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem', minWidth: isSchool ? 100 : 50, textAlign: 'center' }}>
            {yearLabel}
          </strong>
          <button
            onClick={goNext}
            aria-label={t('calendar.nextYear')}
            style={{ background: 'var(--surface-alt)', border: 'none', borderRadius: 8, width: 32, height: 32, color: 'var(--text-primary)', fontWeight: 700 }}
          >
            ▶
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              data-testid="ics-open"
              onClick={() => setIcsOpen(true)}
              style={{
                background: 'var(--surface)', color: 'var(--accent-link)', border: 'none', boxShadow: 'inset 0 0 0 1px var(--tint-border)',
                borderRadius: 10, padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: 700,
              }}
            >
              Exporter vers un agenda
            </button>
            <button
              onClick={() => setExportOpen(true)}
              style={{
                background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
                borderRadius: 10, padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: 700,
              }}
            >
              {t('calendar.exportPdf')}
            </button>
          </div>
        </div>
      )}

      {feedNotice && (
        <p
          className="no-print"
          style={{
            margin: '0 0 1rem', padding: '0.6rem 0.9rem', borderRadius: 10,
            background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.85rem',
          }}
        >
          {t(feedNotice)}
        </p>
      )}

      {feedStaleAt && (
        <p
          role="status"
          className="no-print"
          style={{
            margin: '0 0 1rem', padding: '0.6rem 0.9rem', borderRadius: 10,
            background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.85rem',
          }}
        >
          Emploi du temps en ligne injoignable : les événements importés viennent de la dernière copie enregistrée
          {snapshotLabel(feedStaleAt, formatDate) ? ` le ${snapshotLabel(feedStaleAt, formatDate)}` : ''}.
        </p>
      )}

      {periods.length === 0 && !feed && (
        <p className="no-print" style={{ color: 'var(--text-secondary)' }}>
          {t(canEdit ? 'calendar.noEvents.canEdit' : 'calendar.noEvents')}
        </p>
      )}

      <div
        className={isNarrow ? 'printable-header printable-header-print-only' : 'printable-header'}
        style={{
          display: isNarrow ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem',
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
        <h2 className="printable-title" style={{ margin: 0, color: 'var(--text-primary)' }}>
          {calendarName} — {yearLabel}
        </h2>
      </div>

      {isNarrow && viewMode === 'month' && (
        <div className="no-print">
          <MonthGrid
            key={`${currentMonth.year}-${currentMonth.month}`}
            large
            year={currentMonth.year}
            month={currentMonth.month}
            occurrencesByDate={occurrencesByDate}
            onDayClick={(dateStr) => setSelectedDate(dateStr)}
            accentColor={calendarColor}
            showYear={isSchool}
            holidaysByDate={holidaysByDate}
            holidayZone={schoolZone}
          />
        </div>
      )}

      {isNarrow && viewMode === 'year' && (
        <div className="no-print">
          <p style={{ margin: '0 0 0.7rem', fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {t('calendar.tapMonth')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
            {months.map(({ year: y, month: m }, index) => (
              <div key={`${y}-${m}`} onClick={() => openMonth(index)} style={{ cursor: 'pointer' }}>
                <MonthGrid
                  compact
                  year={y}
                  month={m}
                  occurrencesByDate={occurrencesByDate}
                  onDayClick={() => undefined}
                  accentColor={calendarColor}
                  showYear={isSchool}
                  holidaysByDate={holidaysByDate}
                  holidayZone={schoolZone}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className={isNarrow ? 'year-grid year-grid-print-only' : 'year-grid'}
        style={{
          display: isNarrow ? 'none' : 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '1rem',
        }}
      >
        {monthCards}
      </div>

      {hasLegend && (
        <div
          className="legend"
          style={{
            marginTop: isNarrow ? '0.9rem' : '1.2rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap',
            background: 'var(--surface)', borderRadius: 12, padding: isNarrow ? '0.7rem 0.8rem' : '0.9rem 1.2rem',
            boxShadow: 'var(--shadow-sm)',
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
          {schoolZone && (
            <div
              className="legend-pill"
              data-testid="holiday-legend"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-primary)',
                background: `${HOLIDAY_COLOR}18`, borderRadius: 999, padding: '0.3rem 0.7rem 0.3rem 0.4rem',
              }}
            >
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, backgroundColor: HOLIDAY_COLOR }} />
              {holidayLegendLabel(schoolZone)}
            </div>
          )}
        </div>
      )}

      {schoolZone && holidayGap && (
        <p
          className="no-print"
          data-testid="holiday-gap"
          style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}
        >
          Les dates des vacances scolaires sont connues de septembre {HOLIDAY_COVERAGE.from.slice(0, 4)} à août {HOLIDAY_COVERAGE.to.slice(0, 4)} :
          cette année n’est pas entièrement couverte.
        </p>
      )}

      {exportOpen && (
        <PdfExportDialog
          calendarName={calendarName}
          calendarIcon={calendarIcon}
          calendarColor={calendarColor}
          months={months}
          rangeStart={exportRangeStart}
          rangeEnd={exportRangeEnd}
          initialMonthIndex={monthView ? monthIdx : initialMonthIndex(year, isSchool)}
          schoolZone={schoolZone}
          legend={[
            ...periods.map((p) => ({ id: p.id, label: p.name, color: p.color })),
            ...(feed ? [{ id: 'feed', label: feed.label, color: feed.color }] : []),
          ]}
          getOccurrences={getOccurrencesBetween}
          onExportYear={handleExportPDF}
          onClose={() => setExportOpen(false)}
        />
      )}

      {icsOpen && (
        <IcsExportDialog
          calendarId={calendarId}
          calendarName={calendarName}
          calendarColor={calendarColor}
          periods={periods}
          exceptions={exceptions}
          yearLabel={yearLabel}
          yearFrom={toDateOnly(exportRangeStart)}
          yearTo={toDateOnly(exportRangeEnd)}
          canManageLink={canShare && !staticData && Boolean(calendarId)}
          schoolZone={schoolZone}
          loadImported={!staticData && Boolean(calendarId)}
          onClose={() => setIcsOpen(false)}
        />
      )}

      {selectedDate && (
        <div className="no-print">
          <DayDetail
            date={selectedDate}
            occurrences={occurrencesByDate.get(selectedDate) ?? []}
            holiday={schoolZone ? holidaysByDate?.get(selectedDate) ?? null : null}
            holidayZone={schoolZone}
            canEdit={canEdit}
            shareCalendarId={canShare && !staticData && calendarId ? calendarId : undefined}
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
