import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface DeleteAccountModalProps {
  user: User
  onClose: () => void
}

const CONFIRM_WORD = 'SUPPRIMER'

export default function DeleteAccountModal({ user, onClose }: DeleteAccountModalProps) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = typed.trim().toUpperCase() === CONFIRM_WORD

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
      setError('Impossible de vérifier votre photo de profil : ' + listError.message)
      return
    }

    if (files && files.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('avatars')
        .remove(files.map((f) => `${user.id}/${f.name}`))
      if (removeError) {
        setBusy(false)
        setError('Impossible de supprimer votre photo de profil : ' + removeError.message)
        return
      }
    }

    const { error: rpcError } = await supabase.rpc('delete_my_account')
    if (rpcError) {
      setBusy(false)
      setError('La suppression a échoué : ' + rpcError.message)
      return
    }

    await supabase.auth.signOut()
    window.alert('Votre compte a été supprimé.')
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem',
      }}
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        style={{
          backgroundColor: 'white', borderRadius: 16, padding: '1.5rem',
          width: 'min(460px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.6rem', fontSize: '1.1rem', color: '#991b1b' }}>
          Supprimer mon compte
        </h3>
        <p style={{ margin: '0 0 0.8rem', fontSize: '0.9rem', color: '#334155', lineHeight: 1.5 }}>
          Cette action est <strong>définitive</strong> et ne peut pas être annulée. Seront effacés :
        </p>
        <ul style={{ margin: '0 0 0.8rem', paddingLeft: '1.2rem', fontSize: '0.88rem', color: '#334155', lineHeight: 1.6 }}>
          <li>votre compte et votre photo de profil ;</li>
          <li>tous les calendriers que vous avez créés, avec leurs événements et l'emploi du temps importé ;</li>
          <li>vos liens de partage et les accès que vous aviez donnés.</li>
        </ul>
        <p
          style={{
            margin: '0 0 1rem', padding: '0.6rem 0.8rem', borderRadius: 10,
            background: '#fef2f2', color: '#991b1b', fontSize: '0.85rem', lineHeight: 1.5,
          }}
        >
          Les personnes avec qui vous partagez vos calendriers les perdront aussi. Pensez à les exporter en PDF
          avant de continuer. Les calendriers que d'autres ont partagés avec vous ne sont pas touchés.
        </p>

        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
          Pour confirmer, tapez {CONFIRM_WORD}
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          disabled={busy}
          placeholder={CONFIRM_WORD}
          style={{
            width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10, fontSize: '0.9rem',
            border: '1px solid #e2e8f0', outline: 'none', marginBottom: '1rem',
          }}
        />

        {error && (
          <p style={{ margin: '0 0 1rem', color: '#dc2626', fontSize: '0.85rem', wordBreak: 'break-word' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleDelete}
            disabled={!ready || busy}
            style={{
              background: '#dc2626', color: 'white', border: 'none', borderRadius: 10,
              padding: '0.65rem 1.2rem', fontSize: '0.88rem', fontWeight: 700,
              opacity: !ready || busy ? 0.5 : 1,
            }}
          >
            {busy ? 'Suppression...' : 'Supprimer définitivement'}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'transparent', color: '#475569', border: '1px solid #e2e8f0',
              borderRadius: 10, padding: '0.65rem 1.2rem', fontSize: '0.88rem', fontWeight: 600,
            }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
