import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { ICS_MAX_EVENTS, buildAllIcsEvents, buildIcsFile, dayString, exceptionsByPeriod, icsFileName, rollingWindow } from '../lib/icsExport'
import { fetchImportedEvents, type ImportedFeed } from '../lib/icsFeed'
import { createIcsLink, deleteIcsLink, fetchIcsLink, fetchIcsReady, icsUrl, webcalUrl } from '../lib/icsLink'
import { snapshotLabel } from '../lib/partialShare'
import type { Period, PeriodException } from '../types'

type Range = 'upcoming' | 'year'
type LinkView =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'none' }
  | { state: 'ready'; token: string }
type Confirm = 'regenerate' | 'delete' | null
// Emploi du temps en ligne : en cours de lecture, ou résultat (voir lib/icsFeed.ts).
type Imported = { state: 'loading' } | ImportedFeed

export interface IcsExportDialogProps {
  calendarId: string
  calendarName: string
  calendarColor: string
  periods: Period[]
  exceptions: PeriodException[]
  // Année affichée à l'écran (pour l'option « année affichée »), de son premier au dernier jour (AAAA-MM-JJ).
  yearLabel: string
  yearFrom: string
  yearTo: string
  // Le propriétaire d'un calendrier enregistré peut créer le lien de synchronisation.
  canManageLink: boolean
  // Calendrier enregistré : le serveur peut avoir un emploi du temps en ligne à ajouter au fichier (faux pour une page partagée
  // par lien, dont les données sont fixes).
  loadImported: boolean
  onClose: () => void
}

