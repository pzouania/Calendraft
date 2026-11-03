import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  cacheAcceptance,
  getTermsStatus,
  isAcceptanceCached,
  recordTermsAcceptance,
  takePendingTerms,
} from '../lib/terms'
import { useI18n } from '../hooks/useI18n'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import TermsConsent from './TermsConsent'

type Status = 'checking' | 'accepted' | 'needed'

interface TermsGateProps {
  userId: string
  children: ReactNode
}

// Affiche l'application seulement quand la personne connectée a accepté les conditions d'utilisation en vigueur.
// Sinon (compte créé avec Google ou GitHub, compte plus ancien, nouvelle version des conditions), un écran d'acceptation
// s'affiche d'abord. Si la vérification est impossible (réseau, table absente), l'application reste utilisable.
export default function TermsGate({ userId, children }: TermsGateProps) {
  const { t } = useI18n()
  const [status, setStatus] = useState<Status>(() => (isAcceptanceCached(userId) ? 'accepted' : 'checking'))
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAcceptanceCached(userId)) {
      setStatus('accepted')
      return
    }
    let cancelled = false
    setStatus('checking')

    const check = async () => {
      const found = await getTermsStatus(userId)
      if (cancelled) return
      if (found === 'accepted') {
        cacheAcceptance(userId)
        takePendingTerms()
        setStatus('accepted')
        return
      }
      if (found === 'unknown') {
        setStatus('accepted')
        return
      }
      // Case cochée sur l'écran d'inscription avant de partir chez Google ou GitHub : on l'enregistre sans redemander.
      if (takePendingTerms()) {
        const failure = await recordTermsAcceptance(userId)
        if (cancelled) return
        if (!failure) {
          cacheAcceptance(userId)
          setStatus('accepted')
          return
        }
      }
      setStatus('needed')
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [userId])

  const accept = async () => {
    if (!checked || saving) return
    setError(null)
    setSaving(true)
    const failure = await recordTermsAcceptance(userId)
    setSaving(false)
    if (failure) {
      setError(t('terms.gate.saveError', { message: failure }))
      return
    }
    cacheAcceptance(userId)
    setStatus('accepted')
  }

  if (status === 'accepted') return <>{children}</>
  if (status === 'checking') return <p style={{ padding: '2rem' }}>{t('common.loading')}</p>

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <ThemeToggle variant="floating" />
      <div
        style={{
          background: 'var(--surface)', borderRadius: 20, padding: '2rem 2rem 1.8rem', width: '100%', maxWidth: 440,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="logo-slot" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.2rem' }}>
          <Logo height={72} />
        </div>
        <h1 style={{ fontSize: '1.35rem', margin: '0 0 0.6rem', textAlign: 'center', color: 'var(--text-primary)' }}>
          {t('terms.gate.title')}
        </h1>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.92rem', lineHeight: 1.55, color: 'var(--text-strong)' }}>
          {t('terms.gate.intro')}
        </p>
        <p style={{ margin: '0 0 1.2rem', fontSize: '0.85rem' }}>
          <a href="/confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-link)', fontWeight: 600 }}>
            {t('terms.gate.privacy')}
          </a>
        </p>

        <TermsConsent checked={checked} onChange={setChecked} />

        {error && (
          <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.8rem 0 0', wordBreak: 'break-word' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={accept}
          disabled={!checked || saving}
          style={{
            width: '100%', marginTop: '1.2rem', padding: '0.8rem', borderRadius: 10, border: 'none',
            background: 'var(--gradient-main)', color: 'var(--on-accent)', fontWeight: 600, fontSize: '0.95rem',
            opacity: !checked || saving ? 0.5 : 1, cursor: !checked || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? t('common.saving') : t('terms.gate.continue')}
        </button>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          style={{
            display: 'block', margin: '0.9rem auto 0', padding: '0.4rem 0.8rem', border: 'none', background: 'transparent',
            color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline',
          }}
        >
          {t('common.signOut')}
        </button>
      </div>
    </div>
  )
}
