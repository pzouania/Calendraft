import type { Period, Occurrence } from '../types';
import { toDateOnly } from './dateUtils';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number
): Date {
  if (n === -1) {
    const lastDay = new Date(year, month + 1, 0);
    const diff = (lastDay.getDay() - weekday + 7) % 7;
    return addDays(lastDay, -diff);
  }
  const firstDay = new Date(year, month, 1);
  const diff = (weekday - firstDay.getDay() + 7) % 7;
  const firstOccurrence = addDays(firstDay, diff);
  return addDays(firstOccurrence, (n - 1) * 7);
}

export function generateOccurrences(
  period: Period,
  rangeStart: Date,
  rangeEnd: Date,
  excludedDates: Set<string> = new Set()
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  const start = new Date(period.start_date + 'T00:00:00');

  const crossesMidnight =
    !!period.start_time &&
    !!period.end_time &&
    period.end_time <= period.start_time;

  // On raisonne "par nuit" plutôt que "par jour" : duration_days représente
  // le nombre de nuits de l'occurrence. Chaque nuit produit un segment de
  // départ sur son jour de début et un segment de fin sur le jour suivant,
  // ce qui fait se chevaucher naturellement les segments sur les jours
  // intermédiaires d'une occurrence de plusieurs jours.
  const pushRange = (occStart: Date) => {
    for (let i = 0; i < period.duration_days; i++) {
      const nightStartDay = addDays(occStart, i);
      const nightStartStr = toDateOnly(nightStartDay);

      if (!crossesMidnight) {
        if (
          !excludedDates.has(nightStartStr) &&
          nightStartDay >= rangeStart &&
          nightStartDay <= rangeEnd
        ) {
          occurrences.push({
            periodId: period.id,
            name: period.name,
            color: period.color,
            date: nightStartStr,
            startTime: period.start_time,
            endTime: period.end_time,
            segment: 'full',
          });
        }
        continue;
      }

      // Segment de départ de la nuit (heure de début → minuit)
      if (
        !excludedDates.has(nightStartStr) &&
        nightStartDay >= rangeStart &&
        nightStartDay <= rangeEnd
      ) {
        occurrences.push({
          periodId: period.id,
          name: period.name,
          color: period.color,
          date: nightStartStr,
          startTime: period.start_time,
          endTime: period.end_time,
          segment: 'start',
        });
      }

      // Segment de fin de la même nuit, le jour suivant (minuit → heure de fin)
      const nightEndDay = addDays(nightStartDay, 1);
      const nightEndStr = toDateOnly(nightEndDay);
      if (
        !excludedDates.has(nightEndStr) &&
        nightEndDay >= rangeStart &&
        nightEndDay <= rangeEnd
      ) {
        occurrences.push({
          periodId: period.id,
          name: period.name,
          color: period.color,
          date: nightEndStr,
          startTime: period.start_time,
          endTime: period.end_time,
          segment: 'end',
        });
      }
    }
  };

  if (period.frequency === 'once') {
    pushRange(start);
    return occurrences;
  }

  if (period.frequency === 'weekly' || period.frequency === 'alternating') {
    const intervalDays = period.interval_weeks * 7;
    let cursor = new Date(start);
    while (cursor > rangeStart) cursor = addDays(cursor, -intervalDays);
    while (cursor <= rangeEnd) {
      pushRange(cursor);
      cursor = addDays(cursor, intervalDays);
    }
    return occurrences;
  }

  if (period.frequency === 'custom_days') {
    let cursor = new Date(start);
    while (cursor > rangeStart) cursor = addDays(cursor, -7);
    while (cursor <= rangeEnd) {
      pushRange(cursor);
      cursor = addDays(cursor, 7);
    }
    return occurrences;
  }

  if (period.frequency === 'monthly') {
    const weekday = start.getDay();
    const weekOfMonth = period.week_of_month ?? 1;
    let year = rangeStart.getFullYear();
    let month = rangeStart.getMonth();
    const endYear = rangeEnd.getFullYear();
    const endMonth = rangeEnd.getMonth();

    while (year < endYear || (year === endYear && month <= endMonth)) {
      const occStart = getNthWeekdayOfMonth(year, month, weekday, weekOfMonth);
      if (occStart >= start) {
        pushRange(occStart);
      }
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }
    return occurrences;
  }

  return occurrences;
}

export function generateAllOccurrences(
  periods: Period[],
  rangeStart: Date,
  rangeEnd: Date,
  exceptionsByPeriod: Map<string, Set<string>> = new Map()
): Occurrence[] {
  return periods.flatMap((p) =>
    generateOccurrences(
      p,
      rangeStart,
      rangeEnd,
      exceptionsByPeriod.get(p.id) ?? new Set()
    )
  );
}
