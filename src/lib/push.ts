import { supabase } from './supabaseClient'

// Notifications de rappel (Web Push). Rien ici ne s'exécute tant que l'utilisateur
// n'a pas cliqué sur « Activer les rappels » : le navigateur demande alors l'autorisation.

export type PushState =
  | { kind: 'unsupported'; reason: 'ios_needs_install' | 'no_service_worker' | 'no_push' }
  | { kind: 'denied' }
  | { kind: 'off' }
  | { kind: 'on' }

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'dismissed' | 'not_configured' | 'subscribe_failed' | 'register_failed' }

export type TestResult =
  | { ok: true; sent: number; failed: number }
  | { ok: false; reason: 'no_session' | 'not_configured' | 'no_device' | 'network_error' | 'server_error' }

function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isInstalledApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

function hasPushApis(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function sameBytes(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return false
  const x = new Uint8Array(a)
  if (x.length !== b.length) return false
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false
  return true
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

export async function getPushState(): Promise<PushState> {
  if (isIOS() && !isInstalledApp()) return { kind: 'unsupported', reason: 'ios_needs_install' }
  if (!hasPushApis()) return { kind: 'unsupported', reason: 'no_push' }

  // Le service worker n'est enregistré que sur le site en ligne (pas en développement).
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return { kind: 'unsupported', reason: 'no_service_worker' }

  if (Notification.permission === 'denied') return { kind: 'denied' }
  const subscription = await registration.pushManager.getSubscription()
  return subscription && Notification.permission === 'granted' ? { kind: 'on' } : { kind: 'off' }
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/config', { headers: { accept: 'application/json' } })
    const body = (await res.json()) as { ok?: boolean; publicKey?: string }
    return body.ok && typeof body.publicKey === 'string' ? body.publicKey : null
  } catch {
    return null
  }
}

// À appeler directement depuis un clic (le navigateur exige un geste de l'utilisateur).
export async function enablePush(): Promise<EnableResult> {
  const state = await getPushState()
  if (state.kind === 'unsupported') return { ok: false, reason: 'unsupported' }
  if (state.kind === 'denied') return { ok: false, reason: 'denied' }

  const permission = await Notification.requestPermission()
  if (permission === 'denied') return { ok: false, reason: 'denied' }
  if (permission !== 'granted') return { ok: false, reason: 'dismissed' }

  const publicKey = await fetchPublicKey()
  if (!publicKey) return { ok: false, reason: 'not_configured' }
  const keyBytes = keyToBytes(publicKey)

  let subscription: PushSubscription
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return { ok: false, reason: 'unsupported' }

    let existing = await registration.pushManager.getSubscription()
    // Abonnement créé avec une autre clé serveur : on le remplace.
    if (existing && !sameBytes(existing.options.applicationServerKey, keyBytes)) {
      await existing.unsubscribe()
      existing = null
    }
    subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes as BufferSource,
      }))
  } catch {
    return { ok: false, reason: 'subscribe_failed' }
  }

  const json = subscription.toJSON()
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_user_agent: navigator.userAgent,
  })
  if (error) {
    await subscription.unsubscribe().catch(() => undefined)
    return { ok: false, reason: 'register_failed' }
  }
  return { ok: true }
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe().catch(() => undefined)
}

// Envoie une notification d'essai à CET appareil.
export async function sendTestPush(): Promise<TestResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, reason: 'no_session' }

  const subscription = await currentSubscription()
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ endpoint: subscription?.endpoint ?? null }),
    })
    const body = (await res.json()) as { ok?: boolean; reason?: string; sent?: number; failed?: number }
    if (body.ok) return { ok: true, sent: body.sent ?? 0, failed: body.failed ?? 0 }
    if (body.reason === 'not_configured') return { ok: false, reason: 'not_configured' }
    if (body.reason === 'no_device') return { ok: false, reason: 'no_device' }
    return { ok: false, reason: 'server_error' }
  } catch {
    return { ok: false, reason: 'network_error' }
  }
}
