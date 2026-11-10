// Langue liée au compte : elle suit la personne d'un appareil à l'autre, et le serveur d'envoi
// l'utilise pour rédiger les notifications de rappel (stockée dans user_metadata.lang).
import type { User } from '@supabase/supabase-js'
import { getLang, isLang, setLang, subscribeLang, type Lang } from '../i18n'
import { supabase } from './supabaseClient'

function accountLang(user: User): Lang | null {
  const value = (user.user_metadata as Record<string, unknown> | undefined)?.lang
  return isLang(value) ? value : null
}

async function saveToAccount(lang: Lang): Promise<void> {
  try {
    await supabase.auth.updateUser({ data: { lang } })
  } catch {
    // Au mieux : sans réseau, la langue reste mémorisée sur cet appareil.
  }
}

// À appeler quand une personne est connectée. Renvoie la fonction d'arrêt.
//  - langue déjà enregistrée dans le compte : elle est adoptée sur cet appareil ;
//  - sinon la langue actuelle de l'appareil est enregistrée ;
//  - ensuite, chaque changement de langue est enregistré dans le compte.
export function startLangSync(user: User): () => void {
  const saved = accountLang(user)
  if (saved) {
    if (saved !== getLang()) setLang(saved)
  } else {
    void saveToAccount(getLang())
  }
  let last: Lang = saved ?? getLang()
  return subscribeLang(() => {
    const now = getLang()
    if (now === last) return
    last = now
    void saveToAccount(now)
  })
}
