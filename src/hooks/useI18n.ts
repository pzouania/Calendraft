import { useMemo, useSyncExternalStore } from 'react'
import {
  formatDate,
  getLang,
  getLocale,
  monthName,
  setLang,
  subscribeLang,
  translate,
  weekdayName,
  type Lang,
  type Params,
  type TranslationKey,
} from '../i18n'

// Langue courante, traduction et formats de dates dans cette langue. Le composant se met à jour tout seul
// quand la langue change (menu Apparence, autre onglet).
export function useI18n() {
  const lang = useSyncExternalStore(subscribeLang, getLang, getLang)
  return useMemo(
    () => ({
      lang,
      locale: getLocale(lang),
      setLang,
      t: (key: TranslationKey, params?: Params) => translate(lang, key, params),
      formatDate: (value: Date | string, options: Intl.DateTimeFormatOptions) => formatDate(value, options, lang),
      monthName: (month: number, style: 'long' | 'short' = 'long') => monthName(month, style, lang),
      weekdayName: (index: number, style: 'long' | 'short' | 'narrow' = 'long') => weekdayName(index, style, lang),
    }),
    [lang],
  )
}

export type { Lang }
