import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { getAvatarUrl } from '../lib/avatar'
import {
  disablePush,
  enablePush,
  getPushState,
  sendTestPush,
  type EnableResult,
  type PushState,
  type TestResult,
} from '../lib/push'
import { requestReminderSync } from '../lib/reminders'
import Logo from './Logo'
import DeleteAccountModal from './DeleteAccountModal'

interface ProfilePageProps {
  user: User
  onBack: () => void
  onUpdated: () => void
}

interface PushNote {
  kind: 'ok' | 'error'
  text: string
}

function enableErrorText(reason: Extract<EnableResult, { ok: false }>['reason']): string {
  switch (reason) {
    case 'denied':
      return 'Les notifications sont bloquées pour Calendraft. Autorisez-les dans les réglages du navigateur, puis réessayez.'
    case 'dismissed':
      return "L'autorisation n'a pas été accordée. Réessayez et touchez Autoriser quand le navigateur le demande."
    case 'not_configured':
      return "Le serveur d'envoi n'est pas encore configuré (clés de notification manquantes)."
    case 'register_failed':
      return "Cet appareil n'a pas pu être enregistré. Réessayez dans un instant."
    case 'unsupported':
      return "Les notifications ne sont pas disponibles dans cette fenêtre."
    default:
      return "Impossible d'activer les notifications sur cet appareil."
  }
}

function testNote(result: TestResult): PushNote {
  if (result.ok) {
    return result.sent > 0
      ? { kind: 'ok', text: 'Notification envoyée. Elle doit apparaître dans quelques secondes.' }
      : {
          kind: 'error',
          text: "Le serveur n'a pas réussi à joindre cet appareil. Désactivez puis réactivez les rappels.",
        }
  }
  switch (result.reason) {
    case 'no_device':
      return { kind: 'error', text: "Cet appareil n'est pas enregistré. Désactivez puis réactivez les rappels." }
    case 'not_configured':
      return { kind: 'error', text: "Le serveur d'envoi n'est pas encore configuré (clés de notification manquantes)." }
    case 'no_session':
      return { kind: 'error', text: 'Votre session a expiré. Reconnectez-vous puis réessayez.' }
    case 'network_error':
      return { kind: 'error', text: 'Connexion impossible. Vérifiez votre accès internet puis réessayez.' }
    default:
      return { kind: 'error', text: "L'envoi a échoué. Réessayez dans un instant." }
  }
}

const secondaryButton: React.CSSProperties = {
  background: 'white', color: 'var(--blue-dark)', border: '1px solid var(--blue-main)',
  borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 600,
}

