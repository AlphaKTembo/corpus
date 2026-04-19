import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DuckdbService } from '../duckdb/duckdb.service';
import { ActivitiesService } from '../activities/activities.service';
import { MetricsService } from '../metrics/metrics.service';
import * as fs from 'fs';
import * as path from 'path';

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

export interface RollingSummary {
  date: string;
  tss7d: number;
  tss28d: number;
  tss90d: number;
  duration7dS: number;
  duration28dS: number;
  duration90dS: number;
  loadTrend: 'up' | 'down' | 'flat';
  baselineHrv28d?: number;
  baselineRhr28d?: number;
  baselineSleep28d?: number;
  hrvDelta?: number;
  rhrDelta?: number;
  sleepDebtMin?: number;
  overreachRisk?: boolean;
  injuryRisk?: boolean;
  fatigueRisk?: boolean;
}

@Injectable()
export class SummaryService {
  private corpusRoot: string;

  constructor(
    private duckdbService: DuckdbService,
    private activitiesService: ActivitiesService,
    private metricsService: MetricsService,
    private configService: ConfigService,
  ) {
    const defaultRoot = path.join(process.cwd(), 'data', 'corpus');
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', defaultRoot);
  }

  async getTodayBrief(userId = 'default'): Promise<TodayBrief | null> {
    // Try to compute from CSV first
    try {
      const activities = await this.activitiesService.findActivities({ limit: 1000 }, userId);
      return await this.computeTodayBriefFromActivities(activities.activities || [], userId);
    } catch (error) {
      console.error('Error computing brief from activities:', error);
    }

    // Fallback to DuckDB if available
    if (!this.duckdbService.isDuckDBAvailable()) {
      return null;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      const results = await this.duckdbService.queryDerived<{
        date: string;
        recovery_status: string;
        hrv_delta?: number;
        rhr_delta?: number;
        sleep_debt_min?: number;
        tss_7d: number;
        tss_28d: number;
        tss_90d: number;
        load_trend: string;
        recommendation_type: string;
        recommendation_notes?: string;
        key_insight?: string;
        flags?: string;
      }>('today_brief', `date = '${today}'`);

      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      const flags = row.flags ? JSON.parse(row.flags) : [];
      const notes = row.recommendation_notes
        ? JSON.parse(row.recommendation_notes)
        : [];

      return {
        date: row.date,
        recovery: {
          status: row.recovery_status as 'green' | 'yellow' | 'red',
          hrvDelta: row.hrv_delta,
          rhrDelta: row.rhr_delta,
          sleepDebtMin: row.sleep_debt_min,
        },
        load: {
          tss7d: row.tss_7d,
          tss28d: row.tss_28d,
          tss90d: row.tss_90d,
          trend: row.load_trend as 'up' | 'down' | 'flat',
        },
        recommendation: {
          type: row.recommendation_type as 'rest' | 'easy' | 'moderate' | 'intensity',
          notes,
        },
        flags,
      };
    } catch (error) {
      console.error('Error fetching today brief:', error);
      return null;
    }
  }

  private async computeTodayBriefFromActivities(activities: any[], userId = 'default'): Promise<TodayBrief> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    // Calculate date windows
    const window7Start = new Date(now);
    window7Start.setDate(window7Start.getDate() - 7);
    const window28Start = new Date(now);
    window28Start.setDate(window28Start.getDate() - 28);
    const window90Start = new Date(now);
    window90Start.setDate(window90Start.getDate() - 90);

    // Calculate TSS for each window
    const tss7d = this.calculateTssInWindow(activities, window7Start, now);
    const tss28d = this.calculateTssInWindow(activities, window28Start, now);
    const tss90d = this.calculateTssInWindow(activities, window90Start, now);

    // Calculate duration for fatigue risk
    const duration7dS = this.calculateDurationInWindow(activities, window7Start, now);

    // Determine trend (simplified - compare 7d to 28d average)
    const avg28d = tss28d / 28;
    const avg7d = tss7d / 7;
    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (avg7d > avg28d * 1.1) trend = 'up';
    else if (avg7d < avg28d * 0.9) trend = 'down';

    // Fetch vitals for RHR/HRV calculation
    let rhrDelta: number | undefined;
    let todayRhr: number | undefined;
    let hrvDelta: number | undefined;
    let todayHrv: number | undefined;
    let vitalsAnchorDate: string | undefined;
    try {
      const vitals = await this.metricsService.getVitals(window28Start.toISOString().split('T')[0], undefined, userId);
      if (vitals.length > 0) {
        // Use most recent vitals entry as anchor (intervals.icu/wearable may not have today's entry yet)
        const mostRecent = vitals[0];
        vitalsAnchorDate = mostRecent?.date;
        todayRhr = mostRecent?.resting_hr_bpm;
        todayHrv = mostRecent?.hrv_ms;
        
        // Calculate 28-day baseline (exclude anchor date)
        const baselineVitals = vitals.filter(v => v.date !== vitalsAnchorDate && v.resting_hr_bpm);
        if (baselineVitals.length > 0) {
          const baselineRhr = baselineVitals.reduce((sum, v) => sum + (v.resting_hr_bpm || 0), 0) / baselineVitals.length;
          if (todayRhr) {
            rhrDelta = todayRhr - baselineRhr;
          }
        }

        const baselineHrvVitals = vitals.filter(v => v.date !== vitalsAnchorDate && v.hrv_ms);
        if (baselineHrvVitals.length > 0) {
          const baselineHrv = baselineHrvVitals.reduce((sum, v) => sum + (v.hrv_ms || 0), 0) / baselineHrvVitals.length;
          if (todayHrv) {
            hrvDelta = todayHrv - baselineHrv;
          }
        }
      }
    } catch (error) {
      console.warn('Could not fetch vitals for RHR calculation:', error);
    }

