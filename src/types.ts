export interface Calendar {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export type Frequency =
  | 'once'
  | 'weekly'
  | 'custom_days'
  | 'alternating'
  | 'monthly';

export interface Period {
  id: string;
  calendar_id: string;
  name: string;
  color: string;
  start_date: string;
  frequency: Frequency;
  duration_days: number;
  interval_weeks: number;
  week_of_month: number | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

export interface PeriodException {
  id: string;
  period_id: string;
  exception_date: string;
}

export interface Occurrence {
  periodId: string;
  name: string;
  color: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  segment?: 'full' | 'start' | 'end'; // 'start'/'end' = moitié d'un événement traversant minuit
}
