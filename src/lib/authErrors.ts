import type { Params, TranslationKey } from '../i18n'

// Message affiché à l'utilisateur : soit une clé de traduction (le texte suit alors la langue choisie, même si elle
// change pendant que le message est affiché), soit un texte brut renvoyé tel quel par le serveur.
export type Notice = { key: TranslationKey; params?: Params } | { raw: string }

interface AuthErrorLike {
  message: string
  code?: string
  name?: string
}

// Transforme une erreur du service de connexion (Supabase) en message traduisible. Les erreurs courantes sont
// reconnues par leur code, ou à défaut par leur texte anglais ; les autres gardent le texte du serveur.
export function noticeFromAuthError(error: AuthErrorLike): Notice {
  const code = error.code ?? ''
  const message = error.message ?? ''
  const lower = message.toLowerCase()

  if (code === 'invalid_credentials' || lower.includes('invalid login credentials')) {
    return { key: 'authError.invalidCredentials' }
  }
  if (code === 'user_already_exists' || code === 'email_exists' || lower.includes('user already registered')) {
    return { key: 'authError.userExists' }
  }
  const tooShort = /at least (\d+) characters/i.exec(message)
  if (tooShort && (code === 'weak_password' || lower.startsWith('password should be'))) {
    return { key: 'authError.passwordTooShort', params: { min: Number(tooShort[1]) } }
  }
  if (code === 'email_not_confirmed' || lower.includes('email not confirmed')) {
    return { key: 'authError.emailNotConfirmed' }
  }
  const wait = /after (\d+) seconds?/i.exec(message)
  if (wait) return { key: 'authError.retryAfter', params: { count: Number(wait[1]) } }
  if (code === 'over_email_send_rate_limit' || lower.includes('email rate limit exceeded')) {
    return { key: 'authError.emailRateLimit' }
  }
  if (code === 'over_request_rate_limit' || lower.includes('rate limit')) {
    return { key: 'authError.requestRateLimit' }
  }
  if (code === 'same_password' || lower.includes('different from the old password')) {
    return { key: 'authError.samePassword' }
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    lower === 'failed to fetch' ||
    lower === 'load failed' ||
    lower.startsWith('networkerror')
  ) {
    return { key: 'authError.network' }
  }
  return { raw: message }
}

export function noticeText(notice: Notice, t: (key: TranslationKey, params?: Params) => string): string {
  return 'key' in notice ? t(notice.key, notice.params) : notice.raw
}
