// Shared types for Corpus system

export interface Activity {
  activity_id: string;
  start_time_utc: string;
  sport: string;
  duration_s: number;
  distance_m?: number;
  tss?: number;
  avg_hr_bpm?: number;
  max_hr_bpm?: number;
  avg_power_w?: number;
  np_watts?: number;
  if?: number;
  source: string;
  fit_path?: string;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface TodayBrief {
  date: string;
  recovery: {
    status: 'green' | 'yellow' | 'red';
    hrvDelta?: number;
    rhrDelta?: number;
    sleepDebtMin?: number;
  };
  load: {
    tss7d: number;
    tss28d: number;
    tss90d: number;
    trend: 'up' | 'down' | 'flat';
  };
  recommendation: {
    type: 'rest' | 'easy' | 'moderate' | 'intensity';
    notes: string[];
  };
  flags: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high';
    reason: string;
  }>;
}