    // Fetch sleep for sleep debt calculation
    let sleepDebtMin: number | undefined;
    try {
      const sleep = await this.metricsService.getSleep(window7Start.toISOString().split('T')[0], undefined, userId);
      if (sleep.length > 0) {
        // Get last night's sleep (most recent)
        const lastSleep = sleep[0];
        if (lastSleep.sleep_total_min) {
          const targetSleepMin = 8 * 60; // 8 hours target
          sleepDebtMin = lastSleep.sleep_total_min - targetSleepMin;
        }
      }
    } catch (error) {
      console.warn('Could not fetch sleep for debt calculation:', error);
    }


    // Enhanced recovery status calculation
    const flags: Array<{ code: string; severity: 'low' | 'medium' | 'high'; reason: string }> = [];
    let recoveryScore = 100; // Start with perfect score

    // Factor 1: Training Load (TSS)
    if (tss7d > 600) {
      recoveryScore -= 40;
      flags.push({ code: 'OVERREACH', severity: 'high', reason: 'Extremely high training load (TSS > 600)' });
    } else if (tss7d > 500) {
      recoveryScore -= 30;
      flags.push({ code: 'HIGH_LOAD', severity: 'high', reason: 'High training load (TSS > 500)' });
    } else if (tss7d > 400) {
      recoveryScore -= 20;
    } else if (tss7d > 300) {
      recoveryScore -= 10;
    }

    // Factor 2: Duration-based fatigue
    if (duration7dS > 36000) { // > 10 hours
      recoveryScore -= 15;
      flags.push({ code: 'FATIGUE', severity: 'medium', reason: 'High training volume (>10 hours)' });
    }

    // Factor 3: RHR Delta (elevated RHR = poor recovery)
    if (rhrDelta !== undefined) {
      if (rhrDelta > 5) {
        recoveryScore -= 20;
        flags.push({ code: 'ELEVATED_RHR', severity: 'high', reason: `RHR elevated by ${rhrDelta.toFixed(1)} bpm` });
      } else if (rhrDelta > 3) {
        recoveryScore -= 10;
        flags.push({ code: 'ELEVATED_RHR', severity: 'medium', reason: `RHR slightly elevated (+${rhrDelta.toFixed(1)} bpm)` });
      } else if (rhrDelta < -3) {
        recoveryScore += 5; // Good recovery indicator
      }
    }

    // Factor 4: Sleep Debt
    if (sleepDebtMin !== undefined) {
      const sleepDebtHours = sleepDebtMin / 60;
      if (sleepDebtMin < -120) { // > 2 hours deficit
        recoveryScore -= 25;
        flags.push({ code: 'SLEEP_DEFICIT', severity: 'high', reason: `Severe sleep deficit (${sleepDebtHours.toFixed(1)}h)` });
      } else if (sleepDebtMin < -60) { // > 1 hour deficit
        recoveryScore -= 15;
        flags.push({ code: 'SLEEP_DEFICIT', severity: 'medium', reason: `Sleep deficit (${sleepDebtHours.toFixed(1)}h)` });
      } else if (sleepDebtMin < -30) {
        recoveryScore -= 5;
      }
    }


    // Determine final recovery status
    let recoveryStatus: 'green' | 'yellow' | 'red';
    if (recoveryScore >= 70) {
      recoveryStatus = 'green';
    } else if (recoveryScore >= 40) {
      recoveryStatus = 'yellow';
    } else {
      recoveryStatus = 'red';
    }

    // Generate recommendations
    let recommendationType: 'rest' | 'easy' | 'moderate' | 'intensity' = 'easy';
    const notes: string[] = [];
    
    if (recoveryStatus === 'red') {
      recommendationType = 'rest';
      notes.push('Recovery compromised - prioritize rest');
      if (flags.some(f => f.code === 'SLEEP_DEFICIT')) {
        notes.push('Focus on sleep quality and duration');
      }
    } else if (recoveryStatus === 'yellow') {
      recommendationType = 'easy';
      notes.push('Moderate recovery - keep intensity low');
      if (rhrDelta && rhrDelta > 3) {
        notes.push('Elevated RHR suggests incomplete recovery');
      }
    } else {
      if (tss7d < 200) {
        recommendationType = 'intensity';
        notes.push('Well recovered - good time for intensity');
      } else {
        recommendationType = 'moderate';
        notes.push('Good recovery - balanced training appropriate');
      }
    }

