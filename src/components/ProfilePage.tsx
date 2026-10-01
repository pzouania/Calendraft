import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import Logo from './Logo';

interface ProfilePageProps {
  user: User;
  onBack: () => void;
  onUpdated: () => void;
}

export default function ProfilePage({
  user,
  onBack,
  onUpdated,
}: ProfilePageProps) {
  const savedUsername = user.user_metadata?.username ?? '';
  const [username, setUsername] = useState(savedUsername);
  const [isEditingUsername, setIsEditingUsername] = useState(
    savedUsername === ''
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user.user_metadata?.avatar_url ?? null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const displayLabel = savedUsername || user.email || '?';
  const initial = displayLabel[0]?.toUpperCase() ?? '?';

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image trop lourde (2 Mo maximum).');
      return;
    }

    setError(null);
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data: publicData } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);
    const newUrl = `${publicData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: newUrl },
    });

    setUploading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setAvatarUrl(newUrl);
    onUpdated();
  };

  const handleSaveUsername = async () => {
    setMessage(null);
    setError(null);
    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      data: { username: username.trim() },
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Nom d'utilisateur mis à jour.");
    setIsEditingUsername(false);
    onUpdated();
  };

  const handleResetPassword = async () => {
    setMessage(null);
    setError(null);
    if (!user.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) setError(error.message);
    else setMessage('Email de réinitialisation envoyé.');
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          background: 'var(--gradient-main)',
          padding: '0.9rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(30, 64, 175, 0.25)',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: 10,
            padding: '0.4rem 1rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Logo height={38} />
        </div>
        <button
          onClick={onBack}
          style={{
            background: 'white',
            color: 'var(--blue-dark)',
            border: 'none',
            borderRadius: 999,
            padding: '0.5rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 700,
          }}
        >
          ← Retour
        </button>
      </header>

      <main style={{ maxWidth: 500, margin: '3rem auto', padding: '0 1.5rem' }}>
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            padding: '2rem',
            boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
            textAlign: 'center',
          }}
        >
          <label
            style={{
              display: 'inline-block',
              position: 'relative',
              cursor: 'pointer',
              marginBottom: '1rem',
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Photo de profil"
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  background: 'var(--gradient-main)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '2rem',
                }}
              >
                {initial}
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                background: 'var(--blue-dark)',
                color: 'white',
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                border: '2px solid white',
              }}
            >
              ✎
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>
          {uploading && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Envoi de la photo...
            </p>
          )}

          <h2
            style={{ margin: '0.5rem 0 0.3rem', color: 'var(--text-primary)' }}
          >
            Mon profil
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginBottom: '1.5rem',
              wordBreak: 'break-word',
            }}
          >
            {user.email}
          </p>

          <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <label
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Nom d'utilisateur
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Votre nom affiché"
                disabled={!isEditingUsername}
                style={{
                  flex: '1 1 160px',
                  minWidth: 0,
                  padding: '0.6rem 0.8rem',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  fontSize: '0.9rem',
                  outline: 'none',
                  background: isEditingUsername ? 'white' : '#f8fafc',
                  color: isEditingUsername
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                }}
              />
              {isEditingUsername ? (
                <button
                  onClick={handleSaveUsername}
                  disabled={saving || username.trim() === ''}
                  style={{
                    background: 'var(--gradient-main)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    padding: '0 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    flexShrink: 0,
                    opacity: saving || username.trim() === '' ? 0.6 : 1,
                  }}
                >
                  {saving ? '...' : 'Enregistrer'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsEditingUsername(true);
                    setMessage(null);
                  }}
                  style={{
                    background: 'white',
                    color: 'var(--blue-dark)',
                    border: '1px solid var(--blue-main)',
                    borderRadius: 10,
                    padding: '0 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  Modifier
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleResetPassword}
            style={{
              background: 'var(--gradient-main)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              padding: '0.7rem 1.3rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              marginBottom: '1rem',
              width: '100%',
            }}
          >
            Réinitialiser mon mot de passe
          </button>

          {message && (
            <p style={{ color: '#16a34a', fontSize: '0.85rem' }}>{message}</p>
          )}
          {error && (
            <p
              style={{
                color: '#dc2626',
                fontSize: '0.85rem',
                wordBreak: 'break-word',
              }}
            >
              {error}
            </p>
          )}

          <hr
            style={{
              border: 'none',
              borderTop: '1px solid #e2e8f0',
              margin: '1.5rem 0',
            }}
          />

          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              background: 'transparent',
              border: '1px solid #fecaca',
              color: '#dc2626',
              borderRadius: 10,
              padding: '0.6rem 1.2rem',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Se déconnecter
          </button>
        </div>
      </main>
    </div>
  );
}
