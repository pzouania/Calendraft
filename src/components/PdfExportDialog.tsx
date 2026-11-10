import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../hooks/useI18n'
import { addDays, groupByDate, mondayOf, weekStartsBetween } from '../lib/printLayout'
import { holidaysByDay, type SchoolZone } from '../lib/schoolHolidays'
import { toDateOnly } from '../lib/dateUtils'
import type { Occurrence } from '../types'
import { MonthSheet, PRINT_ROOT_ID, PRINT_STYLE, WeekSheet, type LegendItem } from './PrintSheets'

type ExportKind = 'year' | 'month' | 'week'

type Job = { kind: 'month'; index: number } | { kind: 'week'; index: number }

export interface PdfExportDialogProps {
  calendarName: string
  calendarIcon: string
  calendarColor: string
  // Les 12 mois de l'année affichée (de janvier à décembre, ou de septembre à août en année scolaire).
  months: { year: number; month: number }[]
  rangeStart: Date
  rangeEnd: Date
  // Mois proposé au départ.
  initialMonthIndex: number
  legend: LegendItem[]
  // Zone de vacances scolaires du calendrier : les jours de vacances sont colorés sur les feuilles (mois et semaine).
  schoolZone?: SchoolZone | null
  // Événements (du calendrier et importés) entre deux dates incluses, y compris au-delà de l'année affichée.
  getOccurrences: (start: Date, end: Date) => Occurrence[]
  // Export de l'année : l'impression habituelle de la page.
  onExportYear: () => void
  onClose: () => void
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Monte la feuille dans la page, ouvre la fenêtre d'impression, puis retire la feuille quand l'impression se termine.
function PrintJob({ title, children, onDone }: { title: string; children: React.ReactNode; onDone: () => void }) {
  const [host] = useState(() => {
    const el = document.createElement('div')
    el.id = PRINT_ROOT_ID
    return el
  })
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    document.body.appendChild(host)
    const previousTitle = document.title
    document.title = title
    let finished = false
    let frame = 0
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null

    const cleanup = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', finish)
      mq?.removeEventListener?.('change', onChange)
      document.title = previousTitle
      host.remove()
    }
    function finish() {
      if (finished) return
      finished = true
      cleanup()
      doneRef.current?.()
    }
    function onChange(e: MediaQueryListEvent) {
      if (!e.matches) finish()
    }

    window.addEventListener('afterprint', finish)
    mq?.addEventListener?.('change', onChange)
    // Deux images d'attente pour que la feuille soit mise en page avant d'imprimer.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (typeof window.print === 'function') window.print()
        else finish()
      })
    })

    return () => {
      if (!finished) {
        finished = true
        cleanup()
      }
    }
  }, [host, title])

  return createPortal(
    <>
      <style>{PRINT_STYLE}</style>
      {children}
    </>,
    host,
  )
}

