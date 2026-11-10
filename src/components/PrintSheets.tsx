import { useI18n } from '../hooks/useI18n'
import type { Lang } from '../i18n'
import { getMonthMatrix, toDateOnly } from '../lib/dateUtils'
import {
  axisFor, blockOf, chipLayout, chipText, hasTimes, hhmm, layoutBlocks, sortDay, weekDays,
  type Block, type PlacedBlock,
} from '../lib/printLayout'
import { holidayLabel, holidayLegendLabel, type SchoolHoliday, type SchoolZone } from '../lib/schoolHolidays'
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
  // Vacances scolaires (zone du calendrier) : jours de vacances de la feuille, indexés par jour AAAA-MM-JJ.
  holidays?: Map<string, SchoolHoliday>
  holidayZone?: SchoolZone | null
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#cbd5e1'
const SOFT = '#f1f5f9'
// Jour de vacances scolaires (opaque, comme le reste de la feuille : le PDF ne dépend pas du thème de l'écran).
const HOLIDAY_BG = '#fef3c7'
const HOLIDAY_EDGE = '#f59e0b'

// Couleur de l'événement éclaircie vers le blanc (ratio = part de la couleur) : un fond opaque, pour que les lignes des
// heures passent derrière les événements et non à travers leur texte.
function tint(color: string, ratio: number): string {
  let hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  const short = /^#([0-9a-f]{3})$/i.exec(color)?.[1]
  if (!hex && short) hex = short.split('').map((c) => c + c).join('')
  if (!hex) return '#eef2f7'
  const n = parseInt(hex, 16)
  const mix = (c: number) => Math.round(255 - (255 - c) * ratio)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

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

// Ligne de légende des vacances : le nom de la vacance s'il n'y en a qu'une sur la feuille, sinon « Vacances scolaires (zone X) ».
function holidayLegend(keys: string[], holidays: Map<string, SchoolHoliday> | undefined, zone: SchoolZone | null | undefined, lang: Lang): string | null {
  if (!holidays || !zone) return null
  const kinds = new Set<string>()
  let one: SchoolHoliday | undefined
  for (const key of keys) {
    const h = holidays.get(key)
    if (h) {
      kinds.add(h.kind)
      one = h
    }
  }
  if (!one) return null
  return kinds.size === 1 ? holidayLabel(one.kind, zone, lang) : holidayLegendLabel(zone, lang)
}

// Légende : seulement les événements qui apparaissent sur la feuille (et les vacances scolaires, si la feuille en contient).
function Legend({ items, used, holiday }: { items: LegendItem[]; used: Set<string>; holiday?: string | null }) {
  const shown = items.filter((i) => used.has(i.id))
  if (shown.length === 0 && !holiday) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2mm 4mm', marginTop: '3mm', flexShrink: 0, fontSize: '8pt', color: INK }}>
      {shown.map((i) => (
        <span key={i.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
          <span style={{ width: '2.6mm', height: '2.6mm', borderRadius: '50%', background: i.color, display: 'inline-block' }} />
          {i.label}
        </span>
      ))}
      {holiday && (
        <span data-legend="holiday" style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
          <span style={{ width: '2.6mm', height: '2.6mm', borderRadius: '0.5mm', background: HOLIDAY_BG, border: `0.3mm solid ${HOLIDAY_EDGE}`, boxSizing: 'border-box', display: 'inline-block' }} />
          {holiday}
        </span>
      )}
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
        background: tint(occ.color, 0.14), color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        borderRadius: '0.5mm',
      }}
    >
      {chipText(occ)}
    </div>
  )
}

export function MonthSheet({ year, month, ...base }: SheetBase & { year: number; month: number }) {
  const { t, lang, monthName, weekdayName } = useI18n()
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
            const dayKey = toDateOnly(day)
            const holiday = base.holidayZone ? base.holidays?.get(dayKey) : undefined
            const occs = sortDay(base.byDate.get(dayKey) ?? [])
            const overflow = occs.length > max
            const shown = overflow ? occs.slice(0, max - 1) : occs
            return (
              <div
                key={`${wi}-${di}`}
                data-date={dayKey}
                data-holiday={holiday ? holiday.kind : undefined}
                style={{ ...cellBorder, padding: '0.8mm 1mm', overflow: 'hidden', minWidth: 0, background: holiday ? HOLIDAY_BG : di >= 5 ? '#f8fafc' : '#fff' }}
              >
                <div style={{ fontSize: '8pt', fontWeight: 700, color: di >= 5 ? MUTED : INK }}>{day.getDate()}</div>
                {shown.map((o, oi) => (
                  <Chip key={oi} occ={o} size={font} />
                ))}
                {overflow && (
                  <div style={{ fontSize: font, lineHeight: 1.25, marginTop: '0.4mm', color: MUTED, fontWeight: 700 }}>
                    {t('print.more', { count: occs.length - (max - 1) })}
                  </div>
                )}
              </div>
            )
          }),
        )}
      </div>
      <Legend items={base.legend} used={usedIds(base.byDate, keys)} holiday={holidayLegend(keys, base.holidays, base.holidayZone, lang)} />
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Semaine : emploi du temps, une colonne par jour et l'heure à gauche.
// ---------------------------------------------------------------------------------------------------------------------

