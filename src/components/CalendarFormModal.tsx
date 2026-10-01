import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Icon, { ICON_KEYS } from './icons';
import type { Calendar } from '../types';

const COLOR_OPTIONS = [
  '#2563eb',
  '#0891b2',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#475569',
];

interface CalendarFormModalProps {
  mode: 'create' | 'edit';
  calendar?: Calendar;
  onClose: () => void;
  onSaved: (id: string) => void;
}

export default function CalendarFormModal({
  mode,
  calendar,
  onClose,
  onSaved,
}: CalendarFormModalProps) {
  const [name, setName] = useState(calendar?.name ?? '');
  const [icon, setIcon] = useState(calendar?.icon ?? 'calendar');
  const [color, setColor] = useState(calendar?.color ?? COLOR_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);

    if (mode === 'create') {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setSaving(false);
        return;
      }
      const { data, error } = await supabase
        .from('calendars')
        .insert({ name: name.trim(), icon, color, user_id: userData.user.id })
        .select()
        .single();

      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      if (data) onSaved(data.id);
    } else if (calendar) {
      const { error } = await supabase
        .from('calendars')
        .update({
          name: name.trim(),
          icon,
          color,
          updated_at: new Date().toISOString(),
        })
        .eq('id', calendar.id);

      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved(calendar.id);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: 16,
          width: 'min(420px, 92vw)',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
          {mode === 'create' ? 'Nouveau calendrier' : 'Modifier le calendrier'}
        </h3>

        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
          }}
        >
          <Icon name={icon} size={28} color="white" />
        </div>

        <div>
          <label
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Nom
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            style={{
              width: '100%',
              padding: '0.6rem 0.8rem',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
        </div>

        <div>
          <label
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Icône
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 6,
            }}
          >
            {ICON_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 10,
                  border:
                    icon === key ? `2px solid ${color}` : '1px solid #e2e8f0',
                  background: icon === key ? '#f0f5ff' : 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={key}
                  size={18}
                  color={icon === key ? color : 'var(--text-secondary)'}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Couleur
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: c,
                  border: 'none',
                  outline:
                    color === c ? '2px solid var(--text-primary)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 1,
              background: 'var(--gradient-main)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              padding: '0.7rem',
              fontSize: '0.9rem',
              fontWeight: 700,
            }}
          >
            {saving
              ? 'Enregistrement...'
              : mode === 'create'
              ? 'Créer'
              : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '0.7rem 1.1rem',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
