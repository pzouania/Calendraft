import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useI18n } from '../hooks/useI18n'
import { describeShare, partialShareError, partialShareUrl, type PartialShareOut } from '../lib/partialShare'

// Liste des partages d'un jour / d'un événement d'un calendrier (propriétaire seulement : le serveur renvoie une liste vide aux autres).
export function useOwnerPartialShares(calendarId: string) {
  const [shares, setShares] = useState<PartialShareOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('list_partial_shares', { p_calendar: calendarId })
    if (err) {
      setError(partialShareError(err))
      setShares([])
    } else {
      setError(null)
      setShares((data ?? []) as PartialShareOut[])
    }
    setLoading(false)
  }, [calendarId])

  useEffect(() => {
    reload()
  }, [reload])

  return { shares, loading, error, reload }
}

interface PartialSharesListProps {
  shares: PartialShareOut[]
  onRemoved: () => void
  onError: (message: string) => void
}

const inputStyle: React.CSSProperties = {
  padding: '0.35rem 0.6rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  fontSize: '0.75rem',
  outline: 'none',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
}

export default function PartialSharesList({ shares, onRemoved, onError }: PartialSharesListProps) {
  const { t, formatDate } = useI18n()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleRemove = async (share: PartialShareOut) => {
    const confirmed = window.confirm(
      share.token ? t('partialList.confirmDisable') : t('partialList.confirmRemove', { email: share.email ?? '' })
    )
    if (!confirmed) return
    setBusyId(share.id)
    const { error } = await supabase.rpc('delete_partial_share', { p_id: share.id })
    setBusyId(null)
    if (error) onError(partialShareError(error))
    onRemoved()
  }

  const handleCopy = async (share: PartialShareOut) => {
    if (!share.token) return
    try {
      await navigator.clipboard.writeText(partialShareUrl(share.token))
      setCopiedId(share.id)
      setTimeout(() => setCopiedId((id) => (id === share.id ? null : id)), 2000)
    } catch {
      onError(t('share.error.copy'))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {shares.map((s) => (
        <div
          key={s.id}
          style={{
            display: 'flex', flexDirection: 'column', gap: '0.4rem',
            padding: '0.55rem 0.7rem', borderRadius: 10, background: 'var(--surface-faint)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                {s.token ? t('partialList.secretLink') : s.email}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                {describeShare(s, formatDate, t)}
              </div>
            </div>
            {s.token && (
              <button
                onClick={() => handleCopy(s)}
                style={{
                  background: 'var(--surface-tint)', color: 'var(--accent-text)', border: '1px solid var(--tint-border)',
                  borderRadius: 8, padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: 600,
                }}
              >
                {copiedId === s.id ? t('common.copied') : t('partialList.copyLink')}
              </button>
            )}
            <button
              onClick={() => handleRemove(s)}
              disabled={busyId === s.id}
              title={s.token ? t('share.link.disable') : t('share.people.removeTitle')}
              style={{
                background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                borderRadius: 8, padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: 600,
              }}
            >
              {s.token ? t('common.disable') : t('share.people.remove')}
            </button>
          </div>
          {s.token && (
            <input
              readOnly
              aria-label={t('partialList.linkAria')}
              value={partialShareUrl(s.token)}
              onFocus={(e) => e.currentTarget.select()}
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