export default function ProfilePage({ user, onBack, onUpdated }: ProfilePageProps) {
  const savedUsername = user.user_metadata?.username ?? ''
  const [username, setUsername] = useState(savedUsername)
  const [isEditingUsername, setIsEditingUsername] = useState(savedUsername === '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(getAvatarUrl(user) ?? null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [pushState, setPushState] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushNote, setPushNote] = useState<PushNote | null>(null)

  useEffect(() => {
    let cancelled = false
    getPushState()
      .catch((): PushState => ({ kind: 'unsupported', reason: 'no_push' }))
      .then((state) => {
        if (!cancelled) setPushState(state)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshPushState = async () => {
    const state = await getPushState().catch((): PushState => ({ kind: 'unsupported', reason: 'no_push' }))
    setPushState(state)
  }

  const handleEnablePush = async () => {
    setPushNote(null)
    setPushBusy(true)
    try {
      const result = await enablePush()
      if (!result.ok) setPushNote({ kind: 'error', text: enableErrorText(result.reason) })
      else {
        setPushNote({ kind: 'ok', text: 'Rappels activés sur cet appareil.' })
        // Les rappels déjà réglés sur vos événements deviennent actifs tout de suite.
        requestReminderSync()
      }
    } catch {
      setPushNote({ kind: 'error', text: enableErrorText('subscribe_failed') })
    }
    await refreshPushState()
    setPushBusy(false)
  }

  const handleDisablePush = async () => {
    setPushNote(null)
    setPushBusy(true)
    try {
      await disablePush()
      setPushNote({ kind: 'ok', text: 'Rappels désactivés sur cet appareil.' })
    } catch {
      setPushNote({ kind: 'error', text: "La désactivation a échoué. Réessayez dans un instant." })
    }
    await refreshPushState()
    setPushBusy(false)
  }

  const handleTestPush = async () => {
    setPushNote(null)
    setPushBusy(true)
    try {
      setPushNote(testNote(await sendTestPush()))
    } catch {
      setPushNote(testNote({ ok: false, reason: 'server_error' }))
    }
    setPushBusy(false)
  }

  const displayLabel = savedUsername || user.email || '?'
  const initial = displayLabel[0]?.toUpperCase() ?? '?'

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image trop lourde (2 Mo maximum).')
      return
    }

    setError(null)
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setUploading(false)
      setError(uploadError.message)
      return
    }

    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path)
    const newUrl = `${publicData.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase.auth.updateUser({
      data: { custom_avatar_url: newUrl },
    })

    setUploading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setAvatarUrl(newUrl)
    onUpdated()
  }

  const handleSaveUsername = async () => {
    setMessage(null)
    setError(null)
    setSaving(true)

    const { error } = await supabase.auth.updateUser({
      data: { username: username.trim() },
    })

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    setMessage("Nom d'utilisateur mis à jour.")
    setIsEditingUsername(false)
    onUpdated()
  }

  const handleResetPassword = async () => {
    setMessage(null)
    setError(null)
    if (!user.email) return
    const { error } = await supabase.auth.resetPasswordForEmail(user.email)
    if (error) setError(error.message)
    else setMessage('Email de réinitialisation envoyé.')
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          background: 'var(--gradient-main)',
          padding: '0.9rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(30, 64, 175, 0.25)',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', minWidth: 0 }}>
          <div style={{ background: 'white', borderRadius: 10, padding: '0.4rem 1rem', display: 'flex', alignItems: 'center' }}>
            <Logo height={38} />
          </div>
          <span style={{ color: 'white', fontSize: '1rem', fontWeight: 600, opacity: 0.95 }}>
            Mon profil
          </span>
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            background: 'rgba(255,255,255,0.15)', borderRadius: 999,
            padding: savedUsername ? '0.3rem 0.9rem 0.3rem 0.3rem' : '0.3rem',
          }}
        >
          <div
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'white', color: 'var(--blue-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.9rem', flexShrink: 0, overflow: 'hidden',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initial
            )}
          </div>
          {savedUsername && (
            <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>{savedUsername}</span>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 500, margin: '3rem auto', padding: '0 1.5rem' }}>
        <div
          style={{
            background: 'white', borderRadius: 16, padding: '2rem',
            boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)', textAlign: 'center',
          }}
        >
          <label style={{ display: 'inline-block', position: 'relative', cursor: 'pointer', marginBottom: '1rem' }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Photo de profil"
                style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: 88, height: 88, borderRadius: '50%',
                  background: 'var(--gradient-main)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '2rem',
                }}
              >
                {initial}
              </div>
            )}
            <div
              style={{
                position: 'absolute', bottom: 0, right: 0,
                background: 'var(--blue-dark)', color: 'white',
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.9rem', border: '2px solid white',
              }}
            >
              ✎
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>
          {uploading && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Envoi de la photo...</p>}

          <p style={{ color: 'var(--text-secondary)', margin: '0.3rem 0 1.5rem', wordBreak: 'break-word' }}>{user.email}</p>

          <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
              Nom d'utilisateur
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Votre nom affiché"
                disabled={!isEditingUsername}
                style={{
                  flex: '1 1 160px', minWidth: 0, padding: '0.6rem 0.8rem', borderRadius: 10,
                  border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none',
                  background: isEditingUsername ? 'white' : '#f8fafc',
                  color: isEditingUsername ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              />
              {isEditingUsername ? (
                <button
                  onClick={handleSaveUsername}
                  disabled={saving || username.trim() === ''}
                  style={{
                    background: 'var(--gradient-main)', color: 'white', border: 'none',
                    borderRadius: 10, padding: '0 1rem', fontSize: '0.85rem', fontWeight: 600,
                    flexShrink: 0, opacity: saving || username.trim() === '' ? 0.6 : 1,
                  }}
                >
                  {saving ? '...' : 'Enregistrer'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsEditingUsername(true)
                    setMessage(null)
                  }}
                  style={{
                    background: 'white', color: 'var(--blue-dark)', border: '1px solid var(--blue-main)',
                    borderRadius: 10, padding: '0 1rem', fontSize: '0.85rem', fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  Modifier
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleResetPassword}
            style={{
              background: 'var(--gradient-main)', color: 'white', border: 'none',
              borderRadius: 10, padding: '0.7rem 1.3rem', fontSize: '0.9rem', fontWeight: 600,
              marginBottom: '1rem', width: '100%',
            }}
          >
            Réinitialiser mon mot de passe
          </button>

          <a
            href="/application"
            style={{
              display: 'block', boxSizing: 'border-box', background: 'white', color: 'var(--blue-dark)',
              border: '1px solid var(--blue-main)', borderRadius: 10, padding: '0.7rem 1.3rem',
              fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', width: '100%',
              textDecoration: 'none',
            }}
          >
            Application mobile (Android et iPhone)
          </a>

          <section
            aria-labelledby="push-title"
            style={{
              textAlign: 'left', background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 12, padding: '1rem', marginBottom: '1rem',
            }}
          >
            <h2 id="push-title" style={{ fontSize: '0.95rem', margin: '0 0 0.3rem', color: 'var(--text-primary)' }}>
              Rappels sur cet appareil
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.8rem', lineHeight: 1.5 }}>
              Activez les notifications pour recevoir vos rappels d'événements. Chaque appareil
              (téléphone, ordinateur) s'active séparément. Le rappel de chaque événement se choisit
              dans l'onglet Événements d'un calendrier.
            </p>

            {pushState === null && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>Vérification en cours...</p>
            )}

            {pushState?.kind === 'unsupported' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                {pushState.reason === 'ios_needs_install' && (
                  <>
                    Sur iPhone, les rappels fonctionnent uniquement depuis l'application ajoutée à l'écran
                    d'accueil (iOS 16.4 ou plus récent). Ouvrez calendraft.fr dans Safari, touchez Partager,
                    puis « Sur l'écran d'accueil ». <a href="/application" style={{ color: 'var(--blue-dark)', fontWeight: 600 }}>Voir les explications</a>
                  </>
                )}
                {pushState.reason === 'no_service_worker' &&
                  "Les rappels ne sont pas disponibles dans cette fenêtre. Ouvrez Calendraft sur calendraft.fr puis actualisez la page."}
                {pushState.reason === 'no_push' &&
                  "Ce navigateur ne gère pas les notifications. Essayez avec Chrome, Edge ou Firefox."}
              </p>
            )}

            {pushState?.kind === 'denied' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                Les notifications sont bloquées pour Calendraft. Autorisez-les dans les réglages du navigateur
                (le cadenas à côté de l'adresse, puis Notifications), puis actualisez cette page.
              </p>
            )}

            {pushState?.kind === 'off' && (
              <button
                onClick={handleEnablePush}
                disabled={pushBusy}
                style={{
                  background: 'var(--gradient-main)', color: 'white', border: 'none',
                  borderRadius: 10, padding: '0.7rem 1.3rem', fontSize: '0.9rem', fontWeight: 600,
                  width: '100%', opacity: pushBusy ? 0.6 : 1,
                }}
              >
                {pushBusy ? 'Activation...' : 'Activer les rappels sur cet appareil'}
              </button>
            )}

            {pushState?.kind === 'on' && (
              <>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534', margin: '0 0 0.7rem' }}>
                  Les rappels sont activés sur cet appareil.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    onClick={handleTestPush}
                    disabled={pushBusy}
                    style={{ ...secondaryButton, flex: '1 1 180px', opacity: pushBusy ? 0.6 : 1 }}
                  >
                    {pushBusy ? 'Envoi...' : 'Envoyer une notification test'}
                  </button>
                  <button
                    onClick={handleDisablePush}
                    disabled={pushBusy}
                    style={{
                      background: 'transparent', border: '1px solid #fecaca', color: '#dc2626',
                      borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 600,
                      flex: '1 1 120px', opacity: pushBusy ? 0.6 : 1,
                    }}
                  >
                    Désactiver
                  </button>
                </div>
              </>
            )}

            <div role="status" aria-live="polite">
              {pushNote && (
                <p
                  style={{
                    fontSize: '0.82rem', margin: '0.7rem 0 0', lineHeight: 1.5, wordBreak: 'break-word',
                    color: pushNote.kind === 'ok' ? '#16a34a' : '#dc2626',
                  }}
                >
                  {pushNote.text}
                </p>
              )}

            </div>
          </section>

          {message && <p style={{ color: '#16a34a', fontSize: '0.85rem' }}>{message}</p>}
          {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', wordBreak: 'break-word' }}>{error}</p>}

          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '1.5rem 0' }} />

          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '0.6rem', flexWrap: 'wrap',
            }}
          >
            <button
              onClick={onBack}
              style={{
                background: '#eff6ff', color: 'var(--blue-dark)', border: '1px solid #bfdbfe',
                borderRadius: 10, padding: '0.6rem 1.2rem', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              ← Retour
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                background: 'transparent', border: '1px solid #fecaca', color: '#dc2626',
                borderRadius: 10, padding: '0.6rem 1.2rem', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              Se déconnecter
            </button>
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.2rem', borderTop: '1px solid #e2e8f0' }}>
            <button
              onClick={() => setShowDelete(true)}
              style={{
                background: 'transparent', border: 'none', color: '#b91c1c',
                fontSize: '0.8rem', fontWeight: 600, textDecoration: 'underline',
              }}
            >
              Supprimer mon compte
            </button>
          </div>
        </div>
      </main>

      {showDelete && <DeleteAccountModal user={user} onClose={() => setShowDelete(false)} />}
    </div>
  )
}
