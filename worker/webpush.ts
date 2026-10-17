// Web Push (RFC 8030 + RFC 8291 + RFC 8292) avec WebCrypto uniquement :
// aucune dépendance, fonctionne dans un Cloudflare Worker.

export interface PushTarget {
  endpoint: string
  p256dh: string // clé publique du navigateur, base64url (65 octets, non compressée)
  auth: string // secret d'authentification du navigateur, base64url (16 octets)
}

export interface VapidConfig {
  publicKey: string // base64url, 65 octets non compressés (commence par 0x04)
  privateKey: string // base64url, 32 octets (la valeur « d »)
  subject: string // mailto:... ou https://...
}

export interface SendOptions {
  ttl?: number // secondes pendant lesquelles le service de push garde le message
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
  topic?: string
}

export interface SendResult {
  ok: boolean
  status: number
  gone: boolean // l'abonnement n'existe plus (404 / 410) : à supprimer
}

const enc = new TextEncoder()

export function b64uToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64u(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  lengthBytes: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    lengthBytes * 8
  )
  return new Uint8Array(bits)
}

function privateJwk(publicRaw: Uint8Array, privateB64u: string): JsonWebKey {
  if (publicRaw.length !== 65 || publicRaw[0] !== 4) throw new Error('invalid_public_key')
  return {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64u(publicRaw.slice(1, 33)),
    y: bytesToB64u(publicRaw.slice(33, 65)),
    d: privateB64u,
    ext: true,
  }
}

interface EncryptionInputs {
  uaPublic: Uint8Array
  authSecret: Uint8Array
  salt?: Uint8Array
  // Uniquement pour les tests (vecteur de la RFC 8291) : paire de clés éphémère imposée.
  fixedServerKey?: { publicRaw: Uint8Array; privateB64u: string }
}

export async function encryptPayload(plaintext: Uint8Array, input: EncryptionInputs): Promise<Uint8Array> {
  const { uaPublic, authSecret } = input
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid_subscription_key')
  if (authSecret.length < 16) throw new Error('invalid_subscription_auth')
  if (plaintext.length > 3993) throw new Error('payload_too_large')

  let serverPublic: Uint8Array
  let serverPrivate: CryptoKey
  if (input.fixedServerKey) {
    serverPublic = input.fixedServerKey.publicRaw
    serverPrivate = await crypto.subtle.importKey(
      'jwk',
      privateJwk(serverPublic, input.fixedServerKey.privateB64u),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
    )
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair
    serverPublic = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
    serverPrivate = pair.privateKey
  }

  const clientKey = await crypto.subtle.importKey(
    'raw',
    uaPublic as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverPrivate, 256)
  )

  const salt = input.salt ?? crypto.getRandomValues(new Uint8Array(16))

  // RFC 8291 §3.4
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, serverPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  // RFC 8188
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const padded = concat(plaintext, new Uint8Array([2])) // 0x02 = dernier (et seul) enregistrement
  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, padded as BufferSource)
  )

  const header = new Uint8Array(21 + serverPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false) // taille d'enregistrement
  header[20] = serverPublic.length
  header.set(serverPublic, 21)
  return concat(header, cipher)
}

const jwtCache = new Map<string, { token: string; exp: number }>()

export async function vapidAuthorization(endpoint: string, vapid: VapidConfig, nowSeconds?: number): Promise<string> {
  const audience = new URL(endpoint).origin
  const now = nowSeconds ?? Math.floor(Date.now() / 1000)
  const cacheKey = `${audience}|${vapid.subject}|${vapid.publicKey}`
  const cached = jwtCache.get(cacheKey)
  if (cached && cached.exp - now > 3600) return `vapid t=${cached.token}, k=${vapid.publicKey}`

  const exp = now + 12 * 3600
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64u(enc.encode(JSON.stringify({ aud: audience, exp, sub: vapid.subject })))
  const signingInput = `${header}.${claims}`

  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk(b64uToBytes(vapid.publicKey), vapid.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput))
  )
  const token = `${signingInput}.${bytesToB64u(signature)}`
  jwtCache.set(cacheKey, { token, exp })
  return `vapid t=${token}, k=${vapid.publicKey}`
}

export async function sendWebPush(
  target: PushTarget,
  payload: unknown,
  vapid: VapidConfig,
  options: SendOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  const url = new URL(target.endpoint)
  if (url.protocol !== 'https:') return { ok: false, status: 0, gone: false }

  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), {
    uaPublic: b64uToBytes(target.p256dh),
    authSecret: b64uToBytes(target.auth),
  })

  const headers: Record<string, string> = {
    authorization: await vapidAuthorization(target.endpoint, vapid),
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
    ttl: String(options.ttl ?? 3600),
    urgency: options.urgency ?? 'normal',
  }
  if (options.topic) headers.topic = options.topic

  const res = await fetchImpl(target.endpoint, { method: 'POST', headers, body: body as BodyInit })
  // On vide la réponse pour libérer la connexion.
  await res.arrayBuffer().catch(() => undefined)
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 }
}

/** Génère une paire de clés VAPID (à faire une seule fois, hors du dépôt). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
  const publicRaw = concat(new Uint8Array([4]), b64uToBytes(jwk.x!), b64uToBytes(jwk.y!))
  return { publicKey: bytesToB64u(publicRaw), privateKey: jwk.d! }
}