const AXIS_MM = 12

function timeLabel(occ: Occurrence): string {
  const start = hhmm(occ.startTime)
  const end = hhmm(occ.endTime)
  if (occ.segment === 'start') return `${start} →`
  if (occ.segment === 'end') return `← ${end}`
  return `${start} – ${end}`
}

const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// Texte sur plusieurs lignes, coupé proprement (avec « … ») après le nombre de lignes qui tiennent dans le bloc.
const clamp = (lines: number, narrow: boolean): React.CSSProperties => ({
  display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden',
  overflowWrap: narrow ? 'anywhere' : 'break-word', hyphens: narrow ? 'auto' : 'manual',
})

function WeekBlock({ block, from, to, bodyMm, dayMm }: { block: PlacedBlock; from: number; to: number; bodyMm: number; dayMm: number }) {
  const { occ } = block
  const span = to - from
  const start = Math.max(block.startMin, from)
  const end = Math.min(block.endMin, to)
  const heightMm = ((end - start) / span) * bodyMm
  // Événements superposés : colonne étroite, texte plus petit. Bloc large et haut : texte plus grand.
  const narrow = block.cols >= 3 && block.span === 1
  const fontPt = narrow ? 6 : block.cols === 1 && heightMm >= 14 ? 8 : 7
  const lineMm = fontPt * 1.2 * 0.3528
  // Nombre de lignes de texte qui tiennent dans le bloc (marges comprises).
  const avail = Math.floor((heightMm - 1.4) / lineMm)
  // Heure : la forme la plus complète qui tient dans la largeur du bloc (« 06:00 – 14:00 », « 06:00–14:00 », sur deux lignes,
  // ou à défaut l'heure de début seule) ; jamais une heure coupée.
  const widthMm = (dayMm * block.span) / block.cols - 2.6
  const fits = (text: string) => text.length * fontPt * 0.194 <= widthMm
  const full = timeLabel(occ)
  const compact = full.replace(' – ', '–')
  const crosses = occ.segment === 'start' || occ.segment === 'end'
  const timeLines =
    fits(full) ? [full]
    : fits(compact) ? [compact]
    : !crosses && avail >= 4 ? [`${hhmm(occ.startTime)} –`, hhmm(occ.endTime)]
    : [hhmm(occ.startTime)]
  const place = occ.location
  // Heure et lieu sur des lignes séparées seulement s'il reste assez de place pour que le titre ne soit pas coupé trop tôt.
  const separate = !!place && avail - timeLines.length >= 4
  // Sur la même ligne que l'heure seulement dans un bloc large ; dans un bloc étroit, le lieu passe après (ou disparaît).
  const inline = !!place && !separate && !narrow && timeLines.length === 1

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
          height: '100%', boxSizing: 'border-box', overflow: 'hidden', background: tint(occ.color, 0.16),
          borderLeft: `1mm solid ${occ.color}`, borderRadius: '0.8mm', padding: '0.6mm 1.2mm', fontSize: `${fontPt}pt`, lineHeight: 1.2,
          borderTop: block.fromPrevious ? `0.4mm dashed ${occ.color}` : 'none',
          borderBottom: block.toNext ? `0.4mm dashed ${occ.color}` : 'none',
        }}
      >
        {avail <= 1 ? (
          <div style={ellipsis}>
            <strong>{hhmm(occ.startTime)}</strong> {occ.name}
          </div>
        ) : avail === 2 ? (
          <>
            <div style={{ ...ellipsis, fontWeight: 700 }}>{occ.name}</div>
            <div style={{ ...ellipsis, color: '#334155' }}>{place && !narrow && fits(`${full} · ${place}`) ? `${full} · ${place}` : timeLines[0]}</div>
          </>
        ) : (
          <>
            <div style={{ ...clamp(Math.max(1, avail - timeLines.length - (separate ? 1 : 0)), narrow), fontWeight: 700 }}>{occ.name}</div>
            {timeLines.map((line, i) => (
              <div key={i} style={{ ...ellipsis, color: '#334155' }}>
                {inline ? `${line} · ${place}` : line}
              </div>
            ))}
            {separate && <div style={{ ...ellipsis, color: '#475569' }}>{place}</div>}
          </>
        )}
      </div>
    </div>
  )
}

