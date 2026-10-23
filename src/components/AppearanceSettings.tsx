import type { CSSProperties } from 'react'
import { useThemeMode } from '../hooks/useThemeMode'
import type { ThemeColor, ThemeMode } from '../lib/theme'

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
]

// Pastilles des thèmes : couleurs propres à chaque thème (elles ne changent pas avec le thème actif).
const COLORS: { value: ThemeColor; label: string; from: string; to: string }[] = [
  { value: 'blue', label: 'Bleu', from: '#38bdf8', to: '#1e40af' },
  { value: 'violet', label: 'Violet', from: '#8b5cf6', to: '#5b21b6' },
  { value: 'green', label: 'Vert', from: '#22c55e', to: '#14532d' },
  { value: 'pink', label: 'Rose', from: '#ec4899', to: '#9d174d' },
  { value: 'graphite', label: 'Graphite', from: '#64748b', to: '#1e293b' },
]

function ModeIcon({ mode }: { mode: ThemeMode }) {
  return (
    <svg
      width="18"
      height="18"
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
  minHeight: 60,
  padding: '0.5rem 0.3rem',
  border: 'none',
  borderRadius: 9,
  fontSize: '0.82rem',
  fontWeight: 600,
  background: active ? 'var(--gradient-main)' : 'transparent',
  color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
})

const groupLabel: CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 0.4rem',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

// Choix du mode (clair / sombre / système) et de la couleur du thème. Affiché dans le menu « Thème » de la barre du haut
// (composant ThemeToggle). Le choix est mémorisé sur cet appareil.
export default function AppearanceSettings() {
  const { mode, resolved, color, setMode, setColor } = useThemeMode()

  const hint =
    mode === 'system'
      ? `Suit le réglage de votre appareil (actuellement : ${resolved === 'dark' ? 'sombre' : 'clair'}).`
      : 'Ce choix est enregistré sur cet appareil.'

  return (
    <div>
      <p id="appearance-mode-label" style={groupLabel}>Affichage</p>
      <div
        role="group"
        aria-labelledby="appearance-mode-label"
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

      <p id="appearance-color-label" style={{ ...groupLabel, marginTop: '1rem' }}>Couleur</p>
      <div role="group" aria-labelledby="appearance-color-label" style={{ display: 'flex', gap: 4 }}>
        {COLORS.map((c) => {
          const active = color === c.value
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={active}
              aria-label={`Thème ${c.label}`}
              onClick={() => setColor(c.value)}
              style={{
                flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '0.5rem 0.1rem', border: 'none', background: 'transparent', borderRadius: 10,
                fontSize: '0.76rem', fontWeight: active ? 700 : 600,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                  boxShadow: active ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent-link)' : 'inset 0 0 0 1px rgba(255,255,255,0.25)',
                }}
              >
                {active && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
              {c.label}
            </button>
          )
        })}
      </div>

      <p role="status" aria-live="polite" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.8rem 0 0', lineHeight: 1.45 }}>
        {hint}
      </p>
    </div>
  )
}
