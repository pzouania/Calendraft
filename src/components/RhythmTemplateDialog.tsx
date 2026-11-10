import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { toDateOnly } from '../lib/dateUtils'
import { createFromDrafts } from '../lib/rhythmCreate'
import {
  GROUP_ORDER,
  GROUP_TITLE_KEYS,
  TEMPLATES,
  anchorDate,
  buildDrafts,
  cycleWeeks,
  defaultSettings,
  isTimed,
  lenientSettings,
  previewOccurrences,
  validateSettings,
  type TemplateDef,
  type TemplateSettings,
} from '../lib/rhythmTemplates'

interface RhythmTemplateDialogProps {
  calendarId: string
  // Les événements ont été ajoutés (le message éventuel signale un souci sans gravité).
  onCreated: (count: number, notice: string | null) => void
  onClose: () => void
}

function shift(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function parse(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.7rem', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', minWidth: 0,
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)',
}

const hintStyle: React.CSSProperties = {
  margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45,
}

// Les semaines du cycle telles que le calendrier les affichera, une ligne par semaine.
function CyclePreview({ def, settings }: { def: TemplateDef; settings: TemplateSettings }) {
  const { t, formatDate, weekdayName } = useI18n()
  const shortDate = (date: Date) => formatDate(date, { day: 'numeric', month: 'short' })
  const preview = useMemo(() => {
    const lenient = lenientSettings(def, settings, t)
    const anchor = anchorDate(def, lenient.startDate)
    if (!anchor) return null
    const drafts = buildDrafts(def, lenient)
    const first = parse(anchor)
    const monday = shift(first, -((first.getDay() + 6) % 7))
    // Un cycle qui ne commence pas un lundi déborde sur une semaine de plus.
    const rows = cycleWeeks(def) + (anchor === toDateOnly(monday) ? 0 : 1)
    const byDate = new Map<string, { color: string; name: string }[]>()
    for (const occ of previewOccurrences(drafts, toDateOnly(monday), rows)) {
      const list = byDate.get(occ.date) ?? []
      if (!list.some((x) => x.name === occ.name && x.color === occ.color)) list.push({ color: occ.color, name: occ.name })
      byDate.set(occ.date, list)
    }
    return { anchor, monday, rows, byDate, drafts }
  }, [def, settings, t])

  if (!preview) return null
  const { anchor, monday, rows, byDate, drafts } = preview
  const legend = Array.from(
    new Map(drafts.map((d) => [d.name + d.color, { name: d.name, color: d.color, start: d.start_time, end: d.end_time }])).values(),
  )

  const weekText = Array.from({ length: rows }, (_, w) => {
    const names = new Set<string>()
    for (let i = 0; i < 7; i++) (byDate.get(toDateOnly(shift(monday, w * 7 + i))) ?? []).forEach((x) => names.add(x.name))
    return t('rhythm.preview.week', {
      date: shortDate(shift(monday, w * 7)),
      names: names.size > 0 ? Array.from(names).join(', ') : t('rhythm.preview.nothing'),
    })
  }).join('. ')

  return (
    <div>
      <div style={labelStyle}>{t('rhythm.preview')}</div>
      <div
        role="img"
        aria-label={weekText}
        data-testid="rhythm-preview"
        style={{ display: 'grid', gridTemplateColumns: '2.6rem repeat(7, minmax(0, 1fr))', gap: 3, alignItems: 'stretch' }}
      >
        <span aria-hidden="true" />
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} aria-hidden="true" style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {weekdayName(i, 'narrow')}
          </span>
        ))}
        {Array.from({ length: rows }, (_, w) => (
          <PreviewRow key={w} monday={shift(monday, w * 7)} byDate={byDate} anchor={anchor} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', marginTop: '0.6rem' }}>
        {legend.map((l) => (
          <span key={l.name + l.color} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-body)' }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 4, background: l.color, flexShrink: 0 }} />
            {l.name}
            {l.start && l.end ? ` (${l.start.slice(0, 5)}–${l.end.slice(0, 5)})` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function PreviewRow({ monday, byDate, anchor }: { monday: Date; byDate: Map<string, { color: string; name: string }[]>; anchor: string }) {
  const { formatDate } = useI18n()
  const shortDate = (date: Date) => formatDate(date, { day: 'numeric', month: 'short' })
  return (
    <>
      <span aria-hidden="true" style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', alignSelf: 'center', lineHeight: 1.1 }}>
        {shortDate(monday)}
      </span>
      {Array.from({ length: 7 }, (_, i) => {
        const date = shift(monday, i)
        const key = toDateOnly(date)
        const items = byDate.get(key) ?? []
        const isStart = key === anchor
        return (
          <span
            key={i}
            data-date={key}
            data-names={items.map((x) => x.name).join('|')}
            style={{
              display: 'flex', flexDirection: 'column', gap: 2, padding: '3px 3px 4px', minHeight: 36, borderRadius: 6,
              background: 'var(--surface-faint)', boxShadow: isStart ? 'inset 0 0 0 2px var(--accent-link)' : 'none',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: 1 }}>{date.getDate()}</span>
            {items.map((x) => (
              <span key={x.name + x.color} aria-hidden="true" style={{ height: 7, borderRadius: 3, background: x.color }} />
            ))}
          </span>
        )
      })}
    </>
  )
}

// Fenêtre « Modèles de rythmes » : on choisit un modèle (garde alternée, 3x8...), on règle la date de début, les noms
// et les horaires, on voit le cycle, puis on ajoute tous les événements du modèle d'un seul coup.
export default function RhythmTemplateDialog({ calendarId, onCreated, onClose }: RhythmTemplateDialogProps) {
  const { t, formatDate } = useI18n()
  const longDate = (value: string) => formatDate(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dialogRef = useRef<HTMLDivElement>(null)
  const [def, setDef] = useState<TemplateDef | null>(null)
  const [settings, setSettings] = useState<TemplateSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Le focus passe dans la fenêtre à l'ouverture et revient où il était à la fermeture.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // Garde le clavier (Tab) dans la fenêtre.
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const items = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'),
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const choose = (template: TemplateDef) => {
    setDef(template)
    setSettings(defaultSettings(template, toDateOnly(new Date()), t))
    setError(null)
    dialogRef.current?.scrollTo?.(0, 0)
    dialogRef.current?.focus()
  }

  const back = () => {
    setDef(null)
    setSettings(null)
    setError(null)
    dialogRef.current?.scrollTo?.(0, 0)
    dialogRef.current?.focus()
  }

  const update = (patch: Partial<TemplateSettings>) => {
    setError(null)
    setSettings((s) => (s ? { ...s, ...patch } : s))
  }

  const updateSeries = (index: number, patch: Partial<TemplateSettings['series'][number]>) => {
    setError(null)
    setSettings((s) => (s ? { ...s, series: s.series.map((x, i) => (i === index ? { ...x, ...patch } : x)) } : s))
  }

  // Nombre d'événements que le modèle ajoutera avec les réglages actuels.
  const count = def && settings ? def.slots.filter((slot) => settings.series[slot.series].enabled).length : 0

  const submit = async () => {
    if (!def || !settings || busy) return
    const problem = validateSettings(def, settings)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    const result = await createFromDrafts(calendarId, buildDrafts(def, settings))
    setBusy(false)
    if (result.ok) onCreated(result.count, result.notice)
    else setError(result.message)
  }

  const anchor = def && settings ? anchorDate(def, settings.startDate) : null
  const cycle = def ? cycleWeeks(def) : 1
  const names = settings ? settings.series.map((s) => s.name.trim() || '…') : []

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--overlay)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem',
      }}
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rhythm-title"
        onKeyDown={trapTab}
        style={{
          backgroundColor: 'var(--surface)', borderRadius: 16, width: 'min(620px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-modal)', outline: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: '1rem', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
          }}
        >
          <h3 id="rhythm-title" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
            {def ? def.text(t).title : t('rhythm.title')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none', background: 'var(--surface-alt)',
              color: 'var(--text-body)', fontSize: '1.2rem', lineHeight: 1, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {!def || !settings ? (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-body)', lineHeight: 1.5 }}>
              {t('rhythm.intro')}
            </p>
            {GROUP_ORDER.map((group) => (
              <div key={group}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t(GROUP_TITLE_KEYS[group])}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {TEMPLATES.filter((tpl) => tpl.group === group).map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      data-template={tpl.id}
                      onClick={() => choose(tpl)}
                      style={{
                        textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, padding: '0.65rem 0.8rem',
                        borderRadius: 10, border: '1px solid var(--border-soft)', background: 'var(--surface-faint)', cursor: 'pointer',
                      }}
                    >
                      <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{tpl.text(t).title}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{tpl.text(t).summary}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-body)', lineHeight: 1.5 }}>
              {def.text(t).summary}
              {def.text(t).help ? ` ${def.text(t).help}` : ''}
            </p>

            <div>
              <label htmlFor="rhythm-start" style={labelStyle}>
                {def.anchor === 'monday' ? t('rhythm.start.monday') : t('rhythm.start.any')}
              </label>
              <input
                id="rhythm-start"
                type="date"
                value={settings.startDate}
                onChange={(e) => update({ startDate: e.target.value })}
                style={fieldStyle}
              />
              {anchor && (
                <p style={hintStyle}>
                  {def.anchor === 'monday' && anchor !== settings.startDate
                    ? t('rhythm.anchorShifted', { date: longDate(anchor) })
                    : t('rhythm.anchor', { date: longDate(anchor) })}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="rhythm-phase" style={labelStyle}>
                {t('rhythm.phase')}
              </label>
              <select
                id="rhythm-phase"
                value={settings.phase}
                onChange={(e) => update({ phase: Number(e.target.value) })}
                style={fieldStyle}
              >
                {Array.from({ length: cycle }, (_, p) => (
                  <option key={p} value={p}>
                    {def.weekLabel(p, names, t)}
                  </option>
                ))}
              </select>
              <p style={hintStyle}>{t('rhythm.phaseHint')}</p>
            </div>

            <CyclePreview def={def} settings={settings} />

            <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
              <legend style={{ padding: 0, marginBottom: 6, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('rhythm.added')}
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {def.series.map((_, i) => {
                  const x = settings.series[i]
                  const timed = isTimed(def, i)
                  return (
                    <div
                      key={i}
                      data-series={i}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.7rem 0.8rem', borderRadius: 10,
                        background: 'var(--surface-faint)', borderLeft: `4px solid ${x.color}`, opacity: x.enabled ? 1 : 0.55,
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                        {def.canDisable && def.series.length > 1 && (
                          <input
                            type="checkbox"
                            checked={x.enabled}
                            aria-label={t('rhythm.addAria', { name: x.name.trim() || t(def.series[i].nameKey) })}
                            onChange={(e) => updateSeries(i, { enabled: e.target.checked })}
                            style={{ width: 18, height: 18, flexShrink: 0 }}
                          />
                        )}
                        <input
                          type="text"
                          value={x.name}
                          maxLength={60}
                          aria-label={t('rhythm.nameAria', { number: i + 1 })}
                          disabled={!x.enabled}
                          onChange={(e) => updateSeries(i, { name: e.target.value })}
                          style={fieldStyle}
                        />
                        <input
                          type="color"
                          value={x.color}
                          aria-label={t('rhythm.colorAria', { name: x.name.trim() || t(def.series[i].nameKey) })}
                          disabled={!x.enabled}
                          onChange={(e) => updateSeries(i, { color: e.target.value })}
                          style={{
                            width: 40, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 8,
                            background: 'var(--input-bg)', cursor: 'pointer', flexShrink: 0,
                          }}
                        />
                      </div>
                      {timed && (
                        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                          <label style={{ flex: '1 1 120px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {t('period.start')}
                            <input
                              type="time"
                              value={x.start}
                              disabled={!x.enabled}
                              onChange={(e) => updateSeries(i, { start: e.target.value })}
                              style={{ ...fieldStyle, marginTop: 4 }}
                            />
                          </label>
                          <label style={{ flex: '1 1 120px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {t('period.end')}
                            <input
                              type="time"
                              value={x.end}
                              disabled={!x.enabled}
                              onChange={(e) => updateSeries(i, { end: e.target.value })}
                              style={{ ...fieldStyle, marginTop: 4 }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </fieldset>

            {count > 0 && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {t('rhythm.summaryCount', { count })}
                {def.series.some((_, i) => isTimed(def, i)) ? ` ${t('rhythm.limitNote')}` : ''}
              </p>
            )}

            {error && (
              <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem', lineHeight: 1.45, wordBreak: 'break-word' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={back}
                disabled={busy}
                style={{
                  background: 'var(--surface-alt)', color: 'var(--text-body)', border: 'none', borderRadius: 10,
                  padding: '0.6rem 1.1rem', fontSize: '0.88rem', fontWeight: 700,
                }}
              >
                {t('rhythm.allModels')}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                style={{
                  background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none', borderRadius: 10,
                  padding: '0.6rem 1.2rem', fontSize: '0.88rem', fontWeight: 700, opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? t('rhythm.adding') : count === 0 ? t('rhythm.add') : t('rhythm.addCount', { count })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