export function WeekSheet({ monday, ...base }: SheetBase & { monday: Date }) {
  const { t, lang, formatDate } = useI18n()
  const days = weekDays(monday, base.byDate)
  const n = days.length

  const perDay = days.map((d) => sortDay(base.byDate.get(d.key) ?? []))
  const allDay = perDay.map((list) => list.filter((o) => !hasTimes(o)))
  const hasAllDay = allDay.some((list) => list.length > 0)
  const placed: PlacedBlock[][] = perDay.map((list) => layoutBlocks(list.filter(hasTimes).map(blockOf)))
  const axis = axisFor(placed.flat() as Block[])
  const hours: number[] = []
  for (let h = axis.from / 60; h <= axis.to / 60; h++) hours.push(h)
  const span = axis.to - axis.from
  const cols = `${AXIS_MM}mm repeat(${n}, minmax(0, 1fr))`

  // Titre : du premier au dernier jour affiché (pas de week-end dans la grille → le titre s'arrête au vendredi).
  const first = days[0].date
  const last = days[n - 1].date
  const title =
    `${formatDate(first, { day: 'numeric', month: 'long', ...(first.getFullYear() !== last.getFullYear() ? { year: 'numeric' as const } : {}) })} – ` +
    formatDate(last, { day: 'numeric', month: 'long', year: 'numeric' })
  // Zone des heures : hauteur approximative (la feuille a une hauteur fixe), pour savoir combien de lignes tiennent dans un bloc.
  const bodyMm = hasAllDay ? 150 : 158

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
            data-holiday={base.holidayZone && base.holidays?.get(d.key) ? base.holidays.get(d.key)!.kind : undefined}
            style={{
              padding: '1.5mm 0', textAlign: 'center', fontSize: '8.5pt', fontWeight: 700, color: INK,
              borderLeft: `0.3mm solid ${LINE}`,
              background: base.holidayZone && base.holidays?.has(d.key) ? HOLIDAY_BG : undefined,
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
          <div style={{ fontSize: '6pt', color: MUTED, padding: '1mm 0.8mm', lineHeight: 1.2 }}>{t('print.allDay')}</div>
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
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${AXIS_MM}mm`, right: 0 }}>
          {hours.flatMap((h) => {
            const lines = []
            if (h > axis.from / 60 && h < axis.to / 60) {
              lines.push(
                <div key={`h${h}`} style={{ position: 'absolute', left: 0, right: 0, top: `${((h * 60 - axis.from) / span) * 100}%`, borderTop: `0.2mm solid ${LINE}` }} />,
              )
            }
            if (h * 60 + 30 < axis.to) {
              lines.push(
                <div key={`m${h}`} style={{ position: 'absolute', left: 0, right: 0, top: `${((h * 60 + 30 - axis.from) / span) * 100}%`, borderTop: '0.15mm dashed #e2e8f0' }} />,
              )
            }
            return lines
          })}
        </div>
        {hours.map((h) => (
          <div
            key={`l${h}`}
            style={{
              position: 'absolute', left: 0, width: `${AXIS_MM - 1.2}mm`, top: `${((h * 60 - axis.from) / span) * 100}%`, textAlign: 'right',
              fontSize: '6.5pt', color: MUTED,
              transform: h === axis.from / 60 ? 'translateY(0.6mm)' : h === axis.to / 60 ? 'translateY(-100%)' : 'translateY(-50%)',
            }}
          >
            {`${String(h % 24).padStart(2, '0')}:00`}
          </div>
        ))}
        {days.map((d, i) => (
          <div
            key={d.key}
            data-col={d.key}
            style={{
              position: 'absolute', top: 0, bottom: 0, borderLeft: `0.3mm solid ${LINE}`,
              left: `calc(${AXIS_MM}mm + (100% - ${AXIS_MM}mm) * ${i} / ${n})`, width: `calc((100% - ${AXIS_MM}mm) / ${n})`,
              background:
                base.holidayZone && base.holidays?.has(d.key)
                  ? 'rgba(254, 243, 199, 0.7)'
                  : d.date.getDay() === 0 || d.date.getDay() === 6 ? 'rgba(241, 245, 249, 0.6)' : 'transparent',
            }}
          >
            {placed[i].map((b, bi) => (
              <WeekBlock key={bi} block={b} from={axis.from} to={axis.to} bodyMm={bodyMm} dayMm={(281 - AXIS_MM) / n} />
            ))}
          </div>
        ))}
      </div>

      <Legend
        items={base.legend} used={usedIds(base.byDate, days.map((d) => d.key))}
        holiday={holidayLegend(days.map((d) => d.key), base.holidays, base.holidayZone, lang)}
      />
    </section>
  )
}
