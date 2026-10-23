import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import AppearanceSettings from './AppearanceSettings'
import { useI18n } from '../hooks/useI18n'

interface ThemeToggleProps {
  /** « header » : bouton posé sur la barre du haut. « floating » : bouton flottant en haut à droite de l'écran (pages sans barre du haut). */
  variant?: 'header' | 'floating'
  size?: number
}

const PANEL_MAX_WIDTH = 340
const SCREEN_MARGIN = 12

interface PanelPosition {
  top: number
  left: number
  width: number
}

// Bouton « Apparence » présent sur chaque écran : ouvre un petit menu avec le choix du mode (système / clair / sombre),
// de la couleur du thème et de la langue.
export default function ThemeToggle({ variant = 'header', size = 38 }: ThemeToggleProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const { t } = useI18n()

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    setPosition(null)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  // Place le menu sous le bouton, sans jamais dépasser de l'écran.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - SCREEN_MARGIN * 2)
    const left = Math.max(SCREEN_MARGIN, Math.min(rect.right - width, window.innerWidth - width - SCREEN_MARGIN))
    setPosition({ top: rect.bottom + 8, left, width })
  }, [open])

  // Une fois placé, le focus passe sur le choix en cours (accessibilité au clavier et aux lecteurs d'écran).
  useEffect(() => {
    if (!position) return
    const current = panelRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
    current?.focus({ preventScroll: true })
  }, [position])

  // Fermeture : touche Échap, clic ou appui en dehors, focus qui quitte le menu, défilement ou changement de taille.
  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (panelRef.current?.contains(target) || buttonRef.current?.contains(target))
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true)
    }
    const onPointer = (event: PointerEvent) => {
      if (!inside(event.target)) close(false)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!inside(event.target)) close(false)
    }
    const onMove = () => close(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('focusin', onFocusIn)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, close])

  const look: CSSProperties =
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
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`theme-toggle theme-menu-btn theme-menu-btn--${variant} no-print`}
        onClick={() => (open ? close(false) : setOpen(true))}
        aria-label={t('appearance.buttonTitle')}
        title={t('appearance.buttonTitle')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        style={{
          ...look,
          borderRadius: '50%', width: size, height: size, padding: 0, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <circle cx="13.5" cy="6.5" r="0.6" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r="0.6" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r="0.6" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r="0.6" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
        {variant === 'header' && <span className="theme-menu-label">{t('appearance.button')}</span>}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t('appearance.dialogLabel')}
          className="no-print"
          style={{
            position: 'fixed',
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            width: position?.width ?? PANEL_MAX_WIDTH,
            visibility: position ? 'visible' : 'hidden',
            zIndex: 70,
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-modal)',
            padding: '1rem',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
            <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)' }}>{t('appearance.title')}</h2>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label={t('appearance.close')}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none', fontSize: '1.3rem', lineHeight: 1,
                background: 'var(--surface-alt)', color: 'var(--text-body)',
              }}
            >
              ×
            </button>
          </div>
          <AppearanceSettings />
        </div>
      )}
    </>
  )
}
