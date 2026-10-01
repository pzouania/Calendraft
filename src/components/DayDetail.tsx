import { supabase } from '../lib/supabaseClient';
import type { Occurrence } from '../types';

interface DayDetailProps {
  date: string;
  occurrences: Occurrence[];
  onClose: () => void;
  onChanged: () => void;
}

const ROW_HEIGHT = 40;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export default function DayDetail({
  date,
  occurrences,
  onClose,
  onChanged,
}: DayDetailProps) {
  const handleDeleteLocal = async (occ: Occurrence) => {
    const confirmed = window.confirm(
      `Supprimer "${occ.name}" uniquement pour le ${occ.date} ? Les autres dates de cette période récurrente ne seront pas affectées.`
    );
    if (!confirmed) return;

    const { error } = await supabase.from('period_exceptions').insert({
      period_id: occ.periodId,
      exception_date: occ.date,
    });

    if (error) {
      alert('Erreur : ' + error.message);
      return;
    }
    onChanged();
  };

  const timedOccurrences = occurrences.filter((o) => o.startTime && o.endTime);
  const allDayOccurrences = occurrences.filter(
    (o) => !o.startTime || !o.endTime
  );

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
      <div
        style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: 16,
          width: 'min(480px, 92vw)',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            color: 'var(--text-primary)',
            margin: '0 0 1rem',
            textTransform: 'capitalize',
          }}
        >
          {new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </h3>

        {allDayOccurrences.length > 0 && (
          <div
            style={{
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {allDayOccurrences.map((occ, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  background: '#f8fafc',
                  borderRadius: 10,
                  padding: '0.5rem 0.8rem',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    backgroundColor: occ.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.9rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  {occ.name} (journée entière)
                </span>
                <button
                  onClick={() => handleDeleteLocal(occ)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    borderRadius: 8,
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  Supprimer ce jour
                </button>
              </div>
            ))}
          </div>
        )}

        {occurrences.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            Aucun événement ce jour-là.
          </p>
        ) : (
          <div style={{ position: 'relative', borderTop: '1px solid #eee' }}>
            {HOURS.map((h) => (
              <div
                key={h}
                style={{
                  height: ROW_HEIGHT,
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  alignItems: 'flex-start',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-secondary)',
                    width: 40,
                    flexShrink: 0,
                  }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
                <div
                  style={{ flex: 1, position: 'relative', height: '100%' }}
                />
              </div>
            ))}

            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 44,
                right: 0,
                bottom: 0,
              }}
            >
              {timedOccurrences.map((occ, i) => {
                const segment = occ.segment ?? 'full';

                let startMin: number;
                let endMin: number;
                let subtitle: string;

                if (segment === 'start') {
                  startMin = timeToMinutes(occ.startTime!);
                  endMin = 24 * 60;
                  subtitle = ` Se termine le lendemain à ${occ.endTime!.slice(
                    0,
                    5
                  )}`;
                } else if (segment === 'end') {
                  startMin = 0;
                  endMin = timeToMinutes(occ.endTime!);
                  subtitle = `commencé la veille à ${occ.startTime!.slice(
                    0,
                    5
                  )} `;
                } else {
                  startMin = timeToMinutes(occ.startTime!);
                  endMin = timeToMinutes(occ.endTime!);
                  if (endMin <= startMin) endMin = 24 * 60; // filet de sécurité
                  subtitle = `${occ.startTime!.slice(
                    0,
                    5
                  )} – ${occ.endTime!.slice(0, 5)}`;
                }

                const top = (startMin / 60) * ROW_HEIGHT;
                const height = Math.max(
                  ((endMin - startMin) / 60) * ROW_HEIGHT,
                  16
                );

                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top,
                      height,
                      left: 0,
                      right: 8,
                      backgroundColor: occ.color,
                      borderRadius: 8,
                      color: 'white',
                      fontSize: '0.7rem',
                      padding: '4px 8px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    }}
                  >
                    <div>
                      <strong>{occ.name}</strong>
                      <div>{subtitle}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteLocal(occ)}
                      style={{
                        alignSelf: 'flex-start',
                        fontSize: '0.65rem',
                        marginTop: 2,
                        background: 'rgba(255,255,255,0.25)',
                        border: 'none',
                        color: 'white',
                        borderRadius: 6,
                        padding: '2px 6px',
                      }}
                    >
                      Supprimer ce jour
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            marginTop: '1.2rem',
            background: 'var(--gradient-main)',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: '0.6rem 1.2rem',
            fontSize: '0.85rem',
            fontWeight: 700,
            width: '100%',
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
