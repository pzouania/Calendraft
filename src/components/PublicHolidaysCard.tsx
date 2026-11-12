import { useMemo, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { PUBLIC_HOLIDAY_COLOR, PUBLIC_HOLIDAY_LEGEND, publicHolidayName, publicHolidaysBetween } from '../lib/publicHolidays'
import { savePublicHolidays } from '../lib/publicHolidaysFlag'

interface PublicHolidaysCardProps {
  calendarId: string
  enabled: boolean
  // Le propriétaire active ou non les jours fériés ; les autres personnes voient seulement les dates.
  canChange: boolean
  // La base n'a pas encore la colonne (script SQL non exécuté).
  unavailable: boolean
  onChanged: (enabled: boolean) => void
}

const UPCOMING = 6

// Carte « Jours fériés » de l'onglet Vacances : activer l'affichage et voir les prochains jours fériés.
export default function PublicHolidaysCard({ calendarId, enabled, canChange, unavailable, onChanged }: PublicHolidaysCardProps) {
  const { t, lang, formatDate } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const upcoming = useMemo(() => {
    const year = Number(today.slice(0, 4))
    return publicHolidaysBetween(today, `${year + 1}-12-31`).slice(0, UPCOMING)
  }, [today])

  const change = async (next: boolean) => {
    if (busy || next === enabled) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const result = await savePublicHolidays(calendarId, next)
    setBusy(false)
    if (result.ok) {
      onChanged(result.enabled)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } else {
      setError(result.unavailable ? t('publicHolidays.unavailable') : result.message || t('common.networkRetry'))
    }
  }

  if (!canChange && !enabled) return null

  return (
    <section
      data-testid="public-holidays-card"
      aria-labelledby="public-holidays-title"
      style={{
        background: 'var(--surface)', borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '1rem',
        boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.7rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, backgroundColor: PUBLIC_HOLIDAY_COLOR, flexShrink: 0 }} />
        <h3 id="public-holidays-title" style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
          {PUBLIC_HOLIDAY_LEGEND[lang]}
        </h3>
        {saved && <span role="status" style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--success-strong)', fontWeight: 600 }}>{t('holidays.saved')}</span>}
      </div>

      {canChange && (
        <>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{t('publicHolidays.intro')}</p>
          {unavailable ? (
            <p role="status" data-testid="public-holidays-unavailable" style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: 10, fontSize: '0.82rem', background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>
              {t('publicHolidays.unavailable')}
            </p>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', cursor: busy ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                data-testid="public-holidays-toggle"
                checked={enabled}
                disabled={busy}
                onChange={(e) => change(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              {t('publicHolidays.toggle')}
            </label>
          )}
          {error && <p role="alert" data-testid="public-holidays-error" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--danger)' }}>{error}</p>}
        </>
      )}

      {enabled && (
        <ul data-testid="public-holidays-list" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {upcoming.map((h) => (
            <li
              key={h.date}
              style={{
                borderLeft: `4px solid ${PUBLIC_HOLIDAY_COLOR}`, borderRadius: 8, padding: '0.4rem 0.7rem',
                backgroundColor: 'var(--surface)', backgroundImage: 'linear-gradient(rgba(220, 38, 38, 0.08), rgba(220, 38, 38, 0.08))',
              }}
            >
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{publicHolidayName(h.key, lang)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-body)' }}>
                {formatDate(h.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
