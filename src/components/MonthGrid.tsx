import {
  getMonthMatrix,
  toDateOnly,
  MONTH_NAMES,
  DAY_LETTERS,
} from '../lib/dateUtils';
import type { Occurrence } from '../types';

interface MonthGridProps {
  year: number;
  month: number;
  occurrencesByDate: Map<string, Occurrence[]>;
  onDayClick: (dateStr: string) => void;
  accentColor?: string;
}

export default function MonthGrid({
  year,
  month,
  occurrencesByDate,
  onDayClick,
  accentColor = 'var(--blue-main)',
}: MonthGridProps) {
  const weeks = getMonthMatrix(year, month);
  const todayStr = toDateOnly(new Date());

  return (
    <div
      className="month-card"
      style={{
        background: 'white',
        borderRadius: 12,
        padding: '0.7rem',
        boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)',
        overflow: 'hidden',
      }}
    >
      <div
        className="month-card-header"
        style={{
          margin: '-0.7rem -0.7rem 0.6rem',
          padding: '0.5rem 0.7rem',
          background: accentColor,
          color: 'white',
          textAlign: 'center',
          fontSize: '0.9rem',
          fontWeight: 700,
        }}
      >
        {MONTH_NAMES[month]}
      </div>
      <div
        className="month-weekday-row"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
          fontSize: '0.65rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          marginBottom: 2,
        }}
      >
        {DAY_LETTERS.map((l, i) => (
          <div key={i} style={{ fontWeight: i >= 5 ? 700 : 400 }}>
            {l}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div
          key={wi}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 2,
          }}
        >
          {week.map((day, di) => {
            if (!day) return <div key={di} />;
            const dateStr = toDateOnly(day);
            const occs = occurrencesByDate.get(dateStr) ?? [];
            const isToday = dateStr === todayStr;
            const isWeekend = di >= 5;
            return (
              <div
                key={di}
                className={`month-day-cell${isToday ? ' today-cell' : ''}`}
                onClick={() => onDayClick(dateStr)}
                style={{
                  minHeight: 26,
                  fontSize: '0.68rem',
                  padding: 2,
                  cursor: 'pointer',
                  borderRadius: 6,
                  background: isToday
                    ? '#eff6ff'
                    : isWeekend
                    ? '#f8fafc'
                    : 'transparent',
                  border: isToday
                    ? `1px solid ${accentColor}`
                    : '1px solid transparent',
                }}
              >
                <div
                  style={{
                    color: isToday ? accentColor : 'var(--text-primary)',
                    fontWeight: isToday ? 700 : 400,
                  }}
                >
                  {day.getDate()}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    marginTop: 2,
                  }}
                >
                  {occs.slice(0, 3).map((o, oi) => (
                    <div
                      key={oi}
                      style={{
                        height: 3,
                        backgroundColor: o.color,
                        borderRadius: 2,
                      }}
                      title={o.name}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
