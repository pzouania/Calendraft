import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Occurrence } from '../types'

interface DayDetailProps {
  date: string
  occurrences: Occurrence[]
  canEdit?: boolean
  onClose: () => void
  onChanged: () => void
}

interface Block {
  occ: Occurrence
  startMin: number
  endMin: number
  subtitle: string
}

interface Placed extends Block {
  col: number
  cols: number
}

const ROW_HEIGHT = 44
const MIN_BLOCK = 28
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function getSpan(occ: Occurrence): Omit<Block, 'occ'> {
  const start = occ.startTime!.slice(0, 5)
  const end = occ.endTime!.slice(0, 5)
  const segment = occ.segment ?? 'full'
  const place = occ.location ? ` · ${occ.location}` : ''

  if (segment === 'start') {
    return { startMin: timeToMinutes(start), endMin: 24 * 60, subtitle: `${start} → ${end} (lendemain)${place}` }
  }
  if (segment === 'end') {
    return { startMin: 0, endMin: timeToMinutes(end), subtitle: `${start} (veille) → ${end}${place}` }
  }

  const startMin = timeToMinutes(start)
  let endMin = timeToMinutes(end)
  if (endMin <= startMin) endMin = 24 * 60
  return { startMin, endMin, subtitle: `${start} – ${end}${place}` }
}

function layoutBlocks(items: Block[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const placed: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1

  const flush = () => {
    const cols = cluster.reduce((max, p) => Math.max(max, p.col + 1), 1)
    cluster.forEach((p) => {
      p.cols = cols
    })
    placed.push(...cluster)
    cluster = []
    clusterEnd = -1
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush()

    const used = new Set(cluster.filter((p) => p.endMin > item.startMin).map((p) => p.col))
    let col = 0
    while (used.has(col)) col++

    cluster.push({ ...item, col, cols: 1 })
    clusterEnd = Math.max(clusterEnd, item.endMin)
  }
  if (cluster.length > 0) flush()

  return placed
}

function TrashButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Supprimer ce jour"
      aria-label="Supprimer ce jour"
      style={{
        width: 24, height: 24, borderRadius: 7, border: 'none',
        background: 'var(--hover-veil)', color: 'var(--text-body)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, flexShrink: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
      </svg>
    </button>
  )
}

export default function DayDetail({ date, occurrences, canEdit = true, onClose, onChanged }: DayDetailProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const timed = occurrences.filter((o) => o.startTime && o.endTime)
  const allDay = occurrences.filter((o) => !o.startTime || !o.endTime)
  const blocks = layoutBlocks(timed.map((occ) => ({ occ, ...getSpan(occ) })))

  useEffect(() => {
    const scroller = scrollRef.current
    const grid = gridRef.current
    if (!scroller || !grid || blocks.length === 0) return
    const firstStart = Math.min(...blocks.map((b) => b.startMin))
    const headerHeight = headerRef.current?.offsetHeight ?? 0
    const target = grid.offsetTop + (Math.max(firstStart - 60, 0) / 60) * ROW_HEIGHT - headerHeight
    scroller.scrollTop = Math.max(0, target)
  }, [])

  const handleDeleteLocal = async (occ: Occurrence) => {
    const confirmed = window.confirm(
      `Supprimer "${occ.name}" uniquement pour le ${occ.date} ? Les autres dates de cette période récurrente ne seront pas affectées.`
    )
    if (!confirmed) return

    const { error } = await supabase.from('period_exceptions').insert({
      period_id: occ.periodId,
      exception_date: occ.date,
    })

    if (error) {
      alert('Erreur : ' + error.message)
      return
    }
    onChanged()
  }

  const label = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const title = label.charAt(0).toUpperCase() + label.slice(1)

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'var(--overlay)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        ref={scrollRef}
        style={{
          backgroundColor: 'var(--surface)', borderRadius: 16, position: 'relative',
          width: 'min(520px, 92vw)', maxHeight: '85vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-modal)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={headerRef}
          style={{
            position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)',
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-alt)', color: 'var(--text-body)', fontSize: '1.2rem', lineHeight: 1, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
          {occurrences.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Aucun événement ce jour-là.</p>
          )}

          {allDay.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: timed.length > 0 ? '1.2rem' : 0 }}>
              {allDay.map((occ, i) => (
                <div
                  key={`${occ.periodId}-${i}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    backgroundColor: 'var(--surface)',
                    backgroundImage: `linear-gradient(${occ.color}1f, ${occ.color}1f)`,
                    borderLeft: `4px solid ${occ.color}`, borderRadius: 10,
                    padding: '0.55rem 0.6rem 0.55rem 0.8rem',
                  }}
                >
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{occ.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-body)' }}>
                    Journée entière{occ.location ? ` · ${occ.location}` : ''}
                  </span>
                  {canEdit && !occ.readOnly && <TrashButton onClick={() => handleDeleteLocal(occ)} />}
                </div>
              ))}
            </div>
          )}

          {blocks.length > 0 && (
            <div ref={gridRef} style={{ position: 'relative', borderTop: '1px solid var(--border-soft)' }}>
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{
                    height: ROW_HEIGHT, borderBottom: '1px solid var(--border-soft)',
                    display: 'flex', alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: 40, flexShrink: 0, paddingTop: 2 }}>
                    {String(h).padStart(2, '0')}:00
                  </span>
                </div>
              ))}

              <div style={{ position: 'absolute', top: 0, left: 44, right: 4, bottom: 0 }}>
                {blocks.map((b, i) => {
                  const top = (b.startMin / 60) * ROW_HEIGHT
                  const height = Math.max(((b.endMin - b.startMin) / 60) * ROW_HEIGHT - 2, MIN_BLOCK)
                  const deletable = canEdit && !b.occ.readOnly
                  return (
                    <div
                      key={`${b.occ.periodId}-${b.occ.segment}-${i}`}
                      style={{
                        position: 'absolute', top: top + 1, height,
                        left: `calc(${b.col} * 100% / ${b.cols})`,
                        width: `calc(100% / ${b.cols} - 4px)`,
                        backgroundColor: 'var(--surface)',
                        backgroundImage: `linear-gradient(${b.occ.color}26, ${b.occ.color}26)`,
                        borderLeft: `4px solid ${b.occ.color}`,
                        borderRadius: 8,
                        padding: deletable ? '4px 32px 4px 8px' : '4px 8px',
                        overflow: 'hidden',
                        boxShadow: 'var(--shadow-event)',
                      }}
                    >
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.occ.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-strong)' }}>{b.subtitle}</div>
                      {deletable && (
                        <div style={{ position: 'absolute', top: 4, right: 4 }}>
                          <TrashButton onClick={() => handleDeleteLocal(b.occ)} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
