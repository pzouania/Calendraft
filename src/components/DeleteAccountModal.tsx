import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useI18n } from '../hooks/useI18n'
import { noticeText, type Notice } from '../lib/authErrors'

interface DeleteAccountModalProps {
  user: User
  onClose: () => void
}

export default function DeleteAccountModal({ user, onClose }: DeleteAccountModalProps) {
  const { t } = useI18n()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Notice | null>(null)

  // Le mot à taper suit la langue du site (SUPPRIMER, DELETE, LÖSCHEN).
  const confirmWord = t('deleteAccount.confirmWord')
  const ready = typed.trim().toUpperCase() === confirmWord.toUpperCase()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const handleDelete = async () => {
    if (!ready || busy) return
    setError(null)
    setBusy(true)

    const { data: files, error: listError } = await supabase.storage.from('avatars').list(user.id)
    if (listError) {
      setBusy(false)
      setError({ key: 'deleteAccount.error.photoCheck', params: { detail: listError.message } })
      return
    }

    if (files && files.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('avatars')
        .remove(files.map((f) => `${user.id}/${f.name}`))
      if (removeError) {
        setBusy(false)
        setError({ key: 'deleteAccount.error.photoRemove', params: { detail: removeError.message } })
        return
      }
    }

    const { error: rpcError } = await supabase.rpc('delete_my_account')
    if (rpcError) {
      setBusy(false)
      setError({ key: 'deleteAccount.error.failed', params: { detail: rpcError.message } })
      return
    }

    await supabase.auth.signOut()
    window.alert(t('deleteAccount.done'))
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'var(--overlay-strong)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem',
      }}
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)', borderRadius: 16, padding: '1.5rem',
          width: 'min(460px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-modal)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.6rem', fontSize: '1.1rem', color: 'var(--danger-strong)' }}>
          {t('deleteAccount.title')}
        </h3>
        <p style={{ margin: '0 0 0.8rem', fontSize: '0.9rem', color: 'var(--text-strong)', lineHeight: 1.5 }}>
          {t('deleteAccount.intro.before')}<strong>{t('deleteAccount.intro.strong')}</strong>{t('deleteAccount.intro.after')}
        </p>
        <ul style={{ margin: '0 0 0.8rem', paddingLeft: '1.2rem', fontSize: '0.88rem', color: 'var(--text-strong)', lineHeight: 1.6 }}>
          <li>{t('deleteAccount.item.account')}</li>
          <li>{t('deleteAccount.item.calendars')}</li>
          <li>{t('deleteAccount.item.shares')}</li>
        </ul>
        <p
          style={{
            margin: '0 0 1rem', padding: '0.6rem 0.8rem', borderRadius: 10,
            background: 'var(--danger-bg)', color: 'var(--danger-strong)', fontSize: '0.85rem', lineHeight: 1.5,
          }}
        >
          {t('deleteAccount.warning')}
        </p>

        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          {t('deleteAccount.confirmLabel', { word: confirmWord })}
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          disabled={busy}
          placeholder={confirmWord}
          style={{
            width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10, fontSize: '0.9rem',
            border: '1px solid var(--border)', outline: 'none', marginBottom: '1rem',
          }}
        />

        {error && (
          <p style={{ margin: '0 0 1rem', color: 'var(--danger)', fontSize: '0.85rem', wordBreak: 'break-word' }}>{noticeText(error, t)}</p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleDelete}
            disabled={!ready || busy}
            style={{
              background: 'var(--danger-solid)', color: 'var(--on-accent)', border: 'none', borderRadius: 10,
              padding: '0.65rem 1.2rem', fontSize: '0.88rem', fontWeight: 700,
              opacity: !ready || busy ? 0.5 : 1,
            }}
          >
            {busy ? t('deleteAccount.busy') : t('deleteAccount.confirm')}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'transparent', color: 'var(--text-body)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '0.65rem 1.2rem', fontSize: '0.88rem', fontWeight: 600,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
