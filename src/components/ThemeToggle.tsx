import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ColorChoices, LanguageChoices } from './AppearanceSettings'
import { useI18n } from '../hooks/useI18n'
import { useThemeMode } from '../hooks/useThemeMode'

type Variant = 'header' | 'floating'

interface ThemeToggleProps {
  /** « header » : boutons posés sur la barre du haut. « floating » : boutons flottants en haut à droite de l'écran (pages sans barre du haut). */
  variant?: Variant
  size?: number
}

const SCREEN_MARGIN = 12
const COLOR_PANEL_WIDTH = 330
const LANGUAGE_PANEL_WIDTH = 230

interface PanelPosition {
  top: number
  left: number
  width: number
}

// Aspect commun des trois boutons : ronds, translucides sur la barre du haut, en verre dépoli sur les pages sans barre.
function buttonStyle(variant: Variant, size: number): CSSProperties {
  const look: CSSProperties =
    variant === 'floating'
      ? { background: 'var(--surface-glass)', color: 'var(--text-primary)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)' }
      : { background: 'rgba(255,255,255,0.18)', color: 'white', border: '1px solid rgba(255,255,255,0.55)' }
  return {
    ...look,
    borderRadius: '50%', width: size, height: size, padding: 0, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

function Icon({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </svg>
  )
}

const PaletteIcon = () => (
  <Icon>
    <circle cx="13.5" cy="6.5" r="0.6" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r="0.6" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r="0.6" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r="0.6" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </Icon>
)

const GlobeIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </Icon>
)

const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
)

const MoonIcon = () => (
  <Icon>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Icon>
)

interface MenuButtonProps {
  variant: Variant
  size: number
  kind: 'color' | 'language'
  /** Nom du bouton et du menu (lecteurs d'écran, infobulle). */
  label: string
  /** Titre affiché en haut du menu. */
  heading: string
  closeLabel: string
  panelWidth: number
  icon: ReactNode
  children: (close: (returnFocus: boolean) => void) => ReactNode
}

// Bouton rond qui ouvre un petit menu sous lui. Le menu reste toujours dans l'écran, le focus passe sur le choix en cours,
// et il se ferme avec Échap, un clic ou un appui en dehors, le défilement ou un changement de taille de la fenêtre.
function MenuButton({ variant, size, kind, label, heading, closeLabel, panelWidth, icon, children }: MenuButtonProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    setPosition(null)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  // Place le menu sous le bouton, sans jamais dépasser de l'écran.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const width = Math.min(panelWidth, window.innerWidth - SCREEN_MARGIN * 2)
    const left = Math.max(SCREEN_MARGIN, Math.min(rect.right - width, window.innerWidth - width - SCREEN_MARGIN))
    setPosition({ top: rect.bottom + 8, left, width })
  }, [open, panelWidth])

  // Une fois placé, le focus passe sur le choix en cours (accessibilité au clavier et aux lecteurs d'écran).
  useEffect(() => {
    if (!position) return
    const current = panelRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
    current?.focus({ preventScroll: true })
  }, [position])

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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`theme-btn theme-btn--${kind} theme-btn--${variant}`}
        onClick={() => (open ? close(false) : setOpen(true))}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        style={buttonStyle(variant, size)}
      >
        {icon}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          className="no-print"
          style={{
            position: 'fixed',
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            width: position?.width ?? panelWidth,
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)' }}>{heading}</h2>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label={closeLabel}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none', fontSize: '1.3rem', lineHeight: 1,
                background: 'var(--surface-alt)', color: 'var(--text-body)',
              }}
            >
              ×
            </button>
          </div>
          {children(close)}
        </div>
      )}
    </>
  )
}

// Trois boutons séparés, présents sur chaque écran : mode sombre (un clic), couleur du thème et langue (petits menus).
export default function ThemeToggle({ variant = 'header', size = 38 }: ThemeToggleProps) {
  const { t } = useI18n()
  const { resolved, setMode } = useThemeMode()
  const dark = resolved === 'dark'
  const modeLabel = t(dark ? 'appearance.mode.toLight' : 'appearance.mode.toDark')

  const group: CSSProperties =
    variant === 'floating'
      ? { position: 'fixed', top: '0.75rem', right: '0.75rem', zIndex: 50, display: 'flex', alignItems: 'center', gap: 6 }
      : { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }

  return (
    <div className="theme-toggle theme-controls no-print" style={group}>
      <MenuButton
        variant={variant}
        size={size}
        kind="color"
        label={t('appearance.colorButton')}
        heading={t('appearance.color')}
        closeLabel={t('appearance.close')}
        panelWidth={COLOR_PANEL_WIDTH}
        icon={<PaletteIcon />}
      >
        {() => <ColorChoices />}
      </MenuButton>

      <MenuButton
        variant={variant}
        size={size}
        kind="language"
        label={t('appearance.languageButton')}
        heading={t('appearance.language')}
        closeLabel={t('appearance.close')}
        panelWidth={LANGUAGE_PANEL_WIDTH}
        icon={<GlobeIcon />}
      >
        {(close) => <LanguageChoices onChosen={() => close(true)} />}
      </MenuButton>

      <button
        type="button"
        className={`theme-btn theme-btn--mode theme-btn--${variant}`}
        onClick={() => setMode(dark ? 'light' : 'dark')}
        aria-label={modeLabel}
        title={modeLabel}
        style={buttonStyle(variant, size)}
      >
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  )
}
