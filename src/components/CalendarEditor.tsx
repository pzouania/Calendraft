import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import PeriodForm from './PeriodForm';
import YearCalendar from './YearCalendar';
import Logo from './Logo';
import type { Period } from '../types';

interface CalendarEditorProps {
  calendarId: string;
  onBack: () => void;
}

function formatFrequency(p: Period): string {
  switch (p.frequency) {
    case 'once':
      return 'une seule fois';
    case 'weekly':
      return p.interval_weeks > 1
        ? `toutes les ${p.interval_weeks} semaines`
        : 'chaque semaine';
    case 'alternating':
      return `alternance (1 semaine sur ${p.interval_weeks})`;
    case 'custom_days':
      return 'chaque semaine, même jour';
    case 'monthly': {
      const labels: Record<number, string> = {
        1: '1ère',
        2: '2e',
        3: '3e',
        4: '4e',
        [-1]: 'dernière',
      };
      return `${labels[p.week_of_month ?? 1]} semaine de chaque mois`;
    }
    default:
      return p.frequency;
  }
}

export default function CalendarEditor({
  calendarId,
  onBack,
}: CalendarEditorProps) {
  const [tab, setTab] = useState<'periods' | 'calendar'>('calendar');
  const [calendarName, setCalendarName] = useState('');
  const [calendarIcon, setCalendarIcon] = useState('calendar');
  const [calendarColor, setCalendarColor] = useState('#2563eb');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCalendarInfo = async () => {
    const { data } = await supabase
      .from('calendars')
      .select('name, icon, color')
      .eq('id', calendarId)
      .single();
    if (data) {
      setCalendarName(data.name);
      setCalendarIcon(data.icon ?? 'calendar');
      setCalendarColor(data.color ?? '#2563eb');
    }
  };

  const loadPeriods = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('periods')
      .select('*')
      .eq('calendar_id', calendarId)
      .order('created_at', { ascending: true });

    if (error) setError(error.message);
    else setPeriods(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadCalendarInfo();
    loadPeriods();
  }, [calendarId]);

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Supprimer cette période ?');
    if (!confirmed) return;
    const { error } = await supabase.from('periods').delete().eq('id', id);
    if (error) setError(error.message);
    else loadPeriods();
  };

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.6rem 1.2rem',
    borderRadius: 999,
    border: 'none',
    background: active ? 'var(--gradient-main)' : 'white',
    color: active ? 'white' : 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: '0.85rem',
    boxShadow: active
      ? '0 4px 12px rgba(37, 99, 235, 0.3)'
      : '0 1px 4px rgba(0,0,0,0.06)',
  });

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        className="no-print"
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
            display: 'flex',
            alignItems: 'center',
            gap: '1.2rem',
            minWidth: 0,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 10,
              padding: '0.4rem 1rem',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <Logo height={32} />
          </div>
          <span
            style={{
              color: 'white',
              fontSize: '1rem',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {calendarName}
          </span>
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
            flexShrink: 0,
          }}
        >
          ← Retour
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
        <div
          className="no-print"
          style={{
            display: 'flex',
            gap: '0.6rem',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            style={tabButtonStyle(tab === 'calendar')}
            onClick={() => setTab('calendar')}
          >
            Calendrier annuel
          </button>
          <button
            style={tabButtonStyle(tab === 'periods')}
            onClick={() => setTab('periods')}
          >
            Périodes
          </button>
        </div>

        {error && (
          <p className="no-print" style={{ color: '#dc2626' }}>
            {error}
          </p>
        )}

        {tab === 'periods' && (
          <>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  background: 'var(--gradient-main)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  padding: '0.8rem 1.4rem',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  boxShadow: '0 6px 16px rgba(37, 99, 235, 0.35)',
                  marginBottom: '1.5rem',
                }}
              >
                + Ajouter une période
              </button>
            )}

            {showForm && (
              <div style={{ marginBottom: '1.5rem' }}>
                <PeriodForm
                  calendarId={calendarId}
                  onCreated={() => {
                    setShowForm(false);
                    loadPeriods();
                  }}
                  onCancel={() => setShowForm(false)}
                />
              </div>
            )}

            {loading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
            ) : periods.length === 0 ? (
              <div
                style={{
                  background: 'white',
                  borderRadius: 16,
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
                }}
              >
                Aucune période pour l'instant.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                }}
              >
                {periods.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: 'white',
                      borderRadius: 12,
                      padding: '0.9rem 1.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.8rem',
                      flexWrap: 'wrap',
                      boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        backgroundColor: p.color,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {p.name}
                      </strong>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {formatFrequency(p)} — à partir du {p.start_date}
                        {p.start_time &&
                          ` — ${p.start_time.slice(0, 5)} à ${p.end_time?.slice(
                            0,
                            5
                          )}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(p.id)}
                      style={{
                        background: 'transparent',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        borderRadius: 8,
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'calendar' && (
          <YearCalendar
            calendarId={calendarId}
            calendarName={calendarName}
            calendarIcon={calendarIcon}
            calendarColor={calendarColor}
          />
        )}
      </main>
    </div>
  );
}
