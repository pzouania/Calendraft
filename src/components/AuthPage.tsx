import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Logo from './Logo'
import Icon from './icons'

type Mode = 'login' | 'signup' | 'forgot'
type Provider = 'google' | 'github'

const ENABLED_PROVIDERS: Provider[] = ['github']

const PROVIDER_LABELS: Record<Provider, string> = {
  google: 'Google',
  github: 'GitHub',
}

const FEATURES = [
  { icon: 'users', title: 'Périodes récurrentes', desc: 'Garde alternée, plannings 3x8, horaires personnalisés — configurez une fois, répété automatiquement.' },
  { icon: 'calendar', title: 'Calendrier annuel', desc: 'Visualisez vos 12 mois en un coup d\'œil, avec une vue détaillée heure par heure.' },
  { icon: 'book', title: 'Export PDF', desc: 'Imprimez ou partagez votre calendrier en un clic, mis en page automatiquement.' },
]

function useIsWide() {
  const query = '(min-width: 861px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setWide(mql.matches)
    setWide(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return wide
}

function ProviderLogo({ provider }: { provider: Provider }) {
  if (provider === 'google') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="#0f172a"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  )
}

export default function AuthPage() {
  const isWide = useIsWide()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setError(null)
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Compte créé. Vous êtes connecté(e).')
    }

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) setError(error.message)
      else setMessage('Email de réinitialisation envoyé si ce compte existe.')
    }

    setLoading(false)
  }

  const handleOAuth = async (provider: Provider) => {
    setMessage(null)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) setError(error.message)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: '1 1 90px',
    padding: '0.6rem',
    border: 'none',
    borderRadius: 10,
    background: active ? 'var(--gradient-main)' : 'transparent',
    color: active ? 'white' : 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: '0.85rem',
  })

  const inputStyle: React.CSSProperties = {
    padding: '0.7rem 0.9rem',
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    fontSize: '0.95rem',
    outline: 'none',
  }

  const showOAuth = mode !== 'forgot' && ENABLED_PROVIDERS.length > 0

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexWrap: 'wrap',
      }}
    >
      {isWide && (
        <div
          style={{
            flex: '1 1 420px',
            minWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '3rem 4rem',
          }}
        >
          <h1 style={{ fontSize: '2.2rem', lineHeight: 1.15, margin: '0 0 1rem', maxWidth: 460, color: '#0f172a' }}>
            Vos calendriers personnalisés, enfin simples à créer.
          </h1>
          <p style={{ fontSize: '1.05rem', color: '#334155', maxWidth: 460, margin: '0 0 2rem' }}>
            Définissez vos périodes récurrentes une seule fois, Calendraft génère et met à jour tout le reste.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxWidth: 460 }}>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                style={{
                  display: 'flex',
                  gap: '0.9rem',
                  alignItems: 'flex-start',
                  background: 'rgba(255, 255, 255, 0.75)',
                  borderRadius: 14,
                  padding: '0.9rem 1.1rem',
                  boxShadow: '0 2px 10px rgba(30, 64, 175, 0.08)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--gradient-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name={f.icon} size={18} color="white" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{f.title}</div>
                  <div style={{ fontSize: '0.85rem', color: '#334155' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          flex: '1 1 380px',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: '2rem 2rem 2.2rem',
            width: '100%',
            maxWidth: 380,
            boxShadow: '0 10px 40px rgba(30, 64, 175, 0.12)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.2rem' }}>
            <Logo height={72} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.5rem', background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
            <button style={tabStyle(mode === 'login')} onClick={() => setMode('login')}>Connexion</button>
            <button style={tabStyle(mode === 'signup')} onClick={() => setMode('signup')}>Créer un compte</button>
            <button style={tabStyle(mode === 'forgot')} onClick={() => setMode('forgot')}>Oublié</button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
            {mode !== 'forgot' && (
              <input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={inputStyle}
              />
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.8rem',
                borderRadius: 10,
                border: 'none',
                background: 'var(--gradient-main)',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.95rem',
                marginTop: '0.4rem',
              }}
            >
              {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? "S'inscrire" : 'Envoyer le lien'}
            </button>
          </form>

          {showOAuth && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '1.2rem 0' }}>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>ou</span>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {ENABLED_PROVIDERS.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => handleOAuth(provider)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      padding: '0.7rem',
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      color: '#0f172a',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                    }}
                  >
                    <ProviderLogo provider={provider} />
                    Continuer avec {PROVIDER_LABELS[provider]}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '0.8rem' }}>{error}</p>}
          {message && <p style={{ color: '#16a34a', fontSize: '0.85rem', marginTop: '0.8rem' }}>{message}</p>}

          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2rem', marginBottom: 0 }}>
            © {new Date().getFullYear()} Calendraft. Tous droits réservés.
            {' · '}
            <a href="/conditions" style={{ color: 'inherit', textDecoration: 'underline' }}>Conditions</a>
            {' · '}
            <a href="/confidentialite" style={{ color: 'inherit', textDecoration: 'underline' }}>Confidentialité</a>
          </p>
        </div>
      </div>
    </div>
  )
}
