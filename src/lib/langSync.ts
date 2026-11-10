// Langue liée au compte : elle suit la personne d'un appareil à l'autre, et le serveur d'envoi
// l'utilise pour rédiger les notifications de rappel (stockée dans user_metadata.lang).
import type { User } from '@supabase/supabase-js'
import { getLang, isLang, setLang, subscribeLang, type Lang } from '../i18n'
import { supabase } from './supabaseClient'

function accountLang(user: User | null | undefined): Lang | null {
  const value = (user?.user_metadata as Record<string, unknown> | undefined)?.lang
  return isLang(value) ? value : null
}

// Enregistre la langue dans le compte (une nouvelle tentative en cas d'échec).
async function saveToAccount(lang: Lang): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await supabase.auth.updateUser({ data: { lang } })
      if (!error) return
      console.warn('[langue] enregistrement impossible :', error.message)
    } catch (e) {
      console.warn('[langue] enregistrement impossible :', e)
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
}

// À appeler quand une personne est connectée. Renvoie la fonction d'arrêt.
//  - langue enregistrée dans le compte (lue sur le serveur) : adoptée sur cet appareil ;
//  - sinon la langue actuelle de l'appareil est enregistrée ;
//  - ensuite, chaque changement de langue est enregistré dans le compte.
export function startLangSync(user: User): () => void {
  let stopped = false
  let last: Lang = getLang()

  const unsubscribe = subscribeLang(() => {
    const now = getLang()
    if (now === last) return
    last = now
    void saveToAccount(now)
  })

  void (async () => {
    let saved = accountLang(user)
    try {
      const { data } = await supabase.auth.getUser() // valeur à jour côté serveur
      saved = accountLang(data?.user) ?? saved
    } catch {
      // On garde la valeur de la session.
    }
    if (stopped) return
    if (saved) {
      if (saved !== getLang()) setLang(saved) // le changement est déjà dans le compte
      last = saved
    } else {
      void saveToAccount(getLang())
    }
  })()

  return () => {
    stopped = true
    unsubscribe()
  }
}
