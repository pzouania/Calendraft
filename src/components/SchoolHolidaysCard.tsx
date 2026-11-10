import { useMemo, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { HOLIDAY_COLOR, holidayName, lastHolidayDay, resumeDay, schoolHolidays, type SchoolZone } from '../lib/schoolHolidays'
import { ZONE_UNAVAILABLE, saveSchoolZone } from '../lib/schoolZone'
import SchoolZonePicker from './SchoolZonePicker'

interface SchoolHolidaysCardProps {
  calendarId: string
  zone: SchoolZone | null
  // Le propriétaire choisit la zone ; les autres personnes voient seulement les dates.
  canChange: boolean
  // La base n'a pas encore la colonne de la zone (script SQL non exécuté).
  unavailable: boolean
  accent: string
  onChanged: (zone: SchoolZone | null) => void
}

const UPCOMING = 6

// Carte « Vacances scolaires » de l'onglet Événements : zone du calendrier et prochaines vacances.
export default function SchoolHolidaysCard({ calendarId, zone, canChange, unavailable, accent, onChanged }: SchoolHolidaysCardProps) {
  const { formatDate } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Jour affiché comme « aujourd'hui » : fixé à l'ouverture de la carte.
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const upcoming = useMemo(() => (zone ? schoolHolidays(zone).filter((h) => h.to > today).slice(0, UPCOMING) : []), [zone, today])
  const lastKnown = zone ? schoolHolidays(zone)[schoolHolidays(zone).length - 1] : null
  const exhausted = zone !== null && upcoming.length === 0

  const change = async (next: SchoolZone | null) => {
    if (busy || next === zone) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const result = await saveSchoolZone(calendarId, next)
    setBusy(false)
    if (result.ok) {
      onChanged(result.zone)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } else {
      setError(result.message)
    }
  }

  const day = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  // Un calendrier sans zone, que personne ne peut changer et sans colonne côté serveur : rien à montrer.
  if (!canChange && !zone) return null

  return (
    <section
      data-testid="holidays-card"
      aria-labelledby="holidays-card-title"
      style={{
        background: 'var(--surface)', borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '1rem',
        boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.7rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, backgroundColor: HOLIDAY_COLOR, flexShrink: 0 }} />
        <h3 id="holidays-card-title" style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
          Vacances scolaires{zone ? ` (zone ${zone})` : ''}
        </h3>
        {saved && <span role="status" style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--success-strong)', fontWeight: 600 }}>Enregistré</span>}
      </div>

      {canChange && (
        <>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Choisissez la zone pour voir les vacances dans le calendrier, le PDF, la liste ci-dessous et l’export vers votre agenda.
          </p>
          {unavailable ? (
            <p role="status" data-testid="holidays-unavailable" style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: 10, fontSize: '0.82rem', background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>
              {ZONE_UNAVAILABLE}
            </p>
          ) : (
            <SchoolZonePicker name={`zone-${calendarId}`} value={zone} onChange={change} disabled={busy} accent={accent} />
          )}
          {error && (
            <p role="alert" data-testid="holidays-error" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--danger)' }}>{error}</p>
          )}
        </>
      )}

      {zone && upcoming.length > 0 && (
        <ul data-testid="holidays-list" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {upcoming.map((h) => {
            const resume = resumeDay(h)
            return (
              <li
                key={h.from}
                data-kind={h.kind}
                style={{
                  borderLeft: `4px solid ${HOLIDAY_COLOR}`, borderRadius: 8, padding: '0.4rem 0.7rem',
                  backgroundColor: 'var(--surface)', backgroundImage: 'linear-gradient(rgba(245, 158, 11, 0.14), rgba(245, 158, 11, 0.14))',
                }}
              >
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{holidayName(h.kind)}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-body)' }}>
                  Du {day(h.from)} au {day(lastHolidayDay(h))}
                  {resume ? ` · reprise le ${day(resume)}` : ' · reprise : date non publiée'}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {exhausted && lastKnown && (
        <p data-testid="holidays-none" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Les dates connues s’arrêtent au {day(lastHolidayDay(lastKnown))} : il n’y a pas de vacances à venir à afficher.
        </p>
      )}
    </section>
  )
}
