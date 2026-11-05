import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useI18n } from '../hooks/useI18n'
import {
  dateRangeLabel, fetchSharedFeed, itemTimeLabel, longDay, partialShareError, sortItems, type PartialItem, type PartialPayload,
} from '../lib/partialShare'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import Icon from './icons'

interface PartialShareViewProps {
  // Lien secret ouvert depuis /j/<identifiant> (sans compte)…
  token?: string
  // …ou partage reçu par email, ouvert depuis le tableau de bord.
  id?: string
  onBack?: () => void
}

type Status = 'loading' | 'ready' | 'invalid' | 'error'

const goHome = () => {
  window.location.href = '/'
}

// Page en lecture seule d'un jour ou d'une occurrence d'événement partagé.
export default function PartialShareView({ token, id, onBack }: PartialShareViewProps) {
  const { t, formatDate } = useI18n()
  const [data, setData] = useState<PartialPayload | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  // Événements importés (emploi du temps en ligne) : lus à part, en direct.
  const [feedItems, setFeedItems] = useState<PartialItem[]>([])
  const [feedState, setFeedState] = useState<'idle' | 'loading' | 'ok' | 'unavailable'>('idle')
  const [feedTry, setFeedTry] = useState(0)

  useEffect(() => {
    if (!token) return
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    const referrer = document.createElement('meta')
    referrer.name = 'referrer'
    referrer.content = 'no-referrer'
    document.head.append(robots, referrer)
    return () => {
      robots.remove()
      referrer.remove()
    }
  }, [token])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const request = supabase.rpc(token ? 'get_partial_share_by_token' : 'get_partial_share', token ? { p_token: token } : { p_id: id })
    request.then(({ data: payload, error }: { data: unknown; error: unknown }) => {
      if (cancelled) return
      if (error) {
        setStatus('error')
        return
      }
      if (!payload) {
        setStatus('invalid')
        return
      }
      setData(payload as PartialPayload)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token, id])

  const withFeed = !!data?.include_feed
  useEffect(() => {
    if (!withFeed) {
      setFeedItems([])
      setFeedState('idle')
      return
    }
    let cancelled = false
    setFeedState('loading')
    fetchSharedFeed(token ? { token } : { id: id ?? '' }).then((result) => {
      if (cancelled) return
      setFeedItems(result.items)
      setFeedState(result.status)
    })
    return () => {
      cancelled = true
    }
  }, [withFeed, token, id, feedTry])

  const allItems = useMemo(() => [...(data?.items ?? []), ...feedItems], [data, feedItems])

  const days = useMemo(() => {
    const byDay = new Map<string, PartialItem[]>()
    for (const item of sortItems(allItems)) {
      const list = byDay.get(item.date) ?? []
      list.push(item)
      byDay.set(item.date, list)
    }
    return [...byDay.entries()]
  }, [allItems])

  const handleRemove = async () => {
    if (!id) return
    if (!window.confirm('Retirer ce partage de votre liste ? Vous n’y aurez plus accès.')) return
    setRemoving(true)
    setRemoveError(null)
    const { error } = await supabase.rpc('delete_partial_share', { p_id: id })
    setRemoving(false)
    if (error) {
      setRemoveError(partialShareError(error))
      return
    }
    onBack?.()
  }

  const header = (title: string, readOnlyBadge: boolean) => (
    <header
      className="no-print"
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
        <div className="header-logo" style={{ background: 'white', borderRadius: 10, padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Logo height={32} />
        </div>
        <span style={{ color: 'white', fontSize: '1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        {readOnlyBadge && (
          <span
            style={{
              background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 999,
              padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 600,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Lecture seule
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
        <ThemeToggle />
        <button
          onClick={onBack ?? goHome}
          style={{
            background: 'var(--header-btn-bg)', color: 'var(--header-btn-text)', border: 'none', boxShadow: 'inset 0 0 0 1px var(--header-btn-ring)',
            borderRadius: 999, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0,
          }}
        >
          {onBack ? t('common.back') : 'Ouvrir Calendraft'}
        </button>
      </div>
    </header>
  )

  if (status === 'loading') {
    return <p style={{ padding: '2rem', color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
  }

  if (status !== 'ready' || !data) {
    return (
      <div style={{ minHeight: '100vh' }}>
        {header('Calendraft', false)}
        <main style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1.5rem' }}>
          <div
            style={{
              background: 'var(--surface)', borderRadius: 16, padding: '2rem', textAlign: 'center',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <h2 style={{ margin: '0 0 0.6rem', color: 'var(--text-primary)', fontSize: '1.2rem' }}>
              {status === 'invalid' ? (token ? 'Ce lien n’est plus valide' : 'Ce partage n’existe plus') : 'Impossible de charger ce partage'}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {status === 'invalid'
                ? 'Le propriétaire a peut-être arrêté le partage. Demandez-lui un nouveau lien.'
                : 'Vérifiez votre connexion et réessayez dans un instant.'}
            </p>
          </div>
        </main>
      </div>
    )
  }

  const isDay = data.scope === 'day'
  const title = isDay ? longDay(data.date, formatDate) : data.event_name ?? 'Événement'
  // Un événement importé peut couvrir plusieurs jours (début le soir, fin le lendemain) : la période suit ce qui est affiché.
  const shownDates = withFeed && !isDay ? allItems.map((i) => i.date).sort() : []
  const subtitle = isDay
    ? 'Programme de la journée'
    : shownDates.length > 0
      ? dateRangeLabel(shownDates[0], shownDates[shownDates.length - 1], formatDate)
      : dateRangeLabel(data.date, data.last_date, formatDate)
  const color = data.calendar.color ?? '#2563eb'

  return (
    <div style={{ minHeight: '100vh' }}>
      {header(data.calendar.name, true)}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem' }}>
        <div
          style={{
            background: 'var(--surface)', borderRadius: 16, padding: '1.25rem 1.25rem 1.4rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.1rem' }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: 12, background: color, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name={data.calendar.icon ?? 'calendar'} size={22} color="white" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{title}</h1>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                {subtitle} · {data.calendar.name}
              </div>
            </div>
          </div>

          {feedState === 'unavailable' && (
            <div
              role="status"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '1rem',
                padding: '0.6rem 0.8rem', borderRadius: 10, background: 'var(--surface-faint)',
                color: 'var(--text-body)', fontSize: '0.82rem',
              }}
            >
              <span style={{ flex: '1 1 200px' }}>
                Les événements importés de l’emploi du temps en ligne n’ont pas pu être chargés pour le moment.
              </span>
              <button
                onClick={() => setFeedTry((n) => n + 1)}
                style={{
                  background: 'var(--surface-tint)', color: 'var(--accent-text)', border: '1px solid var(--tint-border)',
                  borderRadius: 8, padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 600,
                }}
              >
                Réessayer
              </button>
            </div>
          )}

          {days.length === 0 && feedState === 'loading' ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Chargement des événements importés...</p>
          ) : days.length === 0 && feedState === 'unavailable' ? null : days.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Ce partage ne contient plus d’événement : il a probablement été modifié ou supprimé depuis.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {days.map(([day, items]) => (
                <section key={day}>
                  {!isDay && (
                    <h2 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-body)' }}>
                      {longDay(day, formatDate)}
                    </h2>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {items.map((item, i) => (
                      <div
                        key={`${day}-${i}`}
                        style={{
                          backgroundColor: 'var(--surface)',
                          backgroundImage: `linear-gradient(${item.color}1f, ${item.color}1f)`,
                          borderLeft: `4px solid ${item.color}`, borderRadius: 10,
                          padding: '0.6rem 0.8rem',
                        }}
                      >
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{item.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-body)', wordBreak: 'break-word' }}>
                          {itemTimeLabel(item, t)}
                          {item.location ? ` · ${item.location}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {feedState === 'loading' && (
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Chargement des événements importés...</p>
              )}
            </div>
          )}
        </div>

        <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
          Vue en lecture seule : le propriétaire partage ici uniquement {isDay ? 'ce jour' : 'cet événement'}.
          {withFeed && ' Les événements importés sont lus en direct dans son emploi du temps en ligne.'}
        </p>

        {id && (
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button
              onClick={handleRemove}
              disabled={removing}
              style={{
                background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                borderRadius: 10, padding: '0.55rem 1.1rem', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              Retirer de ma liste
            </button>
            {removeError && <p role="alert" style={{ margin: '0.6rem 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>{removeError}</p>}
          </div>
        )}
      </main>
    </div>
  )
}
