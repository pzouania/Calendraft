import { useI18n } from '../hooks/useI18n'
import { SCHOOL_ZONES, ZONE_ACADEMIES, type SchoolZone } from '../lib/schoolHolidays'

interface SchoolZonePickerProps {
  value: SchoolZone | null
  onChange: (zone: SchoolZone | null) => void
  disabled?: boolean
  // Préfixe des identifiants (plusieurs sélecteurs peuvent être affichés).
  name: string
  // Couleur d'accent du choix actif (celle du calendrier).
  accent?: string
}

// Choix de la zone de vacances scolaires : Aucune, A, B ou C, avec la liste des académies pour s'y retrouver.
export default function SchoolZonePicker({ value, onChange, disabled = false, name, accent }: SchoolZonePickerProps) {
  const { t } = useI18n()
  // Les libellés sont lus à l'affichage : ils suivent la langue choisie.
  const options: { value: SchoolZone | null; label: string; id: string }[] = [
    { value: null, label: t('holidays.zone.none'), id: 'none' },
    ...SCHOOL_ZONES.map((z) => ({ value: z as SchoolZone | null, label: t('holidays.zone.option', { zone: z }), id: z })),
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div role="radiogroup" aria-label={t('holidays.zone.aria')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const active = value === o.value
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`zone-${o.id}`}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              style={{
                flex: '1 1 0', minWidth: 64, minHeight: 40, padding: '0.45rem 0.6rem', borderRadius: 10,
                border: active ? `2px solid ${accent ?? 'var(--accent-link)'}` : '1px solid var(--border)',
                background: active ? 'var(--surface-tint)' : 'var(--surface)',
                color: active ? 'var(--accent-text)' : 'var(--text-body)', fontSize: '0.85rem', fontWeight: 700,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      <details style={{ fontSize: '0.8rem', color: 'var(--text-body)' }}>
        <summary id={`${name}-help`} style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--accent-link)' }}>{t('holidays.zone.help')}</summary>
        <div style={{ margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.35rem', lineHeight: 1.45 }}>
          <p style={{ margin: 0 }}>
            {t('holidays.zone.rule')}
          </p>
          {SCHOOL_ZONES.map((z) => (
            <p key={z} style={{ margin: 0 }}>
              <strong>{t('holidays.zone.option', { zone: z })}</strong>
              {t('holidays.zone.academies', { list: ZONE_ACADEMIES[z] })}
            </p>
          ))}
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            {t('holidays.zone.other')}
          </p>
        </div>
      </details>
    </div>
  )
}