function download(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`

export default function IcsExportDialog({
  calendarId, calendarName, calendarColor, periods, exceptions, yearLabel, yearFrom, yearTo, canManageLink, loadImported, onClose,
}: IcsExportDialogProps) {
  const { formatDate } = useI18n()
  const dialogRef = useRef<HTMLDivElement>(null)
  const linkFieldRef = useRef<HTMLInputElement>(null)
  const [range, setRange] = useState<Range>('upcoming')
  const [downloadNotice, setDownloadNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [link, setLink] = useState<LinkView>(canManageLink ? { state: 'loading' } : { state: 'none' })
  const [ready, setReady] = useState<boolean | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const [imported, setImported] = useState<Imported>(loadImported ? { state: 'loading' } : { state: 'none' })
  const [importedTry, setImportedTry] = useState(0)
  // « À partir d'aujourd'hui » : fixé à l'ouverture, pour que le fichier et le nombre annoncé couvrent les mêmes jours.
  const todayWindow = useMemo(() => rollingWindow(dayString(new Date())), [])

  // Le focus passe dans la fenêtre à l'ouverture et revient où il était à la fermeture.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const loadLink = async () => {
    setLink({ state: 'loading' })
    const result = await fetchIcsLink(calendarId)
    setLink(result.ok ? (result.token ? { state: 'ready', token: result.token } : { state: 'none' }) : { state: 'error', message: result.message })
  }

  useEffect(() => {
    if (!canManageLink) return
    let alive = true
    fetchIcsLink(calendarId).then((result) => {
      if (!alive) return
      setLink(result.ok ? (result.token ? { state: 'ready', token: result.token } : { state: 'none' }) : { state: 'error', message: result.message })
    })
    fetchIcsReady().then((value) => {
      if (alive) setReady(value)
    })
    return () => {
      alive = false
    }
  }, [calendarId, canManageLink])

  // Emploi du temps en ligne : lu une fois pour les deux périodes proposées (la plus large des deux), puis découpé ici.
  useEffect(() => {
    if (!loadImported) return
    const controller = new AbortController()
    setImported({ state: 'loading' })
    const from = yearFrom < todayWindow.from ? yearFrom : todayWindow.from
    const to = yearTo > todayWindow.to ? yearTo : todayWindow.to
    fetchImportedEvents(calendarId, from, to, controller.signal).then((result) => {
      if (!controller.signal.aborted) setImported(result)
    })
    return () => controller.abort()
  }, [calendarId, loadImported, yearFrom, yearTo, todayWindow, importedTry])

  const span = useMemo(() => (range === 'upcoming' ? todayWindow : { from: yearFrom, to: yearTo }), [range, todayWindow, yearFrom, yearTo])
  const importedEvents = imported.state === 'ok' ? imported.events : undefined
  const counts = useMemo(() => {
    const all = buildAllIcsEvents(periods, exceptionsByPeriod(exceptions), importedEvents, span.from, span.to)
    return { total: all.length, imported: all.filter((e) => e.imported).length }
  }, [periods, exceptions, importedEvents, span])
  const eventCount = counts.total
  const loadingImported = imported.state === 'loading'
  // Un emploi du temps en ligne est relié au calendrier (lu, ou injoignable pour le moment) : le lien de synchronisation le contient.
  const hasTimetable = imported.state === 'ok' || imported.state === 'error'

  const doDownload = () => {
    if (loadingImported) return
    const file = buildIcsFile({ name: calendarName, color: calendarColor }, periods, exceptions, span, { stamp: new Date(), feed: importedEvents })
    if (file.eventCount === 0) {
      setDownloadNotice({ tone: 'warn', text: 'Aucun événement sur cette période : il n’y a rien à exporter.' })
      return
    }
    download(file.text, icsFileName(calendarName))
    const total = plural(file.eventCount, 'événement', 'événements')
    const withFeed = file.importedCount > 0 ? `, dont ${file.importedCount.toLocaleString('fr-FR')} de l’emploi du temps en ligne` : ''
    if (file.truncated) {
      setDownloadNotice({ tone: 'warn', text: `Fichier téléchargé, mais le calendrier est trop long : seuls les ${total} les plus proches sont dedans.` })
    } else if (imported.state === 'error') {
      setDownloadNotice({ tone: 'warn', text: `Fichier téléchargé : ${total}, sans l’emploi du temps en ligne (injoignable).` })
    } else {
      setDownloadNotice({ tone: 'ok', text: `Fichier téléchargé : ${total}${withFeed}.` })
    }
  }

  const runLink = async (action: 'create' | 'regenerate' | 'delete') => {
    if (busy) return
    setBusy(true)
    setLinkError(null)
    setCopied(null)
    setConfirm(null)
    if (action === 'delete') {
      const result = await deleteIcsLink(calendarId)
      if (result.ok) setLink({ state: 'none' })
      else setLinkError(result.message)
    } else {
      const result = await createIcsLink(calendarId, action === 'regenerate')
      if (result.ok && result.token) setLink({ state: 'ready', token: result.token })
      else if (!result.ok) setLinkError(result.message)
    }
    setBusy(false)
  }

  const copyLink = async () => {
    if (link.state !== 'ready') return
    const url = icsUrl(link.token)
    try {
      await navigator.clipboard.writeText(url)
      setCopied('ok')
    } catch {
      // Navigateur sans presse-papiers : on sélectionne le lien pour qu'il puisse être copié à la main.
      const field = linkFieldRef.current
      field?.focus()
      field?.select()
      let done = false
      try {
        done = document.execCommand('copy')
      } catch {
        done = false
      }
      setCopied(done ? 'ok' : 'fail')
    }
  }

  // Garde le clavier (Tab) dans la fenêtre.
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const items = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], summary'),
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const primary: React.CSSProperties = {
    background: 'var(--gradient-main)', color: 'var(--on-accent)', border: 'none', borderRadius: 10,
    padding: '0.6rem 1.1rem', fontSize: '0.88rem', fontWeight: 700,
  }
  const secondary: React.CSSProperties = {
    background: 'var(--surface-alt)', color: 'var(--text-body)', border: 'none', borderRadius: 10,
    padding: '0.6rem 1.1rem', fontSize: '0.88rem', fontWeight: 700,
  }
  const danger: React.CSSProperties = { ...secondary, color: 'var(--danger)' }
  const sectionTitle: React.CSSProperties = { margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }
  const hint: React.CSSProperties = { margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }

  const choices: { id: Range; title: string; hint: string }[] = [
    { id: 'upcoming', title: 'À partir d’aujourd’hui', hint: 'Les 3 derniers mois et les 2 prochaines années.' },
    { id: 'year', title: `L’année affichée (${yearLabel})`, hint: 'Seulement la période que vous regardez à l’écran.' },
  ]

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--overlay)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem',
      }}
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ics-export-title"
        onKeyDown={trapTab}
        style={{
          backgroundColor: 'var(--surface)', borderRadius: 16, width: 'min(500px, 94vw)', maxHeight: '88vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-modal)', outline: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: '1rem',
          }}
        >
          <h3 id="ics-export-title" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
            Exporter vers un agenda
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none', background: 'var(--surface-alt)',
              color: 'var(--text-body)', fontSize: '1.2rem', lineHeight: 1, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {/* ---- Fichier ---- */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }} aria-labelledby="ics-file-title">
            <h4 id="ics-file-title" style={sectionTitle}>Télécharger un fichier</h4>
            <p style={hint}>
              Le fichier .ics s’ouvre dans Google Agenda, Apple Calendrier, Outlook et la plupart des agendas. C’est une
              copie d’aujourd’hui : elle ne suit pas les changements faits ensuite.
            </p>
            <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
              <legend style={{ padding: 0, marginBottom: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Période
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {choices.map((c) => (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.55rem 0.75rem', borderRadius: 10,
                      background: range === c.id ? 'var(--surface-tint)' : 'var(--surface-faint)', borderStyle: 'solid', borderWidth: 1,
                      borderColor: range === c.id ? 'var(--tint-border)' : 'transparent', cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio" name="ics-range" value={c.id} checked={range === c.id} style={{ marginTop: 3 }}
                      onChange={() => {
                        setRange(c.id)
                        setDownloadNotice(null)
                      }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{c.title}</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{c.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <button
                type="button" data-testid="ics-download" onClick={doDownload} disabled={eventCount === 0 || loadingImported}
                style={{ ...primary, opacity: eventCount === 0 || loadingImported ? 0.5 : 1 }}
              >
                Télécharger le fichier (.ics)
              </button>
              <span data-testid="ics-count" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {loadingImported
                  ? 'Chargement de l’emploi du temps en ligne…'
                  : eventCount === 0
                    ? 'Aucun événement sur cette période.'
                    : eventCount > ICS_MAX_EVENTS
                      ? `${plural(eventCount, 'événement', 'événements')} (le fichier en contient ${ICS_MAX_EVENTS.toLocaleString('fr-FR')} au maximum)`
                      : `${plural(eventCount, 'événement', 'événements')}${counts.imported > 0 ? `, dont ${counts.imported.toLocaleString('fr-FR')} de l’emploi du temps en ligne` : ''}`}
              </span>
            </div>
            {imported.state === 'error' && (
              <div
                role="status" data-testid="ics-feed-error"
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.5rem 0.75rem', borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.82rem' }}
              >
                <span style={{ flex: '1 1 14rem' }}>
                  L’emploi du temps en ligne est injoignable pour le moment : le fichier ne contiendra que les événements de ce calendrier.
                </span>
                <button type="button" data-testid="ics-feed-retry" onClick={() => setImportedTry((n) => n + 1)} style={{ ...secondary, padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                  Réessayer
                </button>
              </div>
            )}
            {imported.state === 'ok' && imported.staleAt && (
              <p
                role="status" data-testid="ics-feed-stale"
                style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.82rem' }}
              >
                L’emploi du temps en ligne est injoignable : les événements importés viennent de la dernière copie enregistrée
                {snapshotLabel(imported.staleAt, formatDate) ? ` le ${snapshotLabel(imported.staleAt, formatDate)}` : ''}.
              </p>
            )}
            {imported.state === 'ok' && imported.recurring > 0 && (
              <p style={hint} data-testid="ics-feed-recurring">
                {imported.recurring > 1
                  ? `${imported.recurring.toLocaleString('fr-FR')} événements de l’emploi du temps en ligne se répètent : ils ne figurent qu’une fois dans le fichier, comme à l’écran.`
                  : 'Un événement de l’emploi du temps en ligne se répète : il ne figure qu’une fois dans le fichier, comme à l’écran.'}
              </p>
            )}
            {downloadNotice && (
              <p
                role="status"
                data-testid="ics-download-notice"
                style={{
                  margin: 0, padding: '0.5rem 0.75rem', borderRadius: 10, fontSize: '0.82rem',
                  background: downloadNotice.tone === 'ok' ? 'var(--surface-tint)' : 'var(--warning-bg)',
                  color: downloadNotice.tone === 'ok' ? 'var(--accent-text)' : 'var(--warning-text)',
                }}
              >
                {downloadNotice.text}
              </p>
            )}
          </section>

          {/* ---- Synchronisation ---- */}
          {canManageLink && (
            <section
              style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border-soft)' }}
              aria-labelledby="ics-sync-title"
            >
              <h4 id="ics-sync-title" style={sectionTitle}>Synchroniser automatiquement</h4>
              <p style={hint}>
                Abonnez votre agenda à ce calendrier : ce que vous changez dans Calendraft apparaît ensuite tout seul dans
                votre agenda.
              </p>
              {hasTimetable && (
                <p style={hint} data-testid="ics-sync-feed">
                  L’emploi du temps en ligne est aussi dans le lien. Il se met à jour quand vous ouvrez Calendraft ou cette
                  fenêtre (la dernière copie est gardée 30 jours).
                </p>
              )}

              {ready === false && (
                <p
                  role="status"
                  data-testid="ics-not-ready"
                  style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: 10, fontSize: '0.8rem', background: 'var(--warning-bg)', color: 'var(--warning-text)' }}
                >
                  La synchronisation n’est pas encore activée sur le serveur de Calendraft. Le fichier ci-dessus fonctionne déjà.
                </p>
              )}

              {link.state === 'loading' && <p style={hint}>Chargement…</p>}

              {link.state === 'error' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <p role="alert" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--danger)' }}>{link.message}</p>
                  <button type="button" onClick={loadLink} style={secondary}>Réessayer</button>
                </div>
              )}

              {link.state === 'none' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <button type="button" data-testid="ics-create" onClick={() => runLink('create')} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>
                    {busy ? 'Création…' : 'Créer un lien de synchronisation'}
                  </button>
                </div>
              )}

              {link.state === 'ready' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Lien de synchronisation
                    <input
                      ref={linkFieldRef}
                      data-testid="ics-link"
                      readOnly
                      value={icsUrl(link.token)}
                      onFocus={(e) => e.currentTarget.select()}
                      style={{
                        width: '100%', padding: '0.6rem 0.7rem', borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--input-bg, var(--surface))', color: 'var(--text-primary)', fontSize: '0.82rem', minWidth: 0,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', boxSizing: 'border-box',
                      }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" data-testid="ics-copy" onClick={copyLink} style={primary}>Copier le lien</button>
                    <a
                      href={webcalUrl(link.token)}
                      data-testid="ics-subscribe"
                      style={{ ...secondary, textDecoration: 'none', display: 'inline-block' }}
                    >
                      S’abonner (Apple, Outlook)
                    </a>
                    {copied === 'ok' && <span role="status" style={{ fontSize: '0.8rem', color: 'var(--accent-text)' }}>Lien copié.</span>}
                    {copied === 'fail' && <span role="status" style={{ fontSize: '0.8rem', color: 'var(--warning-text)' }}>Copie impossible : sélectionnez le lien et copiez-le.</span>}
                  </div>

                  <p style={hint}>
                    <strong style={{ color: 'var(--text-primary)' }}>Gardez ce lien pour vous :</strong> toute personne qui l’a peut voir ce calendrier
                    {hasTimetable ? ', emploi du temps en ligne compris' : ''}. S’il a été partagé par erreur, remplacez-le : l’ancien cessera de fonctionner.
                  </p>

                  {confirm === null && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" data-testid="ics-regenerate" onClick={() => setConfirm('regenerate')} disabled={busy} style={secondary}>
                        Remplacer le lien
                      </button>
                      <button type="button" data-testid="ics-delete" onClick={() => setConfirm('delete')} disabled={busy} style={danger}>
                        Désactiver
                      </button>
                    </div>
                  )}
                  {confirm !== null && (
                    <div
                      role="group"
                      aria-label="Confirmation"
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.7rem 0.8rem', borderRadius: 10, background: 'var(--surface-faint)' }}
                    >
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {confirm === 'regenerate'
                          ? 'Remplacer le lien ? Les agendas déjà abonnés ne recevront plus rien tant que vous ne leur donnez pas le nouveau lien.'
                          : 'Désactiver le lien ? Les agendas abonnés ne recevront plus rien. Vous pourrez en créer un nouveau.'}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button" data-testid="ics-confirm" disabled={busy}
                          onClick={() => runLink(confirm === 'regenerate' ? 'regenerate' : 'delete')}
                          style={confirm === 'delete' ? danger : primary}
                        >
                          {confirm === 'regenerate' ? 'Oui, remplacer' : 'Oui, désactiver'}
                        </button>
                        <button type="button" data-testid="ics-cancel" onClick={() => setConfirm(null)} disabled={busy} style={secondary}>Annuler</button>
                      </div>
                    </div>
                  )}

                  <details style={{ fontSize: '0.82rem', color: 'var(--text-body)' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--accent-link)' }}>Comment l’ajouter à mon agenda ?</summary>
                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', lineHeight: 1.45 }}>
                      <li>
                        <strong>Google Agenda</strong> (sur ordinateur) : « Autres agendas » (+) puis « À partir de l’URL », et collez le lien.
                        Google ne met à jour ces agendas que de temps en temps (jusqu’à 24 heures).
                      </li>
                      <li><strong>Apple Calendrier</strong> : touchez « S’abonner (Apple, Outlook) », ou Fichier puis « Nouvel abonnement à un calendrier » sur Mac.</li>
                      <li><strong>Outlook</strong> : « Ajouter un calendrier » puis « S’abonner à partir du web », et collez le lien.</li>
                    </ul>
                  </details>
                </div>
              )}

              {linkError && (
                <p role="alert" data-testid="ics-link-error" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--danger)' }}>
                  {linkError}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
