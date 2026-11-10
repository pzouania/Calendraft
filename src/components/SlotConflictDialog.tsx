import { useEffect, useRef } from 'react'
import { useI18n } from '../hooks/useI18n'
import type { SlotBlocker, SlotConflict } from '../lib/slotLimit'

interface SlotConflictDialogProps {
  conflict: SlotConflict
  // Nom de l'événement qu'on essaie d'enregistrer.
  eventName: string
  // Suppression ou nouvelle tentative d'enregistrement en cours.
  busy: boolean
  error: string | null
  onDeleteDay: (blocker: SlotBlocker) => void
  onDeleteEvent: (blocker: SlotBlocker) => void
  onCancel: () => void
}

const smallButton: React.CSSProperties = {
  borderRadius: 8,
  padding: '0.45rem 0.8rem',
  minHeight: 36,
  fontSize: '0.82rem',
  fontWeight: 600,
  background: 'transparent',
}

export default function SlotConflictDialog({
  conflict, eventName, busy, error, onDeleteDay, onDeleteEvent, onCancel,
}: SlotConflictDialogProps) {
  const { t, formatDate } = useI18n()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const name = eventName.trim() || t('slotDialog.thisEvent')
  const longDate = (date: string) => formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const shortDate = (date: string) => formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  // La date est mise en gras au milieu de la phrase : on coupe le texte traduit à l'endroit de la date.
  const [occupiedBefore, occupiedAfter] = t('slotDialog.occupied', { date: '\u0001', count: conflict.blockers.length }).split('\u0001')
  const { blockers } = conflict
  const importedCount = blockers.filter((b) => b.imported).length
  // Supprimer un événement du calendrier ne sert à rien si trois événements importés (ou plus) occupent déjà le créneau.
  const canFix = blockers.some((b) => !b.imported) && importedCount < 3

  // Le focus passe dans la boîte à l'ouverture et revient où il était à la fermeture.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cardRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  // Garde le clavier (Tab) dans la boîte.
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !cardRef.current) return
    const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'))
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === cardRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'var(--overlay-strong)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem',
      }}
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="slot-dialog-title"
        aria-describedby="slot-dialog-text"
        tabIndex={-1}
        onKeyDown={trapTab}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--surface)', borderRadius: 16, padding: '1.5rem',
          width: 'min(520px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-modal)', outline: 'none',
        }}
      >
        <h3 id="slot-dialog-title" style={{ margin: '0 0 0.6rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          {t('slotDialog.title')}
        </h3>

        <div id="slot-dialog-text">
          <p style={{ margin: '0 0 0.7rem', fontSize: '0.9rem', color: 'var(--text-strong)', lineHeight: 1.5 }}>
            {t('slotDialog.rule')}
            {conflict.date && blockers.length > 0 && (
              <>
                {' '}{occupiedBefore}<strong>{longDate(conflict.date)}</strong>{occupiedAfter}
              </>
            )}
            {importedCount > 0 && <> {t('slotDialog.importedCount')}</>}
          </p>
          <p style={{ margin: '0 0 0.9rem', fontSize: '0.9rem', color: 'var(--text-strong)', lineHeight: 1.5 }}>
            {canFix
              ? importedCount > 0
                ? t('slotDialog.fix.imported', { name })
                : t('slotDialog.fix.plain', { name })
              : blockers.length > 0
                ? t('slotDialog.cantFix.imported', { name })
                : t('slotDialog.cantFix.plain', { name })}
          </p>
        </div>

        {blockers.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '0 0 0.9rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {blockers.map((b) => (
              <li
                key={b.period_id}
                style={{
                  background: 'var(--surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 12,
                  padding: '0.75rem 0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, backgroundColor: b.color, flexShrink: 0, marginTop: 3 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{b.name}</strong>
                    {b.imported && (
                      <span
                        style={{
                          marginLeft: 8, padding: '1px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap',
                          background: 'var(--surface-tint)', border: '1px solid var(--tint-border)', color: 'var(--tint-text)',
                        }}
                      >
                        {t('common.imported')}
                      </span>
                    )}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      {shortDate(b.date)}
                      {b.start && b.end && t('event.timeRange', { start: b.start, end: b.end })}
                      {b.recurring && t('slotDialog.recurring')}
                    </div>
                  </div>
                </div>
                {canFix && !b.imported && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {b.recurring && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDeleteDay(b)}
                        aria-label={t('slotDialog.deleteDayAria', { name: b.name, date: shortDate(b.date) })}
                        style={{ ...smallButton, border: '1px solid var(--tint-border)', color: 'var(--accent-link)', opacity: busy ? 0.6 : 1 }}
                      >
                        {t('slotDialog.deleteDay')}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDeleteEvent(b)}
                      aria-label={t('slotDialog.deleteEventAria', { name: b.name })}
                      style={{ ...smallButton, border: '1px solid var(--danger-border)', color: 'var(--danger)', opacity: busy ? 0.6 : 1 }}
                    >
                      {b.recurring ? t('slotDialog.deleteEventAll') : t('slotDialog.deleteEvent')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {conflict.dates > 1 && canFix && (
          <p
            style={{
              margin: '0 0 0.9rem', padding: '0.6rem 0.8rem', borderRadius: 10, fontSize: '0.82rem', lineHeight: 1.5,
              background: 'var(--surface-tint)', border: '1px solid var(--tint-border)', color: 'var(--tint-text)',
            }}
          >
            {importedCount > 0
              ? t('slotDialog.dates.imported', { count: conflict.dates })
              : t('slotDialog.dates.plain', { count: conflict.dates })}
          </p>
        )}

        {canFix && (
          <p style={{ margin: '0 0 0.9rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {t('slotDialog.autoSave', { name })}
          </p>
        )}

        {busy && (
          <p role="status" style={{ margin: '0 0 0.9rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-link)' }}>
            {t('common.moment')}
          </p>
        )}
        {error && (
          <p role="alert" style={{ margin: '0 0 0.9rem', color: 'var(--danger)', fontSize: '0.85rem', wordBreak: 'break-word' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          style={{
            width: '100%', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '0.7rem 1.3rem', fontSize: '0.9rem', fontWeight: 600, opacity: busy ? 0.6 : 1,
          }}
        >
          {canFix ? t('slotDialog.cancelFix') : blockers.length > 0 ? t('slotDialog.backToForm') : t('common.close')}
        </button>
      </div>
    </div>
  )
}
