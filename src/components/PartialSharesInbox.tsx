import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useI18n } from '../hooks/useI18n'
import { dateRangeLabel, longDay, type PartialShareIn } from '../lib/partialShare'
import Icon from './icons'

interface PartialSharesInboxProps {
  onOpen: (id: string) => void
}

// Tableau de bord : jours et événements que d'autres personnes ont partagés avec l'adresse du compte.
// N'affiche rien tant qu'il n'y en a pas (ou si le partage n'est pas encore activé sur le serveur).
export default function PartialSharesInbox({ onOpen }: PartialSharesInboxProps) {
  const { formatDate } = useI18n()
  const [shares, setShares] = useState<PartialShareIn[]>([])

  useEffect(() => {
    let cancelled = false
    supabase.rpc('list_partial_shares_with_me').then(({ data, error }: { data: unknown; error: unknown }) => {
      if (cancelled || error) return
      setShares(Array.isArray(data) ? (data as PartialShareIn[]) : [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (shares.length === 0) return null

  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ margin: '0 0 0.8rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        Jours et événements partagés avec moi
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.8rem' }}>
        {shares.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            style={{
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.7rem', width: '100%',
              background: 'var(--surface)', border: 'none', borderRadius: 14, padding: '0.9rem',
              boxShadow: 'var(--shadow-md)', cursor: 'pointer', minWidth: 0,
            }}
          >
            <span
              style={{
                width: 36, height: 36, borderRadius: 10, background: s.calendar.color || 'var(--blue-main)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name={s.calendar.icon || 'calendar'} size={18} color="white" />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                {s.scope === 'day' ? longDay(s.date, formatDate) : s.event_name}
              </span>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                {s.scope === 'day' ? s.calendar.name : `${dateRangeLabel(s.date, s.last_date, formatDate)} · ${s.calendar.name}`}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
