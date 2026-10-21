import type { CSSProperties } from 'react'
import { useThemeMode } from '../hooks/useThemeMode'

interface ThemeToggleProps {
  /** « header » : pastille translucide posée sur la barre du haut. « floating » : bouton flottant en haut à droite de l'écran (pages sans barre du haut). */
  variant?: 'header' | 'floating'
  size?: number
}

// Bouton de bascule clair / sombre, accessible depuis chaque écran. Le choix à trois positions
// (Système / Clair / Sombre) reste disponible dans Mon profil.
export default function ThemeToggle({ variant = 'header', size = 38 }: ThemeToggleProps) {
  const { resolved, setMode } = useThemeMode()
  const toDark = resolved === 'light'
  const label = toDark ? 'Passer en mode sombre' : 'Passer en mode clair'

  const style: CSSProperties =
    variant === 'floating'
      ? {
          position: 'fixed', top: '0.75rem', right: '0.75rem', zIndex: 50,
          background: 'var(--surface-glass)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)',
        }
      : {
          background: 'rgba(255,255,255,0.18)', color: 'white',
          border: '1px solid rgba(255,255,255,0.55)',
        }

  return (
    <button
      type="button"
      className="theme-toggle no-print"
      onClick={() => setMode(toDark ? 'dark' : 'light')}
      aria-label={label}
      title={label}
      style={{
        ...style,
        borderRadius: '50%', width: size, height: size, padding: 0, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
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
      >
        {toDark ? (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  )
}
