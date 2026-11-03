import { useId } from 'react'
import { useI18n } from '../hooks/useI18n'

interface TermsConsentProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Case oubliée : la case est entourée en rouge. */
  invalid?: boolean
}

// Case « J'ai lu et j'accepte les conditions d'utilisation » (inscription et écran d'acceptation).
// Le lien s'ouvre dans un nouvel onglet pour ne pas faire perdre ce qui est en cours de saisie.
export default function TermsConsent({ checked, onChange, invalid = false }: TermsConsentProps) {
  const { t } = useI18n()
  const id = useId()
  // La phrase traduite contient {link} à l'endroit où le lien doit apparaître (l'ordre des mots change selon la langue).
  const [before, after = ''] = t('terms.accept').split('{link}')

  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
        fontSize: '0.85rem', lineHeight: 1.45, color: 'var(--text-body)',
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid}
        style={{
          width: 20, height: 20, margin: '1px 0 0', flexShrink: 0, accentColor: 'var(--accent-link)',
          outline: invalid ? '2px solid var(--danger)' : undefined, outlineOffset: 2,
        }}
      />
      <span>
        {before}
        <a href="/conditions" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-link)', fontWeight: 600 }}>
          {t('terms.link')}
        </a>
        {after}
      </span>
    </label>
  )
}
