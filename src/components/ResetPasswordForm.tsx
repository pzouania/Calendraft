import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Logo from './Logo';

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) setError(error.message);
    else setSuccess(true);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: '2.5rem 2rem',
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 10px 40px rgba(30, 64, 175, 0.12)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <Logo height={64} />
        </div>

        {success ? (
          <>
            <p style={{ color: '#16a34a', fontWeight: 600 }}>
              Mot de passe mis à jour avec succès.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Vous pouvez fermer cette page et vous reconnecter avec votre
              nouveau mot de passe.
            </p>
          </>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.8rem',
              textAlign: 'left',
            }}
          >
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                margin: '0 0 0.4rem',
              }}
            >
              Choisissez votre nouveau mot de passe.
            </p>
            <input
              type="password"
              placeholder="Nouveau mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                padding: '0.7rem 0.9rem',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
            <input
              type="password"
              placeholder="Confirmer le mot de passe"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              style={{
                padding: '0.7rem 0.9rem',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={saving}
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
              {saving ? 'Enregistrement...' : 'Mettre à jour le mot de passe'}
            </button>
            {error && (
              <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
