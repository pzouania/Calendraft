import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import SchoolZonePicker from './SchoolZonePicker'
import { fetchSchoolZone, isMissingZoneColumn, zoneUnavailableText } from '../lib/schoolZone'
import type { SchoolZone } from '../lib/schoolHolidays'
import Icon, { ICON_KEYS } from './icons'
import { useI18n } from '../hooks/useI18n'
import { noticeText, type Notice } from '../lib/authErrors'
import type { TranslationKey } from '../i18n'
import type { Calendar, YearMode } from '../types'

const COLOR_OPTIONS = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#475569']

const YEAR_MODES: { value: YearMode; title: TranslationKey; desc: TranslationKey }[] = [
  { value: 'calendar', title: 'yearMode.calendar.title', desc: 'yearMode.calendar.desc' },
  { value: 'school', title: 'yearMode.school.title', desc: 'yearMode.school.desc' },
]

interface CalendarFormModalProps {
  mode: 'create' | 'edit'
  calendar?: Calendar
  onClose: () => void
  onSaved: (id: string) => void
}

export default function CalendarFormModal({ mode, calendar, onClose, onSaved }: CalendarFormModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState(calendar?.name ?? '')
  const [icon, setIcon] = useState(calendar?.icon ?? 'calendar')
  const [color, setColor] = useState(calendar?.color ?? COLOR_OPTIONS[0])
  const [yearMode, setYearMode] = useState<YearMode>(calendar?.year_mode ?? 'calendar')
  // Zone de vacances scolaires. En modification, elle est lue à part (le calendrier reçu ne la contient pas forcément) :
  // elle n'est envoyée à la base que si elle a changé, pour ne rien écraser par erreur.
  const [zone, setZone] = useState<SchoolZone | null>(null)
  const [initialZone, setInitialZone] = useState<SchoolZone | null>(null)
  const [zoneState, setZoneState] = useState<'ready' | 'loading' | 'unavailable'>(mode === 'edit' && calendar ? 'loading' : 'ready')
  const [error, setError] = useState<Notice | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'edit' || !calendar) return
    let alive = true
    fetchSchoolZone(calendar.id).then((result) => {
      if (!alive) return
      if (result.ok) {
        setZone(result.zone)
        setInitialZone(result.zone)
        setZoneState('ready')
      } else {
        setZoneState('unavailable')
      }
    })
    return () => {
      alive = false
    }
  }, [mode, calendar?.id])

  const zoneChanged = zoneState === 'ready' && zone !== initialZone

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (zoneState === 'loading') return
    setError(null)
    setSaving(true)

    if (mode === 'create') {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        setSaving(false)
        return
      }
      const { data, error } = await supabase
        .from('calendars')
        .insert({ name: name.trim(), icon, color, year_mode: yearMode, user_id: userData.user.id, ...(zone ? { school_zone: zone } : {}) })
        .select()
        .single()

      setSaving(false)
      if (error) {
        setError({ raw: isMissingZoneColumn(error) ? zoneUnavailableText() : error.message })
        return
      }
      if (data) onSaved(data.id)
    } else if (calendar) {
      const { error } = await supabase
        .from('calendars')
        .update({
          name: name.trim(),
          icon,
          color,
          year_mode: yearMode,
          ...(zoneChanged ? { school_zone: zone } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', calendar.id)

      setSaving(false)
      if (error) {
        setError({ raw: isMissingZoneColumn(error) ? zoneUnavailableText() : error.message })
        return
      }
      onSaved(calendar.id)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'block',
    marginBottom: 6,
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'var(--overlay)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem',
      }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 16,
          width: 'min(420px, 92vw)', maxHeight: '92vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-modal)',
          display: 'flex', flexDirection: 'column', gap: '1rem',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
          {mode === 'create' ? t('calendarForm.createTitle') : t('calendarForm.editTitle')}
        </h3>

        <div
          style={{
            width: 56, height: 56, borderRadius: 14, background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
          }}
        >
          <Icon name={icon} size={28} color="white" />
        </div>

        <div>
          <label style={labelStyle}>{t('calendarForm.name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            style={{
              width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10,
              border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none',
            }}
          />
        </div>

        <div>
          <label style={labelStyle}>{t('calendarForm.yearType')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {YEAR_MODES.map((m) => {
              const active = yearMode === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setYearMode(m.value)}
                  style={{
                    textAlign: 'left', padding: '0.6rem 0.8rem', borderRadius: 10,
                    border: active ? `2px solid ${color}` : '1px solid var(--border)',
                    background: active ? 'var(--surface-tint)' : 'var(--surface)',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t(m.title)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t(m.desc)}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <span style={labelStyle}>{t('holidays.title')}</span>
          {zoneState === 'unavailable' ? (
            <p data-testid="form-zone-unavailable" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {t('holidays.unavailable')}
            </p>
          ) : (
            <SchoolZonePicker name="form-zone" value={zone} onChange={setZone} disabled={zoneState === 'loading'} accent={color} />
          )}
        </div>

        <div>
          <label style={labelStyle}>{t('calendarForm.icon')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {ICON_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                style={{
                  width: '100%', aspectRatio: '1', borderRadius: 10,
                  border: icon === key ? `2px solid ${color}` : '1px solid var(--border)',
                  background: icon === key ? 'var(--surface-tint)' : 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon name={key} size={18} color={icon === key ? color : 'var(--text-secondary)'} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>{t('common.color')}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 30, height: 30, borderRadius: '50%', background: c, border: 'none',
                  outline: color === c ? '2px solid var(--text-primary)' : 'none', outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{noticeText(error, t)}</p>}

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 1, background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
              borderRadius: 10, padding: '0.7rem', fontSize: '0.9rem', fontWeight: 700,
            }}
          >
            {saving ? t('common.saving') : mode === 'create' ? t('common.create') : t('common.save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '0.7rem 1.1rem', fontSize: '0.9rem', fontWeight: 600,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
