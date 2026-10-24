// Langue du site (français, anglais, allemand) : détection, mémorisation, traduction (t), pluriels et dates (Intl).
// Pas de bibliothèque externe. Les textes sont dans fr.ts (référence), en.ts et de.ts.
//
// Utilisation dans un composant : const { t } = useI18n()   (src/hooks/useI18n.ts)  puis  t('common.cancel')
// Hors composant : import { t } from '../i18n'

import { fr, type Message, type TranslationKey } from './fr'
import { en } from './en'
import { de } from './de'

export type { TranslationKey } from './fr'
export type Lang = 'fr' | 'en' | 'de'
export type Params = Record<string, string | number>

export const LANGS: Lang[] = ['fr', 'en', 'de']
export const LANG_STORAGE_KEY = 'calendraft.lang'
export const DEFAULT_LANG: Lang = 'fr'

// Langue du navigateur : provisoirement ignorée (le site n'est pas encore entièrement traduit, un visiteur dont le
// navigateur est en anglais verrait un mélange). Passera à true quand tous les écrans seront traduits.
export const AUTO_DETECT_BROWSER_LANG = false

// Réglage régional utilisé pour les dates, les nombres et les pluriels.
const LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }
const DICTIONARIES: Record<Lang, Record<TranslationKey, Message>> = { fr, en, de }

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as string[]).includes(value)
}

// Ordre de priorité : choix mémorisé > langue du navigateur (si activée) > français.
export function detectLang(
  stored: string | null,
  browserLanguages: readonly string[],
  autoDetect: boolean = AUTO_DETECT_BROWSER_LANG,
): Lang {
  if (isLang(stored)) return stored
  if (autoDetect) {
    for (const tag of browserLanguages) {
      const primary = tag.toLowerCase().split('-')[0]
      if (isLang(primary)) return primary
    }
  }
  return DEFAULT_LANG
}

export function getLocale(lang: Lang): string {
  return LOCALES[lang]
}

// --- Traduction -----------------------------------------------------------------------------------------------------

const pluralRules = new Map<Lang, Intl.PluralRules>()
function pluralCategory(lang: Lang, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(lang)
  if (!rules) {
    rules = new Intl.PluralRules(LOCALES[lang])
    pluralRules.set(lang, rules)
  }
  return rules.select(count)
}

function pick(message: Message, lang: Lang, params?: Params): string {
  if (typeof message === 'string') return message
  const count = typeof params?.count === 'number' ? params.count : 2
  return pluralCategory(lang, count) === 'one' ? message.one : message.other
}

// Traduit une clé dans une langue donnée. Si la clé manque dans cette langue, on prend le français, puis la clé elle-même.
export function translate(lang: Lang, key: TranslationKey, params?: Params): string {
  const message = DICTIONARIES[lang][key] ?? fr[key]
  if (message === undefined) return key
  const text = pick(message, lang, params)
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

// --- Dates et noms (Intl) -------------------------------------------------------------------------------------------

// Accepte un objet Date ou une date « AAAA-MM-JJ » (lue en heure locale, comme le reste du site).
export function formatDate(value: Date | string, options: Intl.DateTimeFormatOptions, lang: Lang): string {
  const date = typeof value === 'string' ? new Date(value + 'T00:00:00') : value
  return new Intl.DateTimeFormat(LOCALES[lang], options).format(date)
}

// Nom du mois (0 = janvier).
export function monthName(month: number, style: 'long' | 'short', lang: Lang): string {
  return formatDate(new Date(2024, month, 1), { month: style }, lang)
}

// Nom du jour de la semaine (0 = lundi, comme dans les calendriers du site).
export function weekdayName(index: number, style: 'long' | 'short' | 'narrow', lang: Lang): string {
  return formatDate(new Date(2024, 0, 1 + index), { weekday: style }, lang) // le 1er janvier 2024 est un lundi
}

// --- État de la langue courante -------------------------------------------------------------------------------------

function readStored(): string | null {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY)
  } catch {
    return null
  }
}

function browserLanguages(): readonly string[] {
  try {
    return navigator.languages?.length ? navigator.languages : [navigator.language]
  } catch {
    return []
  }
}

let current: Lang = DEFAULT_LANG
const listeners = new Set<() => void>()

function apply(lang: Lang): void {
  document.documentElement.setAttribute('lang', lang)
}

function commit(lang: Lang): void {
  apply(lang)
  if (lang !== current) {
    current = lang
    listeners.forEach((listener) => listener())
  }
}

export function getLang(): Lang {
  return current
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Change la langue et la mémorise sur cet appareil.
export function setLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    // Sans stockage, le choix vaut jusqu'à la fermeture de la page.
  }
  commit(lang)
}

// Traduction dans la langue courante (hors composants).
export function t(key: TranslationKey, params?: Params): string {
  return translate(current, key, params)
}

// Initialisation au chargement du module : la langue est connue avant le premier affichage.
if (typeof window !== 'undefined') {
  commit(detectLang(readStored(), browserLanguages()))
  // Choix modifié dans un autre onglet.
  window.addEventListener('storage', (event) => {
    if (event.key === LANG_STORAGE_KEY || event.key === null) commit(detectLang(readStored(), browserLanguages()))
  })
}
