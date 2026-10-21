import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface ShareModalProps {
  calendarId: string
  calendarName: string
  onClose: () => void
}

type Role = 'viewer' | 'editor'

interface Share {
  id: string
  email: string
  role: Role
}

interface ShareLink {
  id: string
  token: string
}

const ROLE_LABELS: Record<Role, string> = { viewer: 'Lecteur', editor: 'Éditeur' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  borderRadius: 10,
  border: '1px solid var(--border)',
  fontSize: '0.9rem',
  outline: 'none',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
}

const primaryBtn: React.CSSProperties = {
  background: 'var(--gradient-main)',
  color: 'var(--on-accent)',
  border: 'none',
  borderRadius: 10,
  padding: '0.6rem 1.1rem',
  fontSize: '0.85rem',
  fontWeight: 700,
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-body)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '0.6rem 1.1rem',
  fontSize: '0.85rem',
  fontWeight: 600,
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  fontSize: '0.9rem',
  color: 'var(--text-primary)',
}

export default function ShareModal({ calendarId, calendarName, onClose }: ShareModalProps) {
  const [shares, setShares] = useState<Share[]>([])
  const [link, setLink] = useState<ShareLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [error, setError] = useState<string | null>(null)
  const [invited, setInvited] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    const [sharesRes, linkRes] = await Promise.all([
      supabase
        .from('calendar_shares')
        .select('id, email, role')
        .eq('calendar_id', calendarId)
        .order('created_at', { ascending: true }),
      supabase
        .from('calendar_links')
        .select('id, token')
        .eq('calendar_id', calendarId)
        .maybeSingle(),
    ])

    if (sharesRes.error) setError(sharesRes.error.message)
    else setShares((sharesRes.data ?? []) as Share[])

    if (linkRes.error) setError(linkRes.error.message)
    else setLink((linkRes.data as ShareLink | null) ?? null)

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [calendarId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInvited(null)

    const clean = email.trim().toLowerCase()
    if (!EMAIL_RE.test(clean)) {
      setError('Saisissez une adresse email valide.')
      return
    }

    setBusy(true)
    const { error } = await supabase
      .from('calendar_shares')
      .insert({ calendar_id: calendarId, email: clean, role })
    setBusy(false)

    if (error) {
      setError(
        error.code === '23505'
          ? 'Ce calendrier est déjà partagé avec cette adresse.'
          : error.message
      )
      return
    }

    setEmail('')
    setInvited(clean)
    load()
  }

  const handleRoleChange = async (id: string, newRole: Role) => {
    setError(null)
    const { error } = await supabase.from('calendar_shares').update({ role: newRole }).eq('id', id)
    if (error) setError(error.message)
    load()
  }

  const handleRemove = async (id: string) => {
    setError(null)
    const { error } = await supabase.from('calendar_shares').delete().eq('id', id)
    if (error) setError(error.message)
    load()
  }

  const handleCreateLink = async () => {
    setError(null)
    setBusy(true)
    const { error } = await supabase.from('calendar_links').insert({ calendar_id: calendarId })
    setBusy(false)
    if (error) setError(error.message)
    load()
  }

  const handleRemoveLink = async () => {
    if (!link) return
    const confirmed = window.confirm(
      'Désactiver le lien ? Toute personne qui l’a reçu n’y aura plus accès immédiatement.'
    )
    if (!confirmed) return
    setError(null)
    const { error } = await supabase.from('calendar_links').delete().eq('id', link.id)
    if (error) setError(error.message)
    load()
  }

  const linkUrl = link ? `${window.location.origin}/s/${link.token}` : ''

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copie impossible : sélectionnez le lien et copiez-le manuellement.')
    }
  }

  const mailtoHref = invited
    ? `mailto:${invited}?subject=${encodeURIComponent(
        `Calendrier « ${calendarName} » partagé avec vous`
      )}&body=${encodeURIComponent(
        `Bonjour,\n\nJe viens de partager le calendrier « ${calendarName} » avec vous sur Calendraft.\n` +
          `Connectez-vous avec cette adresse email (ou créez un compte) sur ${window.location.origin} ` +
          `pour le retrouver dans votre tableau de bord.\n`
      )}`
    : ''

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'var(--overlay)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)', borderRadius: 16, width: 'min(520px, 94vw)',
          maxHeight: '88vh', overflowY: 'auto', boxShadow: 'var(--shadow-modal)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2,
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Partager le calendrier</h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {calendarName}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-alt)', color: 'var(--text-body)', fontSize: '1.2rem', lineHeight: 1, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section>
            <h4 style={sectionTitle}>Inviter par email</h4>
            <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="email"
                placeholder="prenom@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                style={{ ...inputStyle, flex: '0 0 auto' }}
              >
                <option value="viewer">Lecteur</option>
                <option value="editor">Éditeur</option>
              </select>
              <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: '0 0 auto' }}>
                Inviter
              </button>
            </form>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Un lecteur consulte et exporte le calendrier. Un éditeur peut aussi ajouter des périodes
              et retirer des jours.
            </p>

            {invited && (
              <div
                style={{
                  marginTop: '0.7rem', padding: '0.6rem 0.8rem', borderRadius: 10,
                  background: 'var(--surface-tint)', color: 'var(--tint-text)', fontSize: '0.82rem',
                }}
              >
                Invitation enregistrée pour {invited}. Calendraft n’envoie pas d’email :{' '}
                <a href={mailtoHref} style={{ color: 'var(--accent-link)', fontWeight: 600 }}>
                  prévenir par email
                </a>
                .
              </div>
            )}
          </section>

          <section>
            <h4 style={sectionTitle}>Personnes ayant accès</h4>
            {loading ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Chargement...</p>
            ) : shares.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Aucun partage pour l’instant.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {shares.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                      padding: '0.5rem 0.7rem', borderRadius: 10, background: 'var(--surface-faint)',
                    }}
                  >
                    <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: '0.85rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {s.email}
                    </span>
                    <select
                      value={s.role}
                      onChange={(e) => handleRoleChange(s.id, e.target.value as Role)}
                      style={{ ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                    >
                      <option value="viewer">{ROLE_LABELS.viewer}</option>
                      <option value="editor">{ROLE_LABELS.editor}</option>
                    </select>
                    <button
                      onClick={() => handleRemove(s.id)}
                      title="Retirer l’accès"
                      style={{
                        background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                        borderRadius: 8, padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: 600,
                      }}
                    >
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h4 style={sectionTitle}>Lien de partage (lecture seule)</h4>
            {!link ? (
              <>
                <p style={{ margin: '0 0 0.7rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Créez un lien secret pour partager le calendrier avec des personnes sans compte.
                  Elles pourront le consulter, sans rien modifier.
                </p>
                <button onClick={handleCreateLink} disabled={busy} style={primaryBtn}>
                  Créer un lien
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    readOnly
                    value={linkUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ ...inputStyle, flex: '1 1 220px', minWidth: 0, fontSize: '0.8rem' }}
                  />
                  <button onClick={handleCopy} style={{ ...primaryBtn, flex: '0 0 auto' }}>
                    {copied ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <p style={{ margin: '0.6rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Toute personne qui possède ce lien peut consulter le calendrier. Désactivez-le pour
                  le rendre inutilisable immédiatement.
                </p>
                <button onClick={handleRemoveLink} style={ghostBtn}>
                  Désactiver le lien
                </button>
              </>
            )}
          </section>

          {error && (
            <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem', wordBreak: 'break-word' }}>{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
