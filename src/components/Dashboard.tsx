import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import Logo from './Logo';
import Icon from './icons';
import CalendarFormModal from './CalendarFormModal';
import type { Calendar } from '../types';

interface DashboardProps {
  user: User;
  onOpenCalendar: (id: string) => void;
  onOpenProfile: () => void;
}

export default function Dashboard({
  user,
  onOpenCalendar,
  onOpenProfile,
}: DashboardProps) {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    mode: 'create' | 'edit';
    calendar?: Calendar;
  } | null>(null);

  const loadCalendars = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('calendars')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) setError(error.message);
    else setCalendars(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadCalendars();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      'Supprimer ce calendrier ? Cette action est irréversible.'
    );
    if (!confirmed) return;

    const { error } = await supabase.from('calendars').delete().eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    loadCalendars();
  };

  const filtered = calendars.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const username = user.user_metadata?.username as string | undefined;
  const displayLabel = username || user.email || '?';
  const initial = displayLabel[0]?.toUpperCase() ?? '?';
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
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
          <span
            style={{
              color: 'white',
              fontSize: '1rem',
              fontWeight: 600,
              opacity: 0.95,
            }}
          >
            Mes calendriers
          </span>
        </div>

        <button
          onClick={onOpenProfile}
          title="Mon profil"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            borderRadius: 999,
            padding: '0.3rem 0.9rem 0.3rem 0.3rem',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'white',
              color: 'var(--blue-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.9rem',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              initial
            )}
          </div>
          {username && (
            <span
              style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}
            >
              {username}
            </span>
          )}
        </button>
      </header>

      <main
        style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '2rem',
            alignItems: 'center',
          }}
        >
          <button
            onClick={() => setModal({ mode: 'create' })}
            style={{
              background: 'var(--gradient-main)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              padding: '0.8rem 1.4rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              boxShadow: '0 6px 16px rgba(37, 99, 235, 0.35)',
            }}
          >
            + Nouveau calendrier
          </button>
          <input
            type="text"
            placeholder="Rechercher un calendrier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '0.8rem 1rem',
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              fontSize: '0.9rem',
              outline: 'none',
              background: 'white',
            }}
          />
        </div>

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
        ) : filtered.length === 0 ? (
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: '3rem 1.5rem',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
            }}
          >
            Aucun calendrier pour l'instant. Créez-en un pour commencer.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1.2rem',
            }}
          >
            {filtered.map((cal) => (
              <div
                key={cal.id}
                onClick={() => onOpenCalendar(cal.id)}
                style={{
                  background: 'white',
                  borderRadius: 16,
                  padding: '1.3rem',
                  boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow =
                    '0 8px 24px rgba(30, 64, 175, 0.16)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow =
                    '0 4px 16px rgba(30, 64, 175, 0.08)';
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ mode: 'edit', calendar: cal });
                  }}
                  title="Modifier"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: 8,
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                  }}
                >
                  ✎
                </button>

                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: cal.color || 'var(--blue-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '0.8rem',
                  }}
                >
                  <Icon name={cal.icon || 'calendar'} size={20} color="white" />
                </div>
                <h3
                  style={{
                    margin: '0 0 0.3rem',
                    fontSize: '1rem',
                    color: 'var(--text-primary)',
                    paddingRight: '1.5rem',
                  }}
                >
                  {cal.name}
                </h3>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    margin: '0 0 0.8rem',
                  }}
                >
                  Modifié le{' '}
                  {new Date(cal.updated_at).toLocaleDateString('fr-FR')}
                </p>
                <button
                  onClick={(e) => handleDelete(cal.id, e)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    borderRadius: 8,
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {modal && (
        <CalendarFormModal
          mode={modal.mode}
          calendar={modal.calendar}
          onClose={() => setModal(null)}
          onSaved={(id) => {
            setModal(null);
            if (modal.mode === 'create') {
              onOpenCalendar(id);
            } else {
              loadCalendars();
            }
          }}
        />
      )}
    </div>
  );
}
