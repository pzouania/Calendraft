import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Logo from './Logo'
import Icon from './icons'

type Mode = 'login' | 'signup' | 'forgot'

const FEATURES = [
  { icon: 'users', title: 'Périodes récurrentes', desc: 'Garde alternée, plannings 3x8, horaires personnalisés — configurez une fois, répété automatiquement.' },
  { icon: 'calendar', title: 'Calendrier annuel', desc: 'Visualisez vos 12 mois en un coup d\'œil, avec une vue détaillée heure par heure.' },
  { icon: 'book', title: 'Export PDF', desc: 'Imprimez ou partagez votre calendrier en un clic, mis en page automatiquement.' },
]

export default function AuthPage() {
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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexWrap: 'wrap',
      }}
    >
      <div
        className="auth-showcase"
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

      <div
        style={{
          flex: '1 1 380px',
          minWidth: 320,
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

          {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '0.8rem' }}>{error}</p>}
          {message && <p style={{ color: '#16a34a', fontSize: '0.85rem', marginTop: '0.8rem' }}>{message}</p>}

          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2rem', marginBottom: 0 }}>
            © {new Date().getFullYear()} Calendraft. Tous droits réservés.
          </p>
        </div>
      </div>
    </div>
  )
}
