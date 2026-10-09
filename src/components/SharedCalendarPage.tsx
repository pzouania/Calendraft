import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import YearCalendar from './YearCalendar'
import Logo from './Logo'
import type { Period, PeriodException, YearMode } from '../types'

interface SharedData {
  name: string
  icon: string | null
  color: string | null
  year_mode?: YearMode
  periods: Period[]
  exceptions: PeriodException[]
}

interface SharedCalendarPageProps {
  token: string
}

type Status = 'loading' | 'ready' | 'invalid' | 'error'

const goHome = () => {
  window.location.href = '/'
}

export default function SharedCalendarPage({ token }: SharedCalendarPageProps) {
  const [data, setData] = useState<SharedData | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_shared_calendar', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setStatus('error')
        return
      }
      if (!data) {
        setStatus('invalid')
        return
      }
      setData(data as SharedData)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const header = (title: string, readOnlyBadge: boolean) => (
    <header
      className="no-print"
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
        <div style={{ background: 'white', borderRadius: 10, padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
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
      <button
        onClick={goHome}
        style={{
          background: 'white', color: 'var(--blue-dark)', border: 'none',
          borderRadius: 999, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0,
        }}
      >
        Ouvrir Calendraft
      </button>
    </header>
  )

  if (status === 'loading') {
    return <p style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Chargement du calendrier...</p>
  }

  if (status !== 'ready' || !data) {
    return (
      <div style={{ minHeight: '100vh' }}>
        {header('Calendraft', false)}
        <main style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1.5rem' }}>
          <div
            style={{
              background: 'white', borderRadius: 16, padding: '2rem', textAlign: 'center',
              boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
            }}
          >
            <h2 style={{ margin: '0 0 0.6rem', color: 'var(--text-primary)', fontSize: '1.2rem' }}>
              {status === 'invalid' ? 'Ce lien n’est plus valide' : 'Impossible de charger le calendrier'}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {status === 'invalid'
                ? 'Le propriétaire a peut-être désactivé le partage. Demandez-lui un nouveau lien.'
                : 'Vérifiez votre connexion et réessayez dans un instant.'}
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {header(data.name, true)}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
        <YearCalendar
          calendarId=""
          calendarName={data.name}
          calendarIcon={data.icon ?? 'calendar'}
          calendarColor={data.color ?? '#2563eb'}
          canEdit={false}
          yearMode={data.year_mode === 'school' ? 'school' : 'calendar'}
          staticData={{ periods: data.periods, exceptions: data.exceptions }}
        />
      </main>
    </div>
  )
}
