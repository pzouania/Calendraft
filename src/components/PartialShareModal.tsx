import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useI18n } from '../hooks/useI18n'
import { longDay, partialShareError, type PartialScope, type Translate } from '../lib/partialShare'
import PartialSharesList, { useOwnerPartialShares } from './PartialSharesList'
import type { Occurrence } from '../types'

interface PartialShareModalProps {
  calendarId: string
  date: string
  occurrences: Occurrence[]
  onClose: () => void
}

interface EventOption {
  // Identifiant de l'option : l'événement du calendrier (periodId) ou « feed:<identifiant> » pour un événement importé.
  key: string
  periodId: string | null
  feedUid: string | null
  imported: boolean
  name: string
  color: string
  detail: string
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

function detailOf(occ: Occurrence, t: Translate): string {
  if (!occ.startTime || !occ.endTime) return t('event.allDay')
  const start = occ.startTime.slice(0, 5)
  const end = occ.endTime.slice(0, 5)
  if (occ.segment === 'end') return t('partial.detail.fromPrevious', { end })
  if (occ.segment === 'start') return t('partial.detail.toNext', { start, end })
  return `${start} – ${end}`
}

// Fenêtre ouverte depuis le détail d'un jour (propriétaire seulement) : partager le jour entier ou un seul événement,
// par email (la personne le retrouve dans son tableau de bord) ou par lien secret. Toujours en lecture seule.
export default function PartialShareModal({ calendarId, date, occurrences, onClose }: PartialShareModalProps) {
  const { t, formatDate } = useI18n()
  const { shares, loading, error: listError, reload } = useOwnerPartialShares(calendarId)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<string>('day')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  // name : nom de l'événement partagé, ou null quand c'est tout le jour (le texte du courriel est composé à l'affichage).
  const [invited, setInvited] = useState<{ email: string; name: string | null } | null>(null)
  // Journée entière : inclure aussi les événements importés d'un emploi du temps en ligne (coché par défaut).
  const [includeImported, setIncludeImported] = useState(true)

  const options = useMemo<EventOption[]>(() => {
    const seen = new Map<string, EventOption>()
    for (const occ of occurrences) {
      const imported = !!occ.readOnly
      if (imported && !occ.feedUid) continue
      const key = imported ? `feed:${occ.feedUid}` : occ.periodId
      if (seen.has(key)) continue
      seen.set(key, {
        key, periodId: imported ? null : occ.periodId, feedUid: imported ? occ.feedUid ?? null : null, imported,
        name: occ.name, color: occ.color, detail: detailOf(occ, t),
      })
    }
    return [...seen.values()]
  }, [occurrences, t])
  const ownOptions = options.filter((o) => !o.imported)
  // Nombre d'événements importés de ce jour (un événement qui passe minuit compte pour un).
  const importedCount = useMemo(() => {
    const keys = new Set<string>()
    for (const occ of occurrences) if (occ.readOnly) keys.add(occ.feedUid ?? `${occ.name}|${occ.startTime}|${occ.endTime}`)
    return keys.size
  }, [occurrences])
  const hasImported = importedCount > 0
  // Sans événement du calendrier ce jour-là, la journée n'a de sens qu'avec les événements importés.
  const includeFeed = hasImported && (ownOptions.length === 0 || includeImported)
  const dayTitle = longDay(date, formatDate)
  const targetOption = options.find((o) => o.key === target)
  const dayCount = ownOptions.length + (includeFeed ? importedCount : 0)

  // Le clavier (et les lecteurs d'écran) arrivent directement dans la fenêtre à son ouverture.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const scope: PartialScope = target === 'day' ? 'day' : 'occurrence'

  const create = async (recipient: string | null) => {
    const picked = scope === 'occurrence' ? targetOption : undefined
    const args: Record<string, unknown> = {
      p_calendar: calendarId,
      p_scope: scope,
      p_date: date,
      p_period: picked && !picked.imported ? picked.periodId : null,
      p_email: recipient,
    }
    // Les paramètres des événements importés ne sont envoyés que s'ils servent.
    if (scope === 'day' && includeFeed) args.p_include_feed = true
    if (picked?.imported) {
      args.p_feed_uid = picked.feedUid
      args.p_feed_title = picked.name
    }
    const { data, error: err } = await supabase.rpc('create_partial_share', args)
    return { data: data as { id: string; token: string | null; existing: boolean } | null, err }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setInvited(null)
    const clean = email.trim().toLowerCase()
    if (!EMAIL_RE.test(clean)) {
      setError(t('share.error.invalidEmail'))
      return
    }
    setBusy(true)
    const { err } = await create(clean)
    setBusy(false)
    if (err) {
      setError(partialShareError(err))
      return
    }
    setEmail('')
    setInvited({ email: clean, name: targetOption ? targetOption.name : null })
    reload()
  }

  const handleLink = async () => {
    setError(null)
    setInfo(null)
    setInvited(null)
    setBusy(true)
    const { data, err } = await create(null)
    setBusy(false)
    if (err) {
      setError(partialShareError(err))
      return
    }
    setInfo(data?.existing ? t('partial.info.existing') : t('partial.info.created'))
    reload()
  }

  const mailtoHref = invited
    ? `mailto:${invited.email}?subject=${encodeURIComponent(
        invited.name === null
          ? t('partial.mail.subjectDay', { day: dayTitle })
          : t('partial.mail.subjectEvent', { name: invited.name, day: dayTitle })
      )}&body=${encodeURIComponent(
        `${t('share.mail.hello')}\n\n${
          invited.name === null
            ? t('partial.mail.lineDay', { day: dayTitle })
            : t('partial.mail.lineEvent', { name: invited.name, day: dayTitle })
        }\n` + `${t('share.mail.connect', { origin: window.location.origin })}\n`
      )}`
    : ''

  // Phrase avec un lien au milieu : le texte traduit contient {link}, remplacé ici par le lien.
  const [savedBefore, savedAfter = ''] = t('partial.email.saved', { email: invited?.email ?? '', link: '\u0001' }).split('\u0001')

  // Partages qui concernent ce jour (le jour lui-même, ou un événement dont l'occurrence couvre ce jour).
  const dayShares = shares.filter((s) => s.date <= date && date <= (s.last_date ?? s.date))

  const nothing = options.length === 0 && !hasImported

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'var(--overlay)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('common.share')}
        style={{
          backgroundColor: 'var(--surface)', borderRadius: 16, width: 'min(520px, 94vw)',
          maxHeight: '88vh', overflowY: 'auto', boxShadow: 'var(--shadow-modal)', outline: 'none',
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
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{t('partial.title')}</h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{dayTitle}</div>
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
          {nothing ? (
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {t('partial.nothing')}
            </p>
          ) : (
            <>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
                <legend style={{ ...sectionTitle, padding: 0, fontWeight: 700 }}>{t('partial.what')}</legend>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.55rem 0.7rem', borderRadius: 10,
                      background: target === 'day' ? 'var(--surface-tint)' : 'var(--surface-faint)',
                      borderStyle: 'solid', borderWidth: 1, borderColor: target === 'day' ? 'var(--tint-border)' : 'transparent', cursor: 'pointer',
                    }}
                  >
                    <input type="radio" name="partial-target" checked={target === 'day'} onChange={() => setTarget('day')} style={{ marginTop: 3 }} />
                    <span>
                      <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('partial.whole')}</span>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {t('partial.dayCount', { count: dayCount })}
                      </span>
                    </span>
                  </label>
                  {target === 'day' && hasImported && ownOptions.length > 0 && (
                    <label
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.1rem 0.7rem 0.3rem 2rem',
                        fontSize: '0.82rem', color: 'var(--text-body)', cursor: 'pointer',
                      }}
                    >
                      <input type="checkbox" checked={includeImported} onChange={(e) => setIncludeImported(e.target.checked)} style={{ marginTop: 3 }} />
                      <span>
                        {t('partial.includeImported', { count: importedCount })}
                      </span>
                    </label>
                  )}
                  {options.map((o) => (
                    <label
                      key={o.key}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.55rem 0.7rem', borderRadius: 10,
                        background: target === o.key ? 'var(--surface-tint)' : 'var(--surface-faint)',
                        borderStyle: 'solid', borderWidth: '1px 1px 1px 4px',
                        borderTopColor: target === o.key ? 'var(--tint-border)' : 'transparent',
                        borderRightColor: target === o.key ? 'var(--tint-border)' : 'transparent',
                        borderBottomColor: target === o.key ? 'var(--tint-border)' : 'transparent',
                        borderLeftColor: o.color, cursor: 'pointer',
                      }}
                    >
                      <input type="radio" name="partial-target" checked={target === o.key} onChange={() => setTarget(o.key)} style={{ marginTop: 3 }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{o.name}</span>
                        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {o.detail} · {o.imported ? t('partial.kind.imported') : t('partial.kind.occurrence')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {(targetOption?.imported || (target === 'day' && includeFeed)) && (
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {t('partial.feedNote')}
                  </p>
                )}
              </fieldset>

              <section>
                <h4 style={sectionTitle}>{t('partial.email.title')}</h4>
                <form onSubmit={handleEmail} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="email"
                    placeholder={t('share.invite.placeholder')}
                    aria-label={t('share.emailAria')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}
                  />
                  <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: '0 0 auto' }}>
                    {t('common.share')}
                  </button>
                </form>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {t('partial.email.help')}
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
                <h4 style={sectionTitle}>{t('partial.link.title')}</h4>
                <p style={{ margin: '0 0 0.7rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {t('partial.link.help')}
                </p>
                <button onClick={handleLink} disabled={busy} style={ghostBtn}>
                  {t('share.link.create')}
                </button>
                {info && (
                  <div
                    style={{
                      marginTop: '0.7rem', padding: '0.6rem 0.8rem', borderRadius: 10,
                      background: 'var(--surface-tint)', color: 'var(--tint-text)', fontSize: '0.82rem',
                    }}
                  >
                    {info}
                  </div>
                )}
              </section>
            </>
          )}

          {error && (
            <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem', wordBreak: 'break-word' }}>{error}</p>
          )}

          <section>
            <h4 style={sectionTitle}>{t('partial.already.title')}</h4>
            {loading ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
            ) : listError ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--danger)', wordBreak: 'break-word' }}>{listError}</p>
            ) : dayShares.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('partial.already.empty')}</p>
            ) : (
              <PartialSharesList shares={dayShares} onRemoved={reload} onError={setError} />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
