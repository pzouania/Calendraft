import { useEffect, useState } from 'react'
import type { TranslationKey } from '../i18n'
import { useI18n } from '../hooks/useI18n'
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

// Motif de refus renvoyé par le serveur -> texte du dictionnaire (un motif inconnu donne un message général).
const REASON_KEYS: Record<string, TranslationKey> = {
  bad_url: 'feed.reason.bad_url',
  redirect: 'feed.reason.redirect',
  http_error: 'feed.reason.http_error',
  not_ics: 'feed.reason.not_ics',
  too_large: 'feed.reason.too_large',
  timeout: 'feed.reason.timeout',
  network_error: 'feed.reason.network_error',
  unauthorized: 'feed.reason.unauthorized',
}

function reasonKey(reason: unknown): TranslationKey {
  return typeof reason === 'string' && Object.prototype.hasOwnProperty.call(REASON_KEYS, reason)
    ? REASON_KEYS[reason]
    : 'feed.reason.unknown'
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  borderRadius: 10,
  border: '1px solid var(--border)',
  fontSize: '0.9rem',
  outline: 'none',
  width: '100%',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  display: 'block',
  marginBottom: 4,
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export default function FeedSettings({ calendarId }: FeedSettingsProps) {
  const { t, formatDate } = useI18n()
  const formatDay = (date: string) => formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })
  const [feed, setFeed] = useState<Feed | null>(null)
  const [loading, setLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [label, setLabel] = useState(() => t('feed.defaultLabel'))
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
      setError(t('feed.reason.unauthorized'))
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
      setError(t('feed.error.noResponse'))
      return null
    }

    const data = await res.json().catch(() => null)
    if (!data || !data.ok) {
      setError(t(reasonKey(data?.reason)))
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

    const payload = { label: label.trim() || t('feed.defaultLabel'), color, ...(url ? { url } : {}) }
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
    const confirmed = window.confirm(t('feed.confirmRemove'))
    if (!confirmed) return
    const { error: dbError } = await supabase.from('calendar_feeds').delete().eq('id', feed.id)
    if (dbError) {
      setError(dbError.message)
      return
    }
    setFeed(null)
    setPreview(null)
    setLabel(t('feed.defaultLabel'))
    setColor(COLOR_OPTIONS[0])
  }

  if (loading) return null

  return (
    <section
      className="no-print"
      style={{
        background: 'var(--surface)', borderRadius: 16, padding: '1.25rem',
        boxShadow: 'var(--shadow-md)', marginBottom: '1.5rem', maxWidth: 560,
      }}
    >
      <h3 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: 'var(--text-primary)' }}>{t('feed.title')}</h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        {t('feed.intro')}
      </p>

      {feed && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
            background: 'var(--surface-faint)', borderRadius: 10, padding: '0.6rem 0.8rem', marginBottom: '1rem',
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 4, background: feed.color, flexShrink: 0 }} />
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{feed.label}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('feed.source', { host: hostOf(feed.url) })}</div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            style={{
              background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger)',
              borderRadius: 8, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 600,
            }}
          >
            {t('feed.remove')}
          </button>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div>
          <label style={labelStyle}>{feed ? t('feed.urlNew') : t('feed.urlLabel')}</label>
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
            <label style={labelStyle}>{t('common.name')}</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('common.color')}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', background: c, border: 'none',
                    outline: color === c ? '2px solid var(--text-primary)' : 'none', outlineOffset: 2,
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
              background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none',
              borderRadius: 10, padding: '0.65rem 1.2rem', fontSize: '0.88rem', fontWeight: 700,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? t('feed.checking') : feed ? t('common.save') : t('feed.testAndSave')}
          </button>
        </div>
      </form>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.8rem 0 0' }}>{error}</p>}

      {preview && (
        <div style={{ marginTop: '1rem', background: 'var(--surface-tint)', borderRadius: 10, padding: '0.8rem 1rem' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--tint-text)', marginBottom: '0.4rem' }}>
            {t('feed.saved', { count: preview.eventCount })}
            {preview.earliest && preview.latest
              ? t('feed.range', { from: formatDay(preview.earliest), to: formatDay(preview.latest) })
              : ''}
          </div>
          {preview.upcoming.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text-strong)' }}>
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
            <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--warning-text)' }}>
              {t('feed.recurring', { count: preview.recurring })}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
