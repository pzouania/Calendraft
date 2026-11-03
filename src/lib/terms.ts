import { supabase } from './supabaseClient'

// Version des conditions d'utilisation que chaque personne doit avoir acceptée. À changer en même temps que la date
// « Dernière mise à jour » de la page des conditions (TermsPage) quand elles évoluent de façon importante :
// chacun devra alors les accepter de nouveau à sa prochaine connexion.
export const TERMS_VERSION = '2026-10-08'

const PENDING_KEY = 'calendraft.termsPending'
const PENDING_MAX_AGE_MS = 15 * 60 * 1000
const CACHE_PREFIX = 'calendraft.termsOk.'

// Inscription avec Google ou GitHub : la page quitte le site pendant la connexion. On garde donc un court moment le fait
// que la case était cochée, pour l'enregistrer au retour sans redemander.
export function rememberPendingTerms(): void {
  try {
    window.localStorage.setItem(PENDING_KEY, `${TERMS_VERSION}|${Date.now()}`)
  } catch {
    // Sans stockage, l'écran d'acceptation s'affichera au retour : rien de grave.
  }
}

export function takePendingTerms(): boolean {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    window.localStorage.removeItem(PENDING_KEY)
    if (!raw) return false
    const [version, time] = raw.split('|')
    const age = Date.now() - Number(time)
    // Récent (moins de 15 minutes) ; un horodatage dans le futur proche est toléré (petit décalage d'horloge), pas au-delà.
    return version === TERMS_VERSION && age > -60 * 1000 && age < PENDING_MAX_AGE_MS
  } catch {
    return false
  }
}

// Une fois l'acceptation confirmée, on s'en souvient sur cet appareil pour ne pas interroger la base à chaque ouverture.
export function isAcceptanceCached(userId: string): boolean {
  try {
    return window.localStorage.getItem(CACHE_PREFIX + userId) === TERMS_VERSION
  } catch {
    return false
  }
}

export function cacheAcceptance(userId: string): void {
  try {
    window.localStorage.setItem(CACHE_PREFIX + userId, TERMS_VERSION)
  } catch {
    // Sans stockage, la vérification se refera à la prochaine ouverture.
  }
}

// « unknown » : la vérification a échoué (réseau, table absente) ; l'application reste alors utilisable.
export type TermsStatus = 'accepted' | 'missing' | 'unknown'

export async function getTermsStatus(userId: string): Promise<TermsStatus> {
  try {
    const { data, error } = await supabase
      .from('terms_acceptances')
      .select('version')
      .eq('user_id', userId)
      .eq('version', TERMS_VERSION)
      .maybeSingle()
    if (error) return 'unknown'
    return data ? 'accepted' : 'missing'
  } catch {
    return 'unknown'
  }
}

// Enregistre l'acceptation de la personne connectée. Renvoie un message d'erreur, ou null si tout va bien.
export async function recordTermsAcceptance(userId: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('terms_acceptances').insert({ user_id: userId, version: TERMS_VERSION })
    // 23505 : déjà enregistrée (autre onglet, double clic) : c'est exactement ce qu'on voulait.
    if (error && error.code !== '23505') return error.message
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
