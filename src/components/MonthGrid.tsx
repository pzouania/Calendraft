import { getMonthMatrix, toDateOnly } from '../lib/dateUtils'
import { holidayLabel, type SchoolHoliday, type SchoolZone } from '../lib/schoolHolidays'
import { useI18n } from '../hooks/useI18n'
import type { Occurrence } from '../types'

const MAX_BARS = 3

// Jours de vacances scolaires : fond ambre léger posé SUR le fond du jour (week-end, aujourd'hui), lisible en clair comme en sombre
// et à l'impression.
const HOLIDAY_TINT = 'linear-gradient(rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.2))'

// Première lettre en majuscule (les mois et les jours s'écrivent en minuscules en français).
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

interface MonthGridProps {
  year: number
  month: number
  occurrencesByDate: Map<string, Occurrence[]>
  /** Jours de vacances scolaires (clé AAAA-MM-JJ) et zone choisie : fond coloré et infobulle sur ces jours. */
  holidaysByDate?: Map<string, SchoolHoliday>
  holidayZone?: SchoolZone | null
  onDayClick: (dateStr: string) => void
  accentColor?: string
  showYear?: boolean
  /** Affichage agrandi (un seul mois à l'écran, utilisé sur téléphone). */
  large?: boolean
  /** Affichage réduit (aperçu de l'année sur 2 colonnes, utilisé sur téléphone). */
  compact?: boolean
}

export default function MonthGrid({
  year,
  month,
  occurrencesByDate,
  holidaysByDate,
  holidayZone,
  onDayClick,
  accentColor = 'var(--blue-main)',
  showYear = false,
  large = false,
  compact = false,
}: MonthGridProps) {
  const { monthName, weekdayName } = useI18n()
  const weeks = getMonthMatrix(year, month)
  const todayStr = toDateOnly(new Date())
  // Jours de la semaine, du lundi au dimanche : abrégés (« Lun ») en grand, une lettre sinon.
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    large ? capitalize(weekdayName(i, 'short').replace(/\.$/, '')) : capitalize(weekdayName(i, 'narrow')),
  )

  // Mesures selon la taille d'affichage (la taille normale reste celle d'origine).
  const pad = large ? '0.8rem' : compact ? '0.4rem' : '0.7rem'
  const gap = large ? 4 : compact ? 1 : 2
  const columns = 'repeat(7, minmax(0, 1fr))'

  return (
    <div
      className="month-card"
      style={{
        background: 'var(--surface)', borderRadius: 12, padding: pad,
        boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}
    >
      <div
        className="month-card-header"
        style={{
          margin: `-${pad} -${pad} ${large ? '0.7rem' : compact ? '0.4rem' : '0.6rem'}`,
          padding: large ? '0.65rem 0.8rem' : compact ? '0.35rem 0.4rem' : '0.5rem 0.7rem',
          background: accentColor, color: 'white', textAlign: 'center',
          fontSize: large ? '1rem' : compact ? '0.8rem' : '0.9rem', fontWeight: 700,
        }}
      >
        {capitalize(monthName(month))}
        {showYear || large ? ` ${year}` : ''}
      </div>
      <div
        className="month-weekday-row"
        style={{
          display: 'grid', gridTemplateColumns: columns, gap,
          fontSize: large ? '0.72rem' : compact ? '0.55rem' : '0.65rem', textAlign: 'center',
          color: 'var(--text-secondary)', marginBottom: gap,
        }}
      >
        {weekdayLabels.map((l, i) => (
          <div key={i} style={{ fontWeight: i >= 5 ? 700 : 400 }}>{l}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div
          key={wi}
          style={{ display: 'grid', gridTemplateColumns: columns, gap, marginBottom: large ? 4 : 0 }}
        >
          {week.map((day, di) => {
            if (!day) return <div key={di} />
            const dateStr = toDateOnly(day)
            const occs = occurrencesByDate.get(dateStr) ?? []
            const uniqueOccs = occs.filter(
              (o, i) => occs.findIndex((x) => x.periodId === o.periodId) === i
            )
            const isToday = dateStr === todayStr
            const isWeekend = di >= 5
            const extra = uniqueOccs.length - MAX_BARS
            const holiday = holidayZone ? holidaysByDate?.get(dateStr) : undefined
            return (
              <div
                key={di}
                className={`month-day-cell${isToday ? ' today-cell' : ''}`}
                data-date={dateStr}
                data-holiday={holiday ? holiday.kind : undefined}
                title={holiday && holidayZone ? holidayLabel(holiday.kind, holidayZone) : undefined}
                onClick={() => onDayClick(dateStr)}
                style={{
                  minHeight: large ? 58 : compact ? 22 : 26,
                  fontSize: large ? '0.9rem' : compact ? '0.6rem' : '0.68rem',
                  padding: large ? 4 : compact ? 1 : 2,
                  cursor: 'pointer',
                  borderRadius: large ? 8 : compact ? 4 : 6,
                  background: isToday ? 'var(--surface-tint)' : isWeekend ? 'var(--surface-faint)' : 'transparent',
                  backgroundImage: holiday ? HOLIDAY_TINT : undefined,
                  border: isToday ? `1px solid ${accentColor}` : '1px solid transparent',
                }}
              >
                <div style={{ color: isToday ? accentColor : 'var(--text-primary)', fontWeight: isToday ? 700 : 400 }}>
                  {day.getDate()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: large ? 2 : 1, marginTop: large ? 4 : compact ? 1 : 2 }}>
                  {uniqueOccs.slice(0, MAX_BARS).map((o, oi) => (
                    <div
                      key={oi}
                      style={{ height: large ? 5 : compact ? 2 : 3, backgroundColor: o.color, borderRadius: 2 }}
                      title={o.name}
                    />
                  ))}
                  {large && extra > 0 && (
                    <div style={{ fontSize: '0.62rem', lineHeight: 1, color: 'var(--text-secondary)', fontWeight: 700 }}>
                      +{extra}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
