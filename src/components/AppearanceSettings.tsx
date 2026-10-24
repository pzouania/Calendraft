import { useThemeMode } from '../hooks/useThemeMode'
import { useI18n } from '../hooks/useI18n'
import { LANGS, type Lang, type TranslationKey } from '../i18n'
import type { ThemeColor } from '../lib/theme'

// Noms des langues dans leur propre langue : ils ne se traduisent pas.
const LANGUAGE_NAMES: Record<Lang, string> = { fr: 'Français', en: 'English', de: 'Deutsch' }

// Pastilles des thèmes : couleurs propres à chaque thème (elles ne changent pas avec le thème actif).
const COLORS: { value: ThemeColor; label: TranslationKey; from: string; to: string }[] = [
  { value: 'blue', label: 'appearance.color.blue', from: '#38bdf8', to: '#1e40af' },
  { value: 'violet', label: 'appearance.color.violet', from: '#8b5cf6', to: '#5b21b6' },
  { value: 'green', label: 'appearance.color.green', from: '#22c55e', to: '#14532d' },
  { value: 'pink', label: 'appearance.color.pink', from: '#ec4899', to: '#9d174d' },
  { value: 'graphite', label: 'appearance.color.graphite', from: '#64748b', to: '#1e293b' },
]

// Choix de la couleur du thème (contenu du menu « couleur » de la barre du haut, voir ThemeToggle).
// Le choix est mémorisé sur cet appareil.
export function ColorChoices() {
  const { color, setColor } = useThemeMode()
  const { t } = useI18n()

  return (
    <div role="group" aria-label={t('appearance.color')} style={{ display: 'flex', gap: 4 }}>
      {COLORS.map((c) => {
        const active = color === c.value
        const colorName = t(c.label)
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={active}
            aria-label={t('appearance.colorAria', { color: colorName })}
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
            {colorName}
          </button>
        )
      })}
    </div>
  )
}

// Choix de la langue (contenu du menu « langue » de la barre du haut, voir ThemeToggle).
// Le choix est mémorisé sur cet appareil.
export function LanguageChoices({ onChosen }: { onChosen?: () => void }) {
  const { t, lang, setLang } = useI18n()

  return (
    <div role="group" aria-label={t('appearance.language')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {LANGS.map((l) => {
        const active = lang === l
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            onClick={() => {
              setLang(l)
              onChosen?.()
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              minHeight: 44, padding: '0 0.9rem', border: 'none', borderRadius: 10,
              fontSize: '0.92rem', fontWeight: 600, textAlign: 'left',
              background: active ? 'var(--gradient-main)' : 'var(--surface-alt)',
              color: active ? 'var(--on-accent)' : 'var(--text-body)',
            }}
          >
            {LANGUAGE_NAMES[l]}
            {active && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