    return {
      date: today,
      recovery: {
        status: recoveryStatus,
        hrvDelta,
        rhrDelta,
        sleepDebtMin,
      },
      load: {
        tss7d,
        tss28d,
        tss90d,
        trend,
      },
      recommendation: {
        type: recommendationType,
        notes,
      },
      flags,
    };
  }

  async getRollingSummary(days: number = 28, userId = 'default'): Promise<RollingSummary[]> {
    // Try to get activities from CSV first
    try {
      const activities = await this.activitiesService.findActivities({ limit: 1000 }, userId);
      if (activities.activities && activities.activities.length > 0) {
        return this.computeRollingSummaryFromActivities(activities.activities, days);
      }
    } catch (error) {
      console.error('Error computing summary from activities:', error);
    }

    // Fallback to DuckDB if available
    if (!this.duckdbService.isDuckDBAvailable()) {
      return [];
    }
    try {
      const results = await this.duckdbService.queryDerived<{
        date: string;
        tss_7d: number;
        tss_28d: number;
        tss_90d: number;
        duration_7d_s: number;
        duration_28d_s: number;
        duration_90d_s: number;
        load_trend: string;
        baseline_hrv_28d?: number;
        baseline_rhr_28d?: number;
        baseline_sleep_28d?: number;
        hrv_delta?: number;
        rhr_delta?: number;
        sleep_debt_min?: number;
        overreach_risk?: boolean;
        injury_risk?: boolean;
        fatigue_risk?: boolean;
      }>('rolling_summary', undefined, 'date DESC', days);

      return results.map((row) => ({
        date: row.date,
        tss7d: row.tss_7d,
        tss28d: row.tss_28d,
        tss90d: row.tss_90d,
        duration7dS: row.duration_7d_s,
        duration28dS: row.duration_28d_s,
        duration90dS: row.duration_90d_s,
        loadTrend: row.load_trend as 'up' | 'down' | 'flat',
        baselineHrv28d: row.baseline_hrv_28d,
        baselineRhr28d: row.baseline_rhr_28d,
        baselineSleep28d: row.baseline_sleep_28d,
        hrvDelta: row.hrv_delta,
        rhrDelta: row.rhr_delta,
        sleepDebtMin: row.sleep_debt_min,
        overreachRisk: row.overreach_risk,
        injuryRisk: row.injury_risk,
        fatigueRisk: row.fatigue_risk,
      }));
    } catch (error) {
      console.error('Error fetching rolling summary:', error);
      return [];
    }
  }

  private computeRollingSummaryFromActivities(activities: any[], days: number): RollingSummary[] {
    // Group activities by date
    const activitiesByDate: Record<string, any[]> = {};
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    activities.forEach(activity => {
      const activityDate = new Date(activity.start_time_utc);
      if (activityDate >= startDate) {
        const dateKey = activityDate.toISOString().split('T')[0];
        if (!activitiesByDate[dateKey]) {
          activitiesByDate[dateKey] = [];
        }
        activitiesByDate[dateKey].push(activity);
      }
    });

    // Generate summary for each day
    const summaries: RollingSummary[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      
      // Calculate rolling windows
      const windowStart = new Date(date);
      windowStart.setDate(windowStart.getDate() - 6);
      const window28Start = new Date(date);
      window28Start.setDate(window28Start.getDate() - 27);
      const window90Start = new Date(date);
      window90Start.setDate(window90Start.getDate() - 89);

      const tss7d = this.calculateTssInWindow(activities, windowStart, date);
      const tss28d = this.calculateTssInWindow(activities, window28Start, date);
      const tss90d = this.calculateTssInWindow(activities, window90Start, date);
      const duration7dS = this.calculateDurationInWindow(activities, windowStart, date);
      const duration28dS = this.calculateDurationInWindow(activities, window28Start, date);
      const duration90dS = this.calculateDurationInWindow(activities, window90Start, date);

      summaries.push({
        date: dateKey,
        tss7d,
        tss28d,
        tss90d,
        duration7dS,
        duration28dS,
        duration90dS,
        loadTrend: 'flat', // Simplified
      });
    }

    return summaries;
  }

  private calculateTssInWindow(activities: any[], start: Date, end: Date): number {
    return activities
      .filter(a => {
        const activityDate = new Date(a.start_time_utc);
        return activityDate >= start && activityDate <= end;
      })
      .reduce((sum, a) => sum + (a.tss || 0), 0);
  }

  private calculateDurationInWindow(activities: any[], start: Date, end: Date): number {
    return activities
      .filter(a => {
        const activityDate = new Date(a.start_time_utc);
        return activityDate >= start && activityDate <= end;
      })
      .reduce((sum, a) => sum + (a.duration_s || 0), 0);
  }
}

