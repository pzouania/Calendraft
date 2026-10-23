import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { useI18n } from '../hooks/useI18n';
import { noticeFromAuthError, noticeText, type Notice } from '../lib/authErrors';

const MIN_PASSWORD_LENGTH = 6;

export default function ResetPasswordForm() {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<Notice | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError({ key: 'authError.passwordTooShort', params: { min: MIN_PASSWORD_LENGTH } });
      return;
    }
    if (password !== confirm) {
      setError({ key: 'reset.mismatch' });
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) setError(noticeFromAuthError(error));
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
      <ThemeToggle variant="floating" />
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 20,
          padding: '2.5rem 2rem',
          width: '100%',
          maxWidth: 380,
          boxShadow: 'var(--shadow-lg)',
          textAlign: 'center',
        }}
      >
        <div
          className="logo-slot"
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
            <p style={{ color: 'var(--success)', fontWeight: 600 }}>
              {t('reset.success')}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {t('reset.successHint')}
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
              {t('reset.intro')}
            </p>
            <input
              type="password"
              placeholder={t('reset.newPassword')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              style={{
                padding: '0.7rem 0.9rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
            <input
              type="password"
              placeholder={t('reset.confirmPassword')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              style={{
                padding: '0.7rem 0.9rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
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
                color: 'var(--on-accent)',
                fontWeight: 600,
                fontSize: '0.95rem',
                marginTop: '0.4rem',
              }}
            >
              {saving ? t('reset.saving') : t('reset.submit')}
            </button>
            {error && (
              <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{noticeText(error, t)}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
