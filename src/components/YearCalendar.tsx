import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { generateAllOccurrences } from '../lib/occurrenceEngine';
import MonthGrid from './MonthGrid';
import DayDetail from './DayDetail';
import Icon from './icons';
import type { Period, Occurrence, PeriodException } from '../types';

interface YearCalendarProps {
  calendarId: string;
  calendarName: string;
  calendarIcon: string;
  calendarColor: string;
}

export default function YearCalendar({
  calendarId,
  calendarName,
  calendarIcon,
  calendarColor,
}: YearCalendarProps) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [exceptions, setExceptions] = useState<PeriodException[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const { data: periodsData } = await supabase
      .from('periods')
      .select('*')
      .eq('calendar_id', calendarId);

    const periodIds = (periodsData ?? []).map((p) => p.id);
    let exceptionsData: PeriodException[] = [];
    if (periodIds.length > 0) {
      const { data } = await supabase
        .from('period_exceptions')
        .select('*')
        .in('period_id', periodIds);
      exceptionsData = data ?? [];
    }

    setPeriods(periodsData ?? []);
    setExceptions(exceptionsData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [calendarId]);

  const exceptionsByPeriod = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ex of exceptions) {
      const set = map.get(ex.period_id) ?? new Set<string>();
      set.add(ex.exception_date);
      map.set(ex.period_id, set);
    }
    return map;
  }, [exceptions]);

  const occurrencesByDate = useMemo(() => {
    const rangeStart = new Date(year, 0, 1);
    const rangeEnd = new Date(year, 11, 31);
    const all = generateAllOccurrences(
      periods,
      rangeStart,
      rangeEnd,
      exceptionsByPeriod
    );
    const map = new Map<string, Occurrence[]>();
    for (const o of all) {
      const list = map.get(o.date) ?? [];
      list.push(o);
      map.set(o.date, list);
    }
    return map;
  }, [periods, year, exceptionsByPeriod]);

  const handleExportPDF = () => {
    const previousTitle = document.title;
    document.title = `${calendarName} ${year}`;
    window.print();
    document.title = previousTitle;
  };

  if (loading)
    return (
      <p style={{ color: 'var(--text-secondary)' }}>
        Chargement du calendrier...
      </p>
    );

  return (
    <div>
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          marginBottom: '1.2rem',
          flexWrap: 'wrap',
          background: 'white',
          borderRadius: 12,
          padding: '0.7rem 1rem',
          boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)',
        }}
      >
        <button
          onClick={() => setYear((y) => y - 1)}
          style={{
            background: '#f1f5f9',
            border: 'none',
            borderRadius: 8,
            width: 32,
            height: 32,
            color: 'var(--text-primary)',
            fontWeight: 700,
          }}
        >
          ◀
        </button>
        <strong
          style={{
            color: 'var(--text-primary)',
            fontSize: '1.1rem',
            minWidth: 50,
            textAlign: 'center',
          }}
        >
          {year}
        </strong>
        <button
          onClick={() => setYear((y) => y + 1)}
          style={{
            background: '#f1f5f9',
            border: 'none',
            borderRadius: 8,
            width: 32,
            height: 32,
            color: 'var(--text-primary)',
            fontWeight: 700,
          }}
        >
          ▶
        </button>
        <button
          onClick={handleExportPDF}
          style={{
            marginLeft: 'auto',
            background: 'var(--gradient-main)',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: '0.6rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 700,
          }}
        >
          Exporter en PDF
        </button>
      </div>

      {periods.length === 0 && (
        <p className="no-print" style={{ color: 'var(--text-secondary)' }}>
          Aucune période définie — ajoutez-en dans l'onglet "Périodes".
        </p>
      )}

      <div
        className="printable-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.8rem',
          marginBottom: '1.2rem',
        }}
      >
        <div
          className="printable-header-icon"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: calendarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={calendarIcon} size={22} color="white" />
        </div>
        <h2
          className="printable-title"
          style={{ margin: 0, color: 'var(--text-primary)' }}
        >
          {calendarName} — {year}
        </h2>
      </div>

      <div
        className="year-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '1rem',
        }}
      >
        {Array.from({ length: 12 }, (_, m) => (
          <MonthGrid
            key={m}
            year={year}
            month={m}
            occurrencesByDate={occurrencesByDate}
            onDayClick={(dateStr) => setSelectedDate(dateStr)}
            accentColor={calendarColor}
          />
        ))}
      </div>

      {periods.length > 0 && (
        <div
          className="legend"
          style={{
            marginTop: '1.2rem',
            display: 'flex',
            gap: '0.6rem',
            flexWrap: 'wrap',
            background: 'white',
            borderRadius: 12,
            padding: '0.9rem 1.2rem',
            boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)',
          }}
        >
          {periods.map((p) => (
            <div
              key={p.id}
              className="legend-pill"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                background: `${p.color}18`,
                borderRadius: 999,
                padding: '0.3rem 0.7rem 0.3rem 0.4rem',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: p.color,
                }}
              />
              {p.name}
            </div>
          ))}
        </div>
      )}

      {selectedDate && (
        <div className="no-print">
          <DayDetail
            date={selectedDate}
            occurrences={occurrencesByDate.get(selectedDate) ?? []}
            onClose={() => setSelectedDate(null)}
            onChanged={() => {
              loadData();
              setSelectedDate(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
