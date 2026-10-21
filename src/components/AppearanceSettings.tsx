import type { CSSProperties } from 'react'
import { useThemeMode } from '../hooks/useThemeMode'
import type { ThemeMode } from '../lib/theme'

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
]

function ModeIcon({ mode }: { mode: ThemeMode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {mode === 'system' && (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </>
      )}
      {mode === 'light' && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
      {mode === 'dark' && <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
    </svg>
  )
}

const optionStyle = (active: boolean): CSSProperties => ({
  flex: '1 1 0',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  minHeight: 56,
  padding: '0.5rem 0.3rem',
  border: 'none',
  borderRadius: 9,
  fontSize: '0.8rem',
  fontWeight: 600,
  background: active ? 'var(--gradient-main)' : 'transparent',
  color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
})

// Réglages d'apparence (affichés dans « Mon profil »). Le choix est mémorisé sur cet appareil.
export default function AppearanceSettings() {
  const { mode, resolved, setMode } = useThemeMode()

  const hint =
    mode === 'system'
      ? `Suit le réglage de votre appareil (actuellement : ${resolved === 'dark' ? 'sombre' : 'clair'}).`
      : 'Ce choix est enregistré sur cet appareil.'

  return (
    <section
      aria-labelledby="appearance-title"
      style={{
        textAlign: 'left', background: 'var(--surface-faint)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '1rem', marginBottom: '1rem',
      }}
    >
      <h2 id="appearance-title" style={{ fontSize: '0.95rem', margin: '0 0 0.3rem', color: 'var(--text-primary)' }}>
        Apparence
      </h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.8rem', lineHeight: 1.5 }}>
        Choisissez l'affichage clair ou sombre du site.
      </p>

      <div
        role="group"
        aria-label="Mode d'affichage"
        style={{ display: 'flex', gap: 4, background: 'var(--surface-alt)', padding: 4, borderRadius: 12 }}
      >
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
            style={optionStyle(mode === m.value)}
          >
            <ModeIcon mode={m.value} />
            {m.label}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.6rem 0 0', lineHeight: 1.45 }}>
        {hint}
      </p>
    </section>
  )
}
