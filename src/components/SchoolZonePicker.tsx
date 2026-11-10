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

const OPTIONS: { value: SchoolZone | null; label: string; id: string }[] = [
  { value: null, label: 'Aucune', id: 'none' },
  ...SCHOOL_ZONES.map((z) => ({ value: z as SchoolZone | null, label: `Zone ${z}`, id: z })),
]

// Choix de la zone de vacances scolaires : Aucune, A, B ou C, avec la liste des académies pour s'y retrouver.
export default function SchoolZonePicker({ value, onChange, disabled = false, name, accent }: SchoolZonePickerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div role="radiogroup" aria-label="Zone de vacances scolaires" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {OPTIONS.map((o) => {
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
        <summary id={`${name}-help`} style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--accent-link)' }}>Quelle est ma zone ?</summary>
        <div style={{ margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.35rem', lineHeight: 1.45 }}>
          <p style={{ margin: 0 }}>
            La zone dépend de l’académie de l’établissement (pas du domicile). En cas de doute, regardez le site de l’établissement.
          </p>
          {SCHOOL_ZONES.map((z) => (
            <p key={z} style={{ margin: 0 }}>
              <strong>Zone {z}</strong> : {ZONE_ACADEMIES[z]}.
            </p>
          ))}
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Corse et outre-mer : ces calendriers ne sont pas inclus, vérifiez les dates auprès de votre établissement.
          </p>
        </div>
      </details>
    </div>
  )
}
