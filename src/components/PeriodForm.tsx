import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Frequency } from '../types';

interface PeriodFormProps {
  calendarId: string;
  onCreated: () => void;
  onCancel: () => void;
}

export default function PeriodForm({
  calendarId,
  onCreated,
  onCancel,
}: PeriodFormProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [startDate, setStartDate] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [durationDays, setDurationDays] = useState(1);
  const [intervalWeeks, setIntervalWeeks] = useState(2);
  const [weekOfMonth, setWeekOfMonth] = useState(1);
  const [hasTime, setHasTime] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase.from('periods').insert({
      calendar_id: calendarId,
      name,
      color,
      start_date: startDate,
      frequency,
      duration_days: durationDays,
      interval_weeks:
        frequency === 'weekly' || frequency === 'alternating'
          ? intervalWeeks
          : 1,
      week_of_month: frequency === 'monthly' ? weekOfMonth : null,
      start_time: hasTime && startTime ? startTime : null,
      end_time: hasTime && endTime ? endTime : null,
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreated();
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.6rem 0.8rem',
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    fontSize: '0.9rem',
    outline: 'none',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'block',
    marginBottom: 4,
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        background: 'white',
        borderRadius: 16,
        padding: '1.5rem',
        boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
        maxWidth: 480,
      }}
    >
      <div>
        <label style={labelStyle}>Nom</label>
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>Couleur</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{
              width: 48,
              height: 40,
              padding: 2,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
            }}
          />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={labelStyle}>Date de départ</label>
          <input
            type="date"
            style={inputStyle}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Fréquence</label>
        <select
          style={inputStyle}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
        >
          <option value="once">Une seule fois (sans répétition)</option>
          <option value="weekly">Toutes les X semaines</option>
          <option value="alternating">Alternance (ex: 1 semaine sur 2)</option>
          <option value="custom_days">Chaque semaine, même jour</option>
          <option value="monthly">Une semaine fixe chaque mois</option>
        </select>
      </div>

      <div>
        <label style={labelStyle}>Durée (en jours)</label>
        <input
          type="number"
          min={1}
          style={inputStyle}
          value={durationDays}
          onChange={(e) => setDurationDays(Number(e.target.value))}
        />
      </div>

      {(frequency === 'weekly' || frequency === 'alternating') && (
        <div>
          <label style={labelStyle}>Intervalle (en semaines)</label>
          <input
            type="number"
            min={1}
            style={inputStyle}
            value={intervalWeeks}
            onChange={(e) => setIntervalWeeks(Number(e.target.value))}
          />
        </div>
      )}

      {frequency === 'monthly' && (
        <div>
          <label style={labelStyle}>Quelle semaine du mois</label>
          <select
            style={inputStyle}
            value={weekOfMonth}
            onChange={(e) => setWeekOfMonth(Number(e.target.value))}
          >
            <option value={1}>1ère semaine</option>
            <option value={2}>2e semaine</option>
            <option value={3}>3e semaine</option>
            <option value={4}>4e semaine</option>
            <option value={-1}>Dernière semaine</option>
          </select>
        </div>
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.9rem',
          color: 'var(--text-primary)',
        }}
      >
        <input
          type="checkbox"
          checked={hasTime}
          onChange={(e) => setHasTime(e.target.checked)}
        />
        Horaire précis (sinon journée entière)
      </label>

      {hasTime && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Heure de début</label>
            <input
              type="time"
              style={inputStyle}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Heure de fin</label>
            <input
              type="time"
              style={inputStyle}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            background: 'var(--gradient-main)',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: '0.7rem 1.3rem',
            fontSize: '0.9rem',
            fontWeight: 700,
          }}
        >
          {saving ? 'Enregistrement...' : 'Créer la période'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '0.7rem 1.3rem',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
