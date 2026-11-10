import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useI18n } from '../hooks/useI18n'
import PartialSharesList, { useOwnerPartialShares } from './PartialSharesList'

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
  const { t } = useI18n()
  const [shares, setShares] = useState<Share[]>([])
  const [link, setLink] = useState<ShareLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [error, setError] = useState<string | null>(null)
  const [invited, setInvited] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const partial = useOwnerPartialShares(calendarId)

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
      setError(t('share.error.invalidEmail'))
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
          ? t('share.error.duplicate')
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
    const confirmed = window.confirm(t('share.link.confirmDisable'))
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
      setError(t('share.error.copy'))
    }
  }

  const mailtoHref = invited
    ? `mailto:${invited}?subject=${encodeURIComponent(
        t('share.mail.subject', { name: calendarName })
      )}&body=${encodeURIComponent(
        `${t('share.mail.hello')}\n\n${t('share.mail.line', { name: calendarName })}\n` +
          `${t('share.mail.connect', { origin: window.location.origin })}\n`
      )}`
    : ''

  // Phrase avec un lien au milieu : le texte traduit contient {link}, remplacé ici par le lien.
  const [savedBefore, savedAfter = ''] = t('share.invite.saved', { email: invited ?? '', link: '\u0001' }).split('\u0001')

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
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{t('share.title')}</h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {calendarName}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
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
            <h4 style={sectionTitle}>{t('share.invite.title')}</h4>
            <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="email"
                placeholder={t('share.invite.placeholder')}
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
                <option value="viewer">{t('role.viewer')}</option>
                <option value="editor">{t('role.editor')}</option>
              </select>
              <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: '0 0 auto' }}>
                {t('share.invite.button')}
              </button>
            </form>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {t('share.invite.roleHelp')}
            </p>

            {invited && (
              <div
                style={{
                  marginTop: '0.7rem', padding: '0.6rem 0.8rem', borderRadius: 10,
                  background: 'var(--surface-tint)', color: 'var(--tint-text)', fontSize: '0.82rem',
                }}
              >
                {savedBefore}
                <a href={mailtoHref} style={{ color: 'var(--accent-link)', fontWeight: 600 }}>
                  {t('share.invite.notify')}
                </a>
                {savedAfter}
              </div>
            )}
          </section>

          <section>
            <h4 style={sectionTitle}>{t('share.people.title')}</h4>
            {loading ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
            ) : shares.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t('share.people.empty')}
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
                      <option value="viewer">{t('role.viewer')}</option>
                      <option value="editor">{t('role.editor')}</option>
                    </select>
                    <button
                      onClick={() => handleRemove(s.id)}
                      title={t('share.people.removeTitle')}
                      style={{
                        background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                        borderRadius: 8, padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: 600,
                      }}
                    >
                      {t('share.people.remove')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h4 style={sectionTitle}>{t('share.link.title')}</h4>
            {!link ? (
              <>
                <p style={{ margin: '0 0 0.7rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {t('share.link.intro')}
                </p>
                <button onClick={handleCreateLink} disabled={busy} style={primaryBtn}>
                  {t('share.link.create')}
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
                    {copied ? t('common.copied') : t('share.link.copy')}
                  </button>
                </div>
                <p style={{ margin: '0.6rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {t('share.link.warning')}
                </p>
                <button onClick={handleRemoveLink} style={ghostBtn}>
                  {t('share.link.disable')}
                </button>
              </>
            )}
          </section>

          {partial.shares.length > 0 && (
            <section>
              <h4 style={sectionTitle}>{t('share.partial.title')}</h4>
              <p style={{ margin: '0 0 0.7rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {t('share.partial.help')}
              </p>
              <PartialSharesList shares={partial.shares} onRemoved={partial.reload} onError={setError} />
            </section>
          )}

          {error && (
            <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem', wordBreak: 'break-word' }}>{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