// Fenêtre ouverte par « Exporter en PDF » : l'année, un mois ou une semaine (emploi du temps).
export default function PdfExportDialog({
  calendarName, calendarIcon, calendarColor, months, rangeStart, rangeEnd, initialMonthIndex, legend, schoolZone = null, getOccurrences,
  onExportYear, onClose,
}: PdfExportDialogProps) {
  const { t, monthName, formatDate } = useI18n()
  const dialogRef = useRef<HTMLDivElement>(null)
  const weeks = useMemo(() => weekStartsBetween(rangeStart, rangeEnd), [rangeStart, rangeEnd])

  const [kind, setKind] = useState<ExportKind>('year')
  const [monthIndex, setMonthIndex] = useState(Math.min(Math.max(initialMonthIndex, 0), months.length - 1))
  const [weekIndex, setWeekIndex] = useState(() => {
    const today = new Date()
    const inRange = today >= rangeStart && today <= addDays(rangeEnd, 1)
    const anchor = inRange ? today : new Date(months[initialMonthIndex]?.year ?? rangeStart.getFullYear(), months[initialMonthIndex]?.month ?? 0, 1)
    const found = weeks.findIndex((w) => w.getTime() === mondayOf(anchor).getTime())
    return found >= 0 ? found : 0
  })
  const [job, setJob] = useState<Job | null>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    if (job) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [job, onClose])

  const monthLabel = (i: number) => `${capitalize(monthName(months[i].month))} ${months[i].year}`
  const weekRange = (monday: Date) =>
    `${formatDate(monday, { day: 'numeric', month: 'short' })} – ${formatDate(addDays(monday, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`

  const sheet = useMemo(() => {
    if (!job) return null
    if (job.kind === 'month') {
      const { year, month } = months[job.index]
      const byDate = groupByDate(getOccurrences(new Date(year, month, 1), new Date(year, month + 1, 0)))
      const holidays = schoolZone ? holidaysByDay(schoolZone, toDateOnly(new Date(year, month, 1)), toDateOnly(new Date(year, month + 1, 0))) : undefined
      return {
        title: `${calendarName} ${capitalize(monthName(month))} ${year}`,
        node: (
          <MonthSheet
            year={year} month={month} byDate={byDate} legend={legend} holidays={holidays} holidayZone={schoolZone}
            calendarName={calendarName} calendarIcon={calendarIcon} calendarColor={calendarColor}
          />
        ),
      }
    }
    const monday = weeks[job.index]
    const byDate = groupByDate(getOccurrences(monday, addDays(monday, 6)))
    const holidays = schoolZone ? holidaysByDay(schoolZone, toDateOnly(monday), toDateOnly(addDays(monday, 6))) : undefined
    return {
      title: `${calendarName} ${weekRange(monday)}`,
      node: (
        <WeekSheet
          monday={monday} byDate={byDate} legend={legend} holidays={holidays} holidayZone={schoolZone}
          calendarName={calendarName} calendarIcon={calendarIcon} calendarColor={calendarColor}
        />
      ),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job])

  const submit = () => {
    if (kind === 'year') {
      onClose()
      onExportYear()
      return
    }
    setJob(kind === 'month' ? { kind: 'month', index: monthIndex } : { kind: 'week', index: weekIndex })
  }

  if (job && sheet) {
    return (
      <PrintJob title={sheet.title} onDone={onClose}>
        {sheet.node}
      </PrintJob>
    )
  }

  const choices: { id: ExportKind; title: string; hint: string }[] = [
    { id: 'year', title: t('calendar.view.year'), hint: t('pdf.kind.year.hint') },
    { id: 'month', title: t('calendar.view.month'), hint: t('pdf.kind.month.hint') },
    { id: 'week', title: t('pdf.kind.week.title'), hint: t('pdf.kind.week.hint') },
  ]

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.7rem', borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.9rem', minWidth: 0,
  }
  const stepStyle: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 10, border: 'none', background: 'var(--surface-alt)', color: 'var(--text-primary)',
    fontWeight: 700, flexShrink: 0,
  }

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--overlay)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-export-title"
        style={{
          backgroundColor: 'var(--surface)', borderRadius: 16, width: 'min(460px, 94vw)', maxHeight: '88vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-modal)', outline: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: '1rem',
          }}
        >
          <h3 id="pdf-export-title" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
            {t('calendar.exportPdf')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none', background: 'var(--surface-alt)',
              color: 'var(--text-body)', fontSize: '1.2rem', lineHeight: 1, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={{ padding: 0, marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('pdf.legend')}
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {choices.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: 10,
                    background: kind === c.id ? 'var(--surface-tint)' : 'var(--surface-faint)', borderStyle: 'solid', borderWidth: 1,
                    borderColor: kind === c.id ? 'var(--tint-border)' : 'transparent', cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio" name="pdf-export-kind" value={c.id} checked={kind === c.id}
                    onChange={() => setKind(c.id)} style={{ marginTop: 3 }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{c.title}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {kind === 'month' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('calendar.view.month')}
              <select value={monthIndex} onChange={(e) => setMonthIndex(Number(e.target.value))} style={fieldStyle}>
                {months.map((_, i) => (
                  <option key={i} value={i}>
                    {monthLabel(i)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {kind === 'week' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor="pdf-export-week" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('pdf.kind.week.title')}
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button
                  type="button" aria-label={t('pdf.week.prev')} disabled={weekIndex === 0} style={{ ...stepStyle, opacity: weekIndex === 0 ? 0.4 : 1 }}
                  onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
                >
                  ◀
                </button>
                <select id="pdf-export-week" value={weekIndex} onChange={(e) => setWeekIndex(Number(e.target.value))} style={fieldStyle}>
                  {weeks.map((w, i) => (
                    <option key={i} value={i}>
                      {weekRange(w)}
                    </option>
                  ))}
                </select>
                <button
                  type="button" aria-label={t('pdf.week.next')} disabled={weekIndex === weeks.length - 1}
                  style={{ ...stepStyle, opacity: weekIndex === weeks.length - 1 ? 0.4 : 1 }}
                  onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
                >
                  ▶
                </button>
              </div>
            </div>
          )}

          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {t('pdf.hint')}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'var(--surface-alt)', color: 'var(--text-body)', border: 'none', borderRadius: 10,
                padding: '0.6rem 1.1rem', fontSize: '0.88rem', fontWeight: 700,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              style={{
                background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none', borderRadius: 10,
                padding: '0.6rem 1.2rem', fontSize: '0.88rem', fontWeight: 700,
              }}
            >
              {t('pdf.export')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
