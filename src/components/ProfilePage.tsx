import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { getAvatarUrl } from '../lib/avatar'
import {
  disablePush,
  enablePush,
  getPushState,
  type EnableResult,
  type PushState,
} from '../lib/push'
import { requestReminderSync } from '../lib/reminders'
import { useI18n } from '../hooks/useI18n'
import { noticeFromAuthError, noticeText, type Notice } from '../lib/authErrors'
import type { TranslationKey } from '../i18n'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import DeleteAccountModal from './DeleteAccountModal'

interface ProfilePageProps {
  user: User
  onBack: () => void
  onUpdated: () => void
}

interface PushNote {
  kind: 'ok' | 'error'
  text: TranslationKey
}

function enableErrorKey(reason: Extract<EnableResult, { ok: false }>['reason']): TranslationKey {
  switch (reason) {
    case 'denied':
      return 'profile.push.error.denied'
    case 'dismissed':
      return 'profile.push.error.dismissed'
    case 'not_configured':
      return 'profile.push.error.notConfigured'
    case 'register_failed':
      return 'profile.push.error.registerFailed'
    case 'unsupported':
      return 'profile.push.error.unsupported'
    default:
      return 'profile.push.error.generic'
  }
}

export default function ProfilePage({ user, onBack, onUpdated }: ProfilePageProps) {
  const { t } = useI18n()
  const savedUsername = user.user_metadata?.username ?? ''
  const [username, setUsername] = useState(savedUsername)
  const [isEditingUsername, setIsEditingUsername] = useState(savedUsername === '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(getAvatarUrl(user) ?? null)
  const [message, setMessage] = useState<Notice | null>(null)
  const [error, setError] = useState<Notice | null>(null)
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
      if (!result.ok) setPushNote({ kind: 'error', text: enableErrorKey(result.reason) })
      else {
        setPushNote({ kind: 'ok', text: 'profile.push.enabledNote' })
        // Les rappels déjà réglés sur vos événements deviennent actifs tout de suite.
        requestReminderSync()
      }
    } catch {
      setPushNote({ kind: 'error', text: enableErrorKey('subscribe_failed') })
    }
    await refreshPushState()
    setPushBusy(false)
  }

  const handleDisablePush = async () => {
    setPushNote(null)
    setPushBusy(true)
    try {
      await disablePush()
      setPushNote({ kind: 'ok', text: 'profile.push.disabledNote' })
    } catch {
      setPushNote({ kind: 'error', text: 'profile.push.error.disableFailed' })
    }
    await refreshPushState()
    setPushBusy(false)
  }

  const displayLabel = savedUsername || user.email || '?'
  const initial = displayLabel[0]?.toUpperCase() ?? '?'

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError({ key: 'profile.avatar.notImage' })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError({ key: 'profile.avatar.tooBig' })
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
      setError({ raw: uploadError.message })
      return
    }

    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path)
    const newUrl = `${publicData.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase.auth.updateUser({
      data: { custom_avatar_url: newUrl },
    })

    setUploading(false)

    if (updateError) {
      setError(noticeFromAuthError(updateError))
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
      setError(noticeFromAuthError(error))
      return
    }

    setMessage({ key: 'profile.usernameSaved' })
    setIsEditingUsername(false)
    onUpdated()
  }

  const handleResetPassword = async () => {
    setMessage(null)
    setError(null)
    if (!user.email) return
    const { error } = await supabase.auth.resetPasswordForEmail(user.email)
    if (error) setError(noticeFromAuthError(error))
    else setMessage({ key: 'profile.resetSent' })
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          background: 'var(--header-bg)',
          padding: '0.9rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-header)',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', minWidth: 0 }}>
          <div className="header-logo" style={{ background: 'white', borderRadius: 10, padding: '0.4rem 1rem', display: 'flex', alignItems: 'center' }}>
            <Logo height={38} />
          </div>
          <span style={{ color: 'white', fontSize: '1rem', fontWeight: 600, opacity: 0.95 }}>
            {t('profile.title')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ThemeToggle />
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
        </div>
      </header>

      <main style={{ maxWidth: 500, margin: '3rem auto', padding: '0 1.5rem' }}>
        <div
          style={{
            background: 'var(--surface)', borderRadius: 16, padding: '2rem',
            boxShadow: 'var(--shadow-md)', textAlign: 'center',
          }}
        >
          <label style={{ display: 'inline-block', position: 'relative', cursor: 'pointer', marginBottom: '1rem' }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={t('profile.avatar.alt')}
                style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: 88, height: 88, borderRadius: '50%',
                  background: 'var(--gradient-main)', color: 'var(--on-accent)',
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
                background: 'var(--blue-dark)', color: 'var(--on-accent)',
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.9rem', border: '2px solid var(--surface)',
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
          {uploading && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('profile.avatar.uploading')}</p>}

          <p style={{ color: 'var(--text-secondary)', margin: '0.3rem 0 1.5rem', wordBreak: 'break-word' }}>{user.email}</p>

          <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
              {t('profile.username')}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('profile.usernamePlaceholder')}
                disabled={!isEditingUsername}
                style={{
                  flex: '1 1 160px', minWidth: 0, padding: '0.6rem 0.8rem', borderRadius: 10,
                  border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none',
                  background: isEditingUsername ? 'var(--input-bg)' : 'var(--surface-faint)',
                  color: isEditingUsername ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              />
              {isEditingUsername ? (
                <button
                  onClick={handleSaveUsername}
                  disabled={saving || username.trim() === ''}
                  style={{
                    background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
                    borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 600,
                    flexShrink: 0, opacity: saving || username.trim() === '' ? 0.6 : 1,
                  }}
                >
                  {saving ? '...' : t('common.save')}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsEditingUsername(true)
                    setMessage(null)
                  }}
                  style={{
                    background: 'var(--surface)', color: 'var(--accent-text)', border: '1px solid var(--blue-main)',
                    borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {t('common.edit')}
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleResetPassword}
            style={{
              background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
              borderRadius: 10, padding: '0.7rem 1.3rem', fontSize: '0.9rem', fontWeight: 600,
              marginBottom: '1rem', width: '100%',
            }}
          >
            {t('profile.resetPassword')}
          </button>

          <a
            href="/application"
            style={{
              display: 'block', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--accent-text)',
              border: '1px solid var(--blue-main)', borderRadius: 10, padding: '0.7rem 1.3rem',
              fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', width: '100%',
              textDecoration: 'none',
            }}
          >
            {t('profile.appLink')}
          </a>

          <section
            aria-labelledby="push-title"
            style={{
              textAlign: 'left', background: 'var(--surface-tint)', border: '1px solid var(--tint-border)',
              borderRadius: 12, padding: '1rem', marginBottom: '1rem',
            }}
          >
            <h2 id="push-title" style={{ fontSize: '0.95rem', margin: '0 0 0.3rem', color: 'var(--text-primary)' }}>
              {t('profile.push.title')}
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.8rem', lineHeight: 1.5 }}>
              {t('profile.push.intro')}
            </p>

            {pushState === null && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>{t('profile.push.checking')}</p>
            )}

            {pushState?.kind === 'unsupported' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                {pushState.reason === 'ios_needs_install' && (
                  <>
                    {t('profile.push.ios.text')}{' '}
                    <a href="/application" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{t('profile.push.ios.link')}</a>
                  </>
                )}
                {pushState.reason === 'no_service_worker' && t('profile.push.noServiceWorker')}
                {pushState.reason === 'no_push' && t('profile.push.noPush')}
              </p>
            )}

            {pushState?.kind === 'denied' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                {t('profile.push.denied')}
              </p>
            )}

            {pushState?.kind === 'off' && (
              <button
                onClick={handleEnablePush}
                disabled={pushBusy}
                style={{
                  background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
                  borderRadius: 10, padding: '0.7rem 1.3rem', fontSize: '0.9rem', fontWeight: 600,
                  width: '100%', opacity: pushBusy ? 0.6 : 1,
                }}
              >
                {pushBusy ? t('profile.push.enabling') : t('profile.push.enable')}
              </button>
            )}

            {pushState?.kind === 'on' && (
              <>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success-strong)', margin: '0 0 0.7rem' }}>
                  {t('profile.push.on')}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    onClick={handleDisablePush}
                    disabled={pushBusy}
                    style={{
                      background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                      borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 600,
                      flex: '1 1 120px', opacity: pushBusy ? 0.6 : 1,
                    }}
                  >
                    {t('profile.push.disable')}
                  </button>
                </div>
              </>
            )}

            <div role="status" aria-live="polite">
              {pushNote && (
                <p
                  style={{
                    fontSize: '0.82rem', margin: '0.7rem 0 0', lineHeight: 1.5, wordBreak: 'break-word',
                    color: pushNote.kind === 'ok' ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {t(pushNote.text)}
                </p>
              )}

            </div>
          </section>

          {message && <p style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{noticeText(message, t)}</p>}
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', wordBreak: 'break-word' }}>{noticeText(error, t)}</p>}

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />

          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '0.6rem', flexWrap: 'wrap',
            }}
          >
            <button
              onClick={onBack}
              style={{
                background: 'var(--surface-tint)', color: 'var(--accent-text)', border: '1px solid var(--tint-border)',
                borderRadius: 10, padding: '0.6rem 1.2rem', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              ← {t('common.back')}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                borderRadius: 10, padding: '0.6rem 1.2rem', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              {t('common.signOut')}
            </button>
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setShowDelete(true)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--danger-text)',
                fontSize: '0.8rem', fontWeight: 600, textDecoration: 'underline',
              }}
            >
              {t('profile.deleteAccount')}
            </button>
          </div>
        </div>
      </main>

      {showDelete && <DeleteAccountModal user={user} onClose={() => setShowDelete(false)} />}
    </div>
  )
}
