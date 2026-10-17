import { getMonthMatrix, toDateOnly, MONTH_NAMES, DAY_LETTERS } from '../lib/dateUtils'
import type { Occurrence } from '../types'

const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MAX_BARS = 3

interface MonthGridProps {
  year: number
  month: number
  occurrencesByDate: Map<string, Occurrence[]>
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
  onDayClick,
  accentColor = 'var(--blue-main)',
  showYear = false,
  large = false,
  compact = false,
}: MonthGridProps) {
  const weeks = getMonthMatrix(year, month)
  const todayStr = toDateOnly(new Date())
  const weekdayLabels = large ? DAY_SHORT : DAY_LETTERS

  // Mesures selon la taille d'affichage (la taille normale reste celle d'origine).
  const pad = large ? '0.8rem' : compact ? '0.4rem' : '0.7rem'
  const gap = large ? 4 : compact ? 1 : 2
  const columns = 'repeat(7, minmax(0, 1fr))'

  return (
    <div
      className="month-card"
      style={{
        background: 'white', borderRadius: 12, padding: pad,
        boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)', overflow: 'hidden',
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
        {MONTH_NAMES[month]}
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
            return (
              <div
                key={di}
                className={`month-day-cell${isToday ? ' today-cell' : ''}`}
                onClick={() => onDayClick(dateStr)}
                style={{
                  minHeight: large ? 58 : compact ? 22 : 26,
                  fontSize: large ? '0.9rem' : compact ? '0.6rem' : '0.68rem',
                  padding: large ? 4 : compact ? 1 : 2,
                  cursor: 'pointer',
                  borderRadius: large ? 8 : compact ? 4 : 6,
                  background: isToday ? '#eff6ff' : isWeekend ? '#f8fafc' : 'transparent',
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
