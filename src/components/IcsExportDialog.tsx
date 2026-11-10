import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { ICS_MAX_EVENTS, buildAllIcsEvents, buildIcsFile, dayString, exceptionsByPeriod, icsFileName, rollingWindow } from '../lib/icsExport'
import { fetchImportedEvents, type ImportedFeed } from '../lib/icsFeed'
import { createIcsLink, deleteIcsLink, fetchIcsLink, fetchIcsLinkHolidays, fetchIcsReady, icsUrl, updateIcsLinkHolidays, webcalUrl } from '../lib/icsLink'
import { snapshotLabel } from '../lib/partialShare'
import { holidaysBetween, type SchoolZone } from '../lib/schoolHolidays'
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
  // Zone de vacances scolaires du calendrier : le fichier et le lien peuvent contenir les vacances (absente : rien à proposer).
  schoolZone?: SchoolZone | null
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

export default function IcsExportDialog({
  calendarId, calendarName, calendarColor, periods, exceptions, yearLabel, yearFrom, yearTo, canManageLink, schoolZone = null, loadImported, onClose,
}: IcsExportDialogProps) {
  const { t, lang, locale, formatDate } = useI18n()
  // Nombre écrit selon la langue (5 000 / 5,000 / 5.000) ; « count » (nombre brut) sert au choix du singulier ou du pluriel.
  const num = (n: number) => n.toLocaleString(locale)
  const eventsText = (n: number) => t('ics.events', { count: n, num: num(n) })
  const holidaysText = (n: number) => t('ics.holidayPeriods', { count: n, num: num(n) })
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
  // Vacances scolaires dans le fichier (cochées d'office quand le calendrier a une zone) et dans le lien de synchronisation
  // (réglage enregistré côté serveur ; « unsupported » : le serveur ne le propose pas encore, on ne montre rien).
  const [fileHolidays, setFileHolidays] = useState(true)
  const [linkHolidays, setLinkHolidays] = useState<boolean | 'loading' | 'unsupported'>('loading')
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

  useEffect(() => {
    if (!canManageLink || link.state !== 'ready' || !schoolZone) return
    let alive = true
    setLinkHolidays('loading')
    fetchIcsLinkHolidays(calendarId).then((result) => {
      if (alive) setLinkHolidays(result.ok ? (result.value ?? true) : 'unsupported')
    })
    return () => {
      alive = false
    }
  }, [calendarId, canManageLink, link.state, schoolZone])

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
    const all = buildAllIcsEvents(periods, exceptionsByPeriod(exceptions), importedEvents, span.from, span.to, lang)
    return { total: all.length, imported: all.filter((e) => e.imported).length }
  }, [periods, exceptions, importedEvents, span, lang])
  const eventCount = counts.total
  const holidayTotal = useMemo(
    () => (fileHolidays && schoolZone ? holidaysBetween(schoolZone, span.from, span.to).length : 0),
    [fileHolidays, schoolZone, span],
  )
  const holidayText = holidaysText(holidayTotal)
  const loadingImported = imported.state === 'loading'
  // Un emploi du temps en ligne est relié au calendrier (lu, ou injoignable pour le moment) : le lien de synchronisation le contient.
  const hasTimetable = imported.state === 'ok' || imported.state === 'error'

  const doDownload = () => {
    if (loadingImported) return
    const file = buildIcsFile({ name: calendarName, color: calendarColor }, periods, exceptions, span, {
      stamp: new Date(), feed: importedEvents, holidayZone: fileHolidays ? schoolZone : null, lang,
    })
    if (file.eventCount === 0 && file.holidayCount === 0) {
      setDownloadNotice({ tone: 'warn', text: t('ics.notice.empty') })
      return
    }
    download(file.text, icsFileName(calendarName))
    const events = file.eventCount === 0 ? '' : eventsText(file.eventCount)
    const importedPart = file.importedCount > 0 ? t('ics.part.withImported', { num: num(file.importedCount) }) : ''
    const holidays =
      file.holidayCount > 0
        ? events === '' ? holidaysText(file.holidayCount) : t('ics.part.withHolidays', { holidays: holidaysText(file.holidayCount) })
        : ''
    if (file.truncated) {
      setDownloadNotice({ tone: 'warn', text: t('ics.notice.truncated', { events, holidays }) })
    } else if (imported.state === 'error') {
      setDownloadNotice({ tone: 'warn', text: t('ics.notice.noFeed', { events, holidays }) })
    } else {
      setDownloadNotice({ tone: 'ok', text: t('ics.notice.ok', { events, imported: importedPart, holidays }) })
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

  const toggleLinkHolidays = async (next: boolean) => {
    if (busy || typeof linkHolidays !== 'boolean') return
    const previous = linkHolidays
    setLinkHolidays(next)
    setBusy(true)
    setLinkError(null)
    const result = await updateIcsLinkHolidays(calendarId, next)
    setBusy(false)
    if (result.ok) {
      setLinkHolidays(result.value ?? next)
    } else {
      setLinkHolidays(previous)
      setLinkError(result.message)
    }
  }

  const copyLink = async () => {
    if (link.state !== 'ready') return
    const url = icsUrl(link.token, lang)
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
    { id: 'upcoming', title: t('ics.range.upcoming.title'), hint: t('ics.range.upcoming.hint') },
    { id: 'year', title: t('ics.range.year.title', { year: yearLabel }), hint: t('ics.range.year.hint') },
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
            {t('ics.title')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.close')}
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
            <h4 id="ics-file-title" style={sectionTitle}>{t('ics.file.title')}</h4>
            <p style={hint}>{t('ics.file.hint')}</p>
            <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
              <legend style={{ padding: 0, marginBottom: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('ics.range.legend')}
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
            {schoolZone && (
              <label
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.55rem 0.75rem', borderRadius: 10,
                  background: 'var(--surface-faint)', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--text-primary)',
                }}
              >
                <input
                  type="checkbox" data-testid="ics-file-holidays" checked={fileHolidays} style={{ marginTop: 3 }}
                  onChange={(e) => {
                    setFileHolidays(e.target.checked)
                    setDownloadNotice(null)
                  }}
                />
                <span>
                  <strong>{t('ics.holidays.file.title', { zone: schoolZone })}</strong>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {t('ics.holidays.file.hint')}
                  </span>
                </span>
              </label>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <button
                type="button" data-testid="ics-download" onClick={doDownload} disabled={(eventCount === 0 && holidayTotal === 0) || loadingImported}
                style={{ ...primary, opacity: (eventCount === 0 && holidayTotal === 0) || loadingImported ? 0.5 : 1 }}
              >
                {t('ics.download')}
              </button>
              <span data-testid="ics-count" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {loadingImported
                  ? t('ics.count.loadingFeed')
                  : eventCount === 0
                    ? holidayTotal > 0 ? holidayText : t('ics.count.none')
                    : eventCount > ICS_MAX_EVENTS
                      ? `${eventsText(eventCount)}${t('ics.part.max', { max: num(ICS_MAX_EVENTS) })}${holidayTotal > 0 ? t('ics.part.withHolidays', { holidays: holidayText }) : ''}`
                      : `${eventsText(eventCount)}${counts.imported > 0 ? t('ics.part.withImported', { num: num(counts.imported) }) : ''}${holidayTotal > 0 ? t('ics.part.withHolidays', { holidays: holidayText }) : ''}`}
              </span>
            </div>
            {imported.state === 'error' && (
              <div
                role="status" data-testid="ics-feed-error"
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.5rem 0.75rem', borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.82rem' }}
              >
                <span style={{ flex: '1 1 14rem' }}>{t('ics.feed.error')}</span>
                <button type="button" data-testid="ics-feed-retry" onClick={() => setImportedTry((n) => n + 1)} style={{ ...secondary, padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                  {t('common.retry')}
                </button>
              </div>
            )}
            {imported.state === 'ok' && imported.staleAt && (
              <p
                role="status" data-testid="ics-feed-stale"
                style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.82rem' }}
              >
                {snapshotLabel(imported.staleAt, formatDate)
                  ? t('ics.feed.staleAt', { date: snapshotLabel(imported.staleAt, formatDate) })
                  : t('ics.feed.stale')}
              </p>
            )}
            {imported.state === 'ok' && imported.recurring > 0 && (
              <p style={hint} data-testid="ics-feed-recurring">
                {t('ics.feed.recurring', { count: imported.recurring, num: num(imported.recurring) })}
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
              <h4 id="ics-sync-title" style={sectionTitle}>{t('ics.sync.title')}</h4>
              <p style={hint}>{t('ics.sync.hint')}</p>
              {hasTimetable && (
                <p style={hint} data-testid="ics-sync-feed">{t('ics.sync.feed')}</p>
              )}

              {ready === false && (
                <p
                  role="status"
                  data-testid="ics-not-ready"
                  style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: 10, fontSize: '0.8rem', background: 'var(--warning-bg)', color: 'var(--warning-text)' }}
                >
                  {t('ics.sync.notReady')}
                </p>
              )}

              {link.state === 'loading' && <p style={hint}>{t('ics.loading')}</p>}

              {link.state === 'error' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <p role="alert" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--danger)' }}>{link.message}</p>
                  <button type="button" onClick={loadLink} style={secondary}>{t('common.retry')}</button>
                </div>
              )}

              {link.state === 'none' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <button type="button" data-testid="ics-create" onClick={() => runLink('create')} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>
                    {busy ? t('ics.creating') : t('ics.create')}
                  </button>
                </div>
              )}

              {link.state === 'ready' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('ics.link.label')}
                    <input
                      ref={linkFieldRef}
                      data-testid="ics-link"
                      readOnly
                      value={icsUrl(link.token, lang)}
                      onFocus={(e) => e.currentTarget.select()}
                      style={{
                        width: '100%', padding: '0.6rem 0.7rem', borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--input-bg, var(--surface))', color: 'var(--text-primary)', fontSize: '0.82rem', minWidth: 0,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', boxSizing: 'border-box',
                      }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" data-testid="ics-copy" onClick={copyLink} style={primary}>{t('ics.copy')}</button>
                    <a
                      href={webcalUrl(link.token, lang)}
                      data-testid="ics-subscribe"
                      style={{ ...secondary, textDecoration: 'none', display: 'inline-block' }}
                    >
                      {t('ics.subscribe')}
                    </a>
                    {copied === 'ok' && <span role="status" style={{ fontSize: '0.8rem', color: 'var(--accent-text)' }}>{t('ics.copied')}</span>}
                    {copied === 'fail' && <span role="status" style={{ fontSize: '0.8rem', color: 'var(--warning-text)' }}>{t('ics.copyFail')}</span>}
                  </div>

                  {schoolZone && linkHolidays !== 'unsupported' && (
                    <label
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.55rem 0.75rem', borderRadius: 10,
                        background: 'var(--surface-faint)', cursor: typeof linkHolidays === 'boolean' && !busy ? 'pointer' : 'default',
                        fontSize: '0.85rem', color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="checkbox" data-testid="ics-link-holidays" style={{ marginTop: 3 }}
                        checked={linkHolidays === true || linkHolidays === 'loading'}
                        disabled={busy || typeof linkHolidays !== 'boolean'}
                        onChange={(e) => toggleLinkHolidays(e.target.checked)}
                      />
                      <span>
                        <strong>{t('ics.holidays.link.title', { zone: schoolZone })}</strong>
                        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {t('ics.holidays.link.hint')}
                        </span>
                      </span>
                    </label>
                  )}

                  <p style={hint}>
                    <strong style={{ color: 'var(--text-primary)' }}>{t('ics.keep.lead')}</strong>{' '}
                    {t(hasTimetable ? 'ics.keep.bodyTimetable' : 'ics.keep.body')}
                  </p>

                  {confirm === null && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" data-testid="ics-regenerate" onClick={() => setConfirm('regenerate')} disabled={busy} style={secondary}>
                        {t('ics.regenerate')}
                      </button>
                      <button type="button" data-testid="ics-delete" onClick={() => setConfirm('delete')} disabled={busy} style={danger}>
                        {t('common.disable')}
                      </button>
                    </div>
                  )}
                  {confirm !== null && (
                    <div
                      role="group"
                      aria-label={t('ics.confirm.aria')}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.7rem 0.8rem', borderRadius: 10, background: 'var(--surface-faint)' }}
                    >
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {t(confirm === 'regenerate' ? 'ics.confirm.regenerate' : 'ics.confirm.delete')}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button" data-testid="ics-confirm" disabled={busy}
                          onClick={() => runLink(confirm === 'regenerate' ? 'regenerate' : 'delete')}
                          style={confirm === 'delete' ? danger : primary}
                        >
                          {t(confirm === 'regenerate' ? 'ics.confirm.yesReplace' : 'ics.confirm.yesDisable')}
                        </button>
                        <button type="button" data-testid="ics-cancel" onClick={() => setConfirm(null)} disabled={busy} style={secondary}>{t('common.cancel')}</button>
                      </div>
                    </div>
                  )}

                  <details style={{ fontSize: '0.82rem', color: 'var(--text-body)' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--accent-link)' }}>{t('ics.help.title')}</summary>
                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', lineHeight: 1.45 }}>
                      <li>
                        <strong>{t('ics.help.google.name')}</strong>{t('ics.help.google.text')}
                      </li>
                      <li><strong>{t('ics.help.apple.name')}</strong>{t('ics.help.apple.text')}</li>
                      <li><strong>Outlook</strong>{t('ics.help.outlook.text')}</li>
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
