import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface FeedSettingsProps {
  calendarId: string
}

interface Feed {
  id: string
  url: string
  label: string
  color: string
}

interface PreviewEvent {
  title: string
  date: string
  start: string | null
  end: string | null
  location: string
}

interface Preview {
  eventCount: number
  earliest: string | null
  latest: string | null
  recurring: number
  upcoming: PreviewEvent[]
}

const COLOR_OPTIONS = ['#7c3aed', '#2563eb', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#475569']

const REASONS: Record<string, string> = {
  bad_url: "Cette adresse n'est pas valide : elle doit commencer par https://.",
  redirect: "Le serveur redirige vers une autre adresse, ce qui n'est pas pris en charge.",
  http_error: "Le serveur a refusé la demande. L'adresse a peut-être expiré : régénérez-la depuis le site de votre école.",
  not_ics: "Cette adresse ne renvoie pas un calendrier au format iCalendar.",
  too_large: 'Le fichier est trop volumineux.',
  timeout: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.',
  network_error: 'Le serveur est injoignable pour le moment.',
  unauthorized: 'Votre session a expiré. Reconnectez-vous.',
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  fontSize: '0.9rem',
  outline: 'none',
  width: '100%',
  background: 'white',
  color: '#0f172a',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#0f172a',
  display: 'block',
  marginBottom: 4,
}

function formatDay(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export default function FeedSettings({ calendarId }: FeedSettingsProps) {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [loading, setLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [label, setLabel] = useState('Emploi du temps')
  const [color, setColor] = useState(COLOR_OPTIONS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('calendar_feeds')
      .select('id, url, label, color')
      .eq('calendar_id', calendarId)
      .maybeSingle()
    setFeed((data as Feed | null) ?? null)
    if (data) {
      setLabel(data.label)
      setColor(data.color)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [calendarId])

  const checkUrl = async (url: string): Promise<Preview | null> => {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setError(REASONS.unauthorized)
      return null
    }

    let res: Response
    try {
      res = await fetch('/api/feed/check', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ url }),
      })
    } catch {
      setError('Le programme ne répond pas. Réessayez dans un instant.')
      return null
    }

    const data = await res.json().catch(() => null)
    if (!data || !data.ok) {
      setError(REASONS[data?.reason as string] ?? 'Impossible de lire cette adresse.')
      return null
    }
    return data as Preview
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPreview(null)
    setBusy(true)

    const url = urlInput.trim()
    let result: Preview | null = null
    if (url) {
      result = await checkUrl(url)
      if (!result) {
        setBusy(false)
        return
      }
    }

    const payload = { label: label.trim() || 'Emploi du temps', color, ...(url ? { url } : {}) }
    const { error: dbError } = feed
      ? await supabase.from('calendar_feeds').update(payload).eq('id', feed.id)
      : await supabase.from('calendar_feeds').insert({ calendar_id: calendarId, ...payload })

    setBusy(false)
    if (dbError) {
      setError(dbError.message)
      return
    }

    setPreview(result)
    setUrlInput('')
    await load()
  }

  const handleRemove = async () => {
    if (!feed) return
    const confirmed = window.confirm(
      'Retirer l’emploi du temps de ce calendrier ? Les cours disparaîtront pour vous et pour les personnes invitées.'
    )
    if (!confirmed) return
    const { error: dbError } = await supabase.from('calendar_feeds').delete().eq('id', feed.id)
    if (dbError) {
      setError(dbError.message)
      return
    }
    setFeed(null)
    setPreview(null)
    setLabel('Emploi du temps')
    setColor(COLOR_OPTIONS[0])
  }

  if (loading) return null

  return (
    <section
      className="no-print"
      style={{
        background: 'white', borderRadius: 16, padding: '1.25rem',
        boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)', marginBottom: '1.5rem', maxWidth: 560,
      }}
    >
      <h3 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#0f172a' }}>Emploi du temps en ligne</h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#64748b' }}>
        Importez le lien iCalendar de votre école : les cours restent à jour automatiquement.
        L'adresse n'est visible que par vous, les personnes invitées voient les cours sans pouvoir la lire.
      </p>

      {feed && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
            background: '#f8fafc', borderRadius: 10, padding: '0.6rem 0.8rem', marginBottom: '1rem',
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 4, background: feed.color, flexShrink: 0 }} />
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{feed.label}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Source : {hostOf(feed.url)}</div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            style={{
              background: 'transparent', border: '1px solid #fecaca', color: '#dc2626',
              borderRadius: 8, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 600,
            }}
          >
            Retirer
          </button>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div>
          <label style={labelStyle}>{feed ? "Nouvelle adresse (laissez vide pour garder l'actuelle)" : 'Adresse du flux iCalendar'}</label>
          <input
            type="password"
            autoComplete="off"
            placeholder="https://..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            required={!feed}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={labelStyle}>Nom</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Couleur</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', background: c, border: 'none',
                    outline: color === c ? '2px solid #0f172a' : 'none', outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={busy}
            style={{
              background: 'var(--gradient-main)', color: 'white', border: 'none',
              borderRadius: 10, padding: '0.65rem 1.2rem', fontSize: '0.88rem', fontWeight: 700,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Vérification...' : feed ? 'Enregistrer' : 'Tester et enregistrer'}
          </button>
        </div>
      </form>

      {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0.8rem 0 0' }}>{error}</p>}

      {preview && (
        <div style={{ marginTop: '1rem', background: '#eff6ff', borderRadius: 10, padding: '0.8rem 1rem' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e3a8a', marginBottom: '0.4rem' }}>
            Flux enregistré : {preview.eventCount} cours trouvés
            {preview.earliest && preview.latest
              ? `, du ${formatDay(preview.earliest)} au ${formatDay(preview.latest)}`
              : ''}
          </div>
          {preview.upcoming.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: '#334155' }}>
              {preview.upcoming.map((ev, i) => (
                <li key={i}>
                  {formatDay(ev.date)}
                  {ev.start ? ` ${ev.start}` : ''} — {ev.title}
                  {ev.location ? ` (${ev.location})` : ''}
                </li>
              ))}
            </ul>
          )}
          {preview.recurring > 0 && (
            <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#92400e' }}>
              {preview.recurring} événement(s) utilisent une règle de répétition, non prise en charge pour l'instant.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
