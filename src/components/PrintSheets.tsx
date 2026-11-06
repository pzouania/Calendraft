import { useI18n } from '../hooks/useI18n'
import { getMonthMatrix, toDateOnly } from '../lib/dateUtils'
import {
  axisFor, blockOf, chipLayout, chipText, hasTimes, hhmm, layoutBlocks, sortDay, weekDays,
  type Block, type PlacedBlock,
} from '../lib/printLayout'
import type { Occurrence } from '../types'
import Icon from './icons'

// Feuilles imprimées pour l'export PDF d'un mois ou d'une semaine (A4 paysage). Les couleurs sont fixes (fond blanc, texte
// foncé) pour que le PDF soit identique quel que soit le thème de l'écran, y compris en mode sombre.

export const PRINT_ROOT_ID = 'calendraft-print-root'

// Appliquée seulement pendant l'export : la page de l'application est masquée à l'impression et seule la feuille reste.
export const PRINT_STYLE = `
@page { size: A4 landscape; margin: 8mm; }
@media screen { #${PRINT_ROOT_ID} { display: none !important; } }
@media print {
  html, html body { background: #fff !important; background-image: none !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
  html body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  html body > #${PRINT_ROOT_ID} { display: block !important; background: #fff; }
  #${PRINT_ROOT_ID}, #${PRINT_ROOT_ID} * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

export interface LegendItem {
  // Identifiant de l'événement du calendrier (ou « feed » pour l'emploi du temps en ligne).
  id: string
  label: string
  color: string
}

interface SheetBase {
  calendarName: string
  calendarIcon: string
  calendarColor: string
  legend: LegendItem[]
  byDate: Map<string, Occurrence[]>
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#cbd5e1'
const SOFT = '#f1f5f9'

function Header({ calendarName, calendarIcon, calendarColor, title }: Pick<SheetBase, 'calendarName' | 'calendarIcon' | 'calendarColor'> & { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6mm', marginBottom: '3mm', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '3mm', minWidth: 0 }}>
        <div
          style={{
            width: '9mm', height: '9mm', borderRadius: '2.4mm', background: calendarColor, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name={calendarIcon} size={18} color="white" />
        </div>
        <h1 style={{ margin: 0, fontSize: '15pt', fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {calendarName}
        </h1>
      </div>
      <div style={{ fontSize: '15pt', fontWeight: 700, color: calendarColor, textAlign: 'right' }}>{title}</div>
    </div>
  )
}

// Légende : seulement les événements qui apparaissent sur la feuille.
function Legend({ items, used }: { items: LegendItem[]; used: Set<string> }) {
  const shown = items.filter((i) => used.has(i.id))
  if (shown.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2mm 4mm', marginTop: '3mm', flexShrink: 0, fontSize: '8pt', color: INK }}>
      {shown.map((i) => (
        <span key={i.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
          <span style={{ width: '2.6mm', height: '2.6mm', borderRadius: '50%', background: i.color, display: 'inline-block' }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function usedIds(byDate: Map<string, Occurrence[]>, keys: string[]): Set<string> {
  const used = new Set<string>()
  for (const key of keys) for (const o of byDate.get(key) ?? []) used.add(o.periodId)
  return used
}

const sheetStyle: React.CSSProperties = {
  width: '100%', height: '192mm', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
  background: '#fff', color: INK, overflow: 'hidden', breakInside: 'avoid', pageBreakInside: 'avoid',
}

// ---------------------------------------------------------------------------------------------------------------------
// Mois : grille du lundi au dimanche, une ligne par événement dans chaque jour.
// ---------------------------------------------------------------------------------------------------------------------

function Chip({ occ, size }: { occ: Occurrence; size: string }) {
  return (
    <div
      style={{
        fontSize: size, lineHeight: 1.25, padding: '0 1mm', marginTop: '0.4mm', borderLeft: `0.8mm solid ${occ.color}`,
        background: `${occ.color}22`, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        borderRadius: '0.5mm',
      }}
    >
      {chipText(occ)}
    </div>
  )
}

export function MonthSheet({ year, month, ...base }: SheetBase & { year: number; month: number }) {
  const { monthName, weekdayName } = useI18n()
  const weeks = getMonthMatrix(year, month)
  const { max, font } = chipLayout(weeks.length)
  const keys = weeks.flat().filter((d): d is Date => !!d).map(toDateOnly)

  return (
    <section className="pdf-sheet pdf-month" style={sheetStyle}>
      <Header
        calendarName={base.calendarName} calendarIcon={base.calendarIcon} calendarColor={base.calendarColor}
        title={`${capitalize(monthName(month))} ${year}`}
      />
      <div
        style={{
          flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gridTemplateRows: `auto repeat(${weeks.length}, minmax(0, 1fr))`, border: `0.3mm solid ${LINE}`,
        }}
      >
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={`h${i}`}
            style={{
              padding: '1.2mm 0', textAlign: 'center', fontSize: '8pt', fontWeight: 700, background: SOFT,
              color: i >= 5 ? MUTED : INK, borderLeft: i === 0 ? 'none' : `0.3mm solid ${LINE}`,
              borderBottom: `0.3mm solid ${LINE}`,
            }}
          >
            {capitalize(weekdayName(i, 'long'))}
          </div>
        ))}
        {weeks.flatMap((week, wi) =>
          week.map((day, di) => {
            const cellBorder: React.CSSProperties = {
              borderLeft: di === 0 ? 'none' : `0.3mm solid ${LINE}`,
              borderTop: wi === 0 ? 'none' : `0.3mm solid ${LINE}`,
            }
            if (!day) {
              return <div key={`${wi}-${di}`} data-empty="1" style={{ ...cellBorder, background: SOFT }} />
            }
            const occs = sortDay(base.byDate.get(toDateOnly(day)) ?? [])
            const overflow = occs.length > max
            const shown = overflow ? occs.slice(0, max - 1) : occs
            return (
              <div
                key={`${wi}-${di}`}
                data-date={toDateOnly(day)}
                style={{ ...cellBorder, padding: '0.8mm 1mm', overflow: 'hidden', minWidth: 0, background: di >= 5 ? '#f8fafc' : '#fff' }}
              >
                <div style={{ fontSize: '8pt', fontWeight: 700, color: di >= 5 ? MUTED : INK }}>{day.getDate()}</div>
                {shown.map((o, oi) => (
                  <Chip key={oi} occ={o} size={font} />
                ))}
                {overflow && (
                  <div style={{ fontSize: font, lineHeight: 1.25, marginTop: '0.4mm', color: MUTED, fontWeight: 700 }}>
                    + {occs.length - (max - 1)} autres
                  </div>
                )}
              </div>
            )
          }),
        )}
      </div>
      <Legend items={base.legend} used={usedIds(base.byDate, keys)} />
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Semaine : emploi du temps, une colonne par jour et l'heure à gauche.
// ---------------------------------------------------------------------------------------------------------------------

const AXIS_MM = 12
// Hauteur approximative de la zone des heures (sert seulement à choisir combien de lignes de texte tiennent dans un bloc).
const BODY_MM = 145

function timeLabel(occ: Occurrence): string {
  const start = hhmm(occ.startTime)
  const end = hhmm(occ.endTime)
  if (occ.segment === 'start') return `${start} →`
  if (occ.segment === 'end') return `← ${end}`
  return `${start} – ${end}`
}

function WeekBlock({ block, from, to }: { block: PlacedBlock; from: number; to: number }) {
  const { occ } = block
  const span = to - from
  const start = Math.max(block.startMin, from)
  const end = Math.min(block.endMin, to)
  const approxMm = ((end - start) / span) * BODY_MM
  const lines = approxMm >= 10.5 ? 3 : approxMm >= 6.5 ? 2 : 1
  const time = timeLabel(occ)
  const text: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  // Colonnes étroites (événements superposés) : texte un peu plus petit, qui passe à la ligne au lieu d'être coupé.
  const narrow = block.cols >= 3 && block.span === 1
  const wrap: React.CSSProperties = { overflowWrap: 'anywhere', hyphens: 'auto' }

  return (
    <div
      data-event={occ.name}
      style={{
        position: 'absolute', top: `${((start - from) / span) * 100}%`, height: `${((end - start) / span) * 100}%`,
        left: `${(block.col / block.cols) * 100}%`, width: `${(block.span / block.cols) * 100}%`, padding: '0.2mm 0.4mm', boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          height: '100%', boxSizing: 'border-box', overflow: 'hidden', background: `${occ.color}26`,
          borderLeft: `1mm solid ${occ.color}`, borderRadius: '0.8mm', padding: '0.6mm 1.2mm', fontSize: narrow ? '6pt' : '7pt', lineHeight: 1.2,
          borderTop: block.fromPrevious ? `0.4mm dashed ${occ.color}` : 'none',
          borderBottom: block.toNext ? `0.4mm dashed ${occ.color}` : 'none',
        }}
      >
        {lines === 1 ? (
          <div style={text}>
            <strong>{hhmm(occ.startTime)}</strong> {occ.name}
          </div>
        ) : (
          <>
            <div style={lines === 3 ? { ...wrap, fontWeight: 700 } : { ...text, fontWeight: 700 }}>{occ.name}</div>
            <div style={lines === 3 ? { ...wrap, color: '#334155' } : { ...text, color: '#334155' }}>
              {time}
              {lines === 2 && occ.location ? ` · ${occ.location}` : ''}
            </div>
            {lines === 3 && occ.location && <div style={{ ...wrap, color: '#334155' }}>{occ.location}</div>}
          </>
        )}
      </div>
    </div>
  )
}

export function WeekSheet({ monday, ...base }: SheetBase & { monday: Date }) {
  const { formatDate } = useI18n()
  const days = weekDays(monday, base.byDate)
  const n = days.length
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)

  const perDay = days.map((d) => sortDay(base.byDate.get(d.key) ?? []))
  const allDay = perDay.map((list) => list.filter((o) => !hasTimes(o)))
  const hasAllDay = allDay.some((list) => list.length > 0)
  const placed: PlacedBlock[][] = perDay.map((list) => layoutBlocks(list.filter(hasTimes).map(blockOf)))
  const axis = axisFor(placed.flat() as Block[])
  const hours: number[] = []
  for (let h = axis.from / 60; h <= axis.to / 60; h++) hours.push(h)
  const span = axis.to - axis.from
  const cols = `${AXIS_MM}mm repeat(${n}, minmax(0, 1fr))`

  const title =
    `${formatDate(monday, { day: 'numeric', month: 'long' })} – ` +
    formatDate(sunday, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <section className="pdf-sheet pdf-week" style={sheetStyle}>
      <Header
        calendarName={base.calendarName} calendarIcon={base.calendarIcon} calendarColor={base.calendarColor}
        title={title}
      />

      <div style={{ display: 'grid', gridTemplateColumns: cols, border: `0.3mm solid ${LINE}`, borderBottom: 'none', background: SOFT, flexShrink: 0 }}>
        <div />
        {days.map((d) => (
          <div
            key={d.key}
            data-day={d.key}
            style={{
              padding: '1.5mm 0', textAlign: 'center', fontSize: '8.5pt', fontWeight: 700, color: INK,
              borderLeft: `0.3mm solid ${LINE}`,
            }}
          >
            {capitalize(formatDate(d.date, { weekday: 'long' }))}
            <span style={{ fontWeight: 400, color: MUTED }}>
              {' '}
              {formatDate(d.date, { day: 'numeric', month: 'short' })}
            </span>
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div style={{ display: 'grid', gridTemplateColumns: cols, border: `0.3mm solid ${LINE}`, borderBottom: 'none', flexShrink: 0 }}>
          <div style={{ fontSize: '6pt', color: MUTED, padding: '1mm 0.8mm', lineHeight: 1.2 }}>Toute la journée</div>
          {allDay.map((list, i) => (
            <div key={days[i].key} data-allday={days[i].key} style={{ borderLeft: `0.3mm solid ${LINE}`, padding: '0.6mm 0.8mm 1mm', minWidth: 0 }}>
              {list.map((o, oi) => (
                <Chip key={oi} occ={o} size="7pt" />
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative', flex: 1, minHeight: 0, border: `0.3mm solid ${LINE}` }}>
        {hours.map((h) => {
          const top = ((h * 60 - axis.from) / span) * 100
          return (
            <div key={h}>
              {h > axis.from / 60 && h < axis.to / 60 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: `${top}%`, borderTop: `0.2mm solid ${LINE}` }} />
              )}
              <div
                style={{
                  position: 'absolute', left: 0, width: `${AXIS_MM - 1.2}mm`, top: `${top}%`, textAlign: 'right', fontSize: '6.5pt',
                  color: MUTED, transform: h === axis.from / 60 ? 'translateY(0.6mm)' : h === axis.to / 60 ? 'translateY(-100%)' : 'translateY(-50%)',
                }}
              >
                {`${String(h % 24).padStart(2, '0')}:00`}
              </div>
            </div>
          )
        })}
        {days.map((d, i) => (
          <div
            key={d.key}
            data-col={d.key}
            style={{
              position: 'absolute', top: 0, bottom: 0, borderLeft: `0.3mm solid ${LINE}`,
              left: `calc(${AXIS_MM}mm + (100% - ${AXIS_MM}mm) * ${i} / ${n})`, width: `calc((100% - ${AXIS_MM}mm) / ${n})`,
              background: d.date.getDay() === 0 || d.date.getDay() === 6 ? 'rgba(241, 245, 249, 0.6)' : 'transparent',
            }}
          >
            {placed[i].map((b, bi) => (
              <WeekBlock key={bi} block={b} from={axis.from} to={axis.to} />
            ))}
          </div>
        ))}
      </div>

      <Legend items={base.legend} used={usedIds(base.byDate, days.map((d) => d.key))} />
    </section>
  )
}
