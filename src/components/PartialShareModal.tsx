import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useI18n } from '../hooks/useI18n'
import { longDay, partialShareError, type PartialScope } from '../lib/partialShare'
import PartialSharesList, { useOwnerPartialShares } from './PartialSharesList'
import type { Occurrence } from '../types'

interface PartialShareModalProps {
  calendarId: string
  date: string
  occurrences: Occurrence[]
  onClose: () => void
}

interface EventOption {
  periodId: string
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

function detailOf(occ: Occurrence): string {
  if (!occ.startTime || !occ.endTime) return 'Journée entière'
  const start = occ.startTime.slice(0, 5)
  const end = occ.endTime.slice(0, 5)
  if (occ.segment === 'end') return `suite de la veille, jusqu’à ${end}`
  if (occ.segment === 'start') return `à partir de ${start}, jusqu’au lendemain ${end}`
  return `${start} – ${end}`
}

// Fenêtre ouverte depuis le détail d'un jour (propriétaire seulement) : partager le jour entier ou un seul événement,
// par email (la personne le retrouve dans son tableau de bord) ou par lien secret. Toujours en lecture seule.
export default function PartialShareModal({ calendarId, date, occurrences, onClose }: PartialShareModalProps) {
  const { formatDate } = useI18n()
  const { shares, loading, error: listError, reload } = useOwnerPartialShares(calendarId)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<string>('day')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [invited, setInvited] = useState<{ email: string; label: string } | null>(null)

  const options = useMemo<EventOption[]>(() => {
    const seen = new Map<string, EventOption>()
    for (const occ of occurrences) {
      if (occ.readOnly || seen.has(occ.periodId)) continue
      seen.set(occ.periodId, { periodId: occ.periodId, name: occ.name, color: occ.color, detail: detailOf(occ) })
    }
    return [...seen.values()]
  }, [occurrences])
  const hasImported = occurrences.some((o) => o.readOnly)
  const dayTitle = longDay(date, formatDate)
  const targetOption = options.find((o) => o.periodId === target)
  const targetLabel = targetOption ? `« ${targetOption.name} »` : 'Tout le jour'

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
    const { data, error: err } = await supabase.rpc('create_partial_share', {
      p_calendar: calendarId,
      p_scope: scope,
      p_date: date,
      p_period: scope === 'occurrence' ? target : null,
      p_email: recipient,
    })
    return { data: data as { id: string; token: string | null; existing: boolean } | null, err }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setInvited(null)
    const clean = email.trim().toLowerCase()
    if (!EMAIL_RE.test(clean)) {
      setError('Saisissez une adresse email valide.')
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
    setInvited({ email: clean, label: targetLabel })
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
    setInfo(data?.existing ? 'Ce partage a déjà un lien : il est dans la liste ci-dessous.' : 'Lien créé : copiez-le depuis la liste ci-dessous.')
    reload()
  }

  const mailtoHref = invited
    ? `mailto:${invited.email}?subject=${encodeURIComponent(`Calendraft : ${invited.label} du ${dayTitle}`)}&body=${encodeURIComponent(
        `Bonjour,\n\nJe viens de partager avec vous ${invited.label === 'Tout le jour' ? 'ma journée' : invited.label} du ${dayTitle} sur Calendraft (lecture seule).\n` +
          `Connectez-vous avec cette adresse email (ou créez un compte) sur ${window.location.origin} ` +
          `pour le retrouver dans votre tableau de bord.\n`
      )}`
    : ''

  // Partages qui concernent ce jour (le jour lui-même, ou un événement dont l'occurrence couvre ce jour).
  const dayShares = shares.filter((s) => s.date <= date && date <= (s.last_date ?? s.date))

  const nothing = options.length === 0

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
        aria-label="Partager"
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
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Partager en lecture seule</h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{dayTitle}</div>
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
          {nothing ? (
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Ce jour ne contient aucun événement du calendrier à partager.
            </p>
          ) : (
            <>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
                <legend style={{ ...sectionTitle, padding: 0, fontWeight: 700 }}>Que partager ?</legend>
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
                      <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>Tout le jour</span>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {options.length === 1 ? '1 événement' : `${options.length} événements`} de ce jour
                      </span>
                    </span>
                  </label>
                  {options.map((o) => (
                    <label
                      key={o.periodId}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.55rem 0.7rem', borderRadius: 10,
                        background: target === o.periodId ? 'var(--surface-tint)' : 'var(--surface-faint)',
                        borderStyle: 'solid', borderWidth: '1px 1px 1px 4px',
                        borderTopColor: target === o.periodId ? 'var(--tint-border)' : 'transparent',
                        borderRightColor: target === o.periodId ? 'var(--tint-border)' : 'transparent',
                        borderBottomColor: target === o.periodId ? 'var(--tint-border)' : 'transparent',
                        borderLeftColor: o.color, cursor: 'pointer',
                      }}
                    >
                      <input type="radio" name="partial-target" checked={target === o.periodId} onChange={() => setTarget(o.periodId)} style={{ marginTop: 3 }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{o.name}</span>
                        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {o.detail} · seulement cette occurrence
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {hasImported && (
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Les événements importés d’un emploi du temps en ligne ne sont pas inclus dans un partage.
                  </p>
                )}
              </fieldset>

              <section>
                <h4 style={sectionTitle}>Envoyer à une adresse email</h4>
                <form onSubmit={handleEmail} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="email"
                    placeholder="prenom@exemple.fr"
                    aria-label="Adresse email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}
                  />
                  <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: '0 0 auto' }}>
                    Partager
                  </button>
                </form>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  La personne retrouvera ce partage dans son tableau de bord, en se connectant avec cette adresse. Elle ne voit que
                  ce que vous partagez ici, sans pouvoir rien modifier.
                </p>
                {invited && (
                  <div
                    style={{
                      marginTop: '0.7rem', padding: '0.6rem 0.8rem', borderRadius: 10,
                      background: 'var(--surface-tint)', color: 'var(--tint-text)', fontSize: '0.82rem',
                    }}
                  >
                    Partage enregistré pour {invited.email}. Calendraft n’envoie pas d’email :{' '}
                    <a href={mailtoHref} style={{ color: 'var(--accent-link)', fontWeight: 600 }}>
                      prévenir par email
                    </a>
                    .
                  </div>
                )}
              </section>

              <section>
                <h4 style={sectionTitle}>Ou créer un lien secret</h4>
                <p style={{ margin: '0 0 0.7rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Pour des personnes sans compte : toute personne qui possède le lien peut consulter ce partage, sans rien modifier.
                </p>
                <button onClick={handleLink} disabled={busy} style={ghostBtn}>
                  Créer un lien
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
            <h4 style={sectionTitle}>Déjà partagé pour ce jour</h4>
            {loading ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Chargement...</p>
            ) : listError ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--danger)', wordBreak: 'break-word' }}>{listError}</p>
            ) : dayShares.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Aucun partage pour ce jour.</p>
            ) : (
              <PartialSharesList shares={dayShares} onRemoved={reload} onError={setError} />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
