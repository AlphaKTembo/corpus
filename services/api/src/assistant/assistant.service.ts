import { Injectable, Logger } from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service';
import { FitnessSyncerService } from '../fitnesssyncer/fitnesssyncer.service';
import { IntervalsIcuService } from '../intervals-icu/intervals-icu.service';
import { MedicalsService } from '../medicals/medicals.service';
import { MetricsService } from '../metrics/metrics.service';
import { SummaryService } from '../summary/summary.service';

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private activitiesService: ActivitiesService,
    private metricsService: MetricsService,
    private summaryService: SummaryService,
    private medicalsService: MedicalsService,
    private fitnessSyncerService: FitnessSyncerService,
    private intervalsIcuService: IntervalsIcuService,
  ) {}

  async getContext(params?: { days?: number; activityLimit?: number }, userId = 'default') {
    const days = params?.days && params.days > 0 ? params.days : 30;
    const activityLimit = params?.activityLimit && params.activityLimit > 0 ? params.activityLimit : 80;

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    const from = start.toISOString().slice(0, 10);

    const [todayBrief, rollingSummary, vitals, sleep, bodyMetrics, activities, latestSummary] =
      await Promise.all([
        this.summaryService.getTodayBrief(userId),
        this.summaryService.getRollingSummary(days, userId),
        this.metricsService.getVitals(from, undefined, userId),
        this.metricsService.getSleep(from, undefined, userId),
        this.metricsService.getBodyMetrics(from, undefined, userId),
        this.activitiesService.findActivities({ limit: activityLimit }, userId),
        Promise.resolve(this.medicalsService.getLatestSummary(userId)),
      ]);

    const medicalSummary =
      latestSummary && latestSummary.date
        ? {
            ...latestSummary,
            payloadShareUrl: this.medicalsService.getPayloadShareUrl(latestSummary.date),
          }
        : null;

    const activityRecommendations = this.buildActivityRecommendations(activities.activities, todayBrief);

    return {
      generatedAt: new Date().toISOString(),
      window: { days, from },
      todayBrief,
      rollingSummary,
      vitals,
      sleep,
      bodyMetrics,
      activities: activities.activities,
      recommendations: activityRecommendations,
      medicalSummary,
    };
  }

  async triggerSidebarSync(params?: { days?: number; generateSummary?: boolean }, userId = 'default') {
    const days = params?.days && params.days > 0 ? params.days : 90;
    const generateSummary = params?.generateSummary === true;
    const results: Record<string, unknown> = {};

    // PRIMARY SOURCE: intervals.icu (replaces Garmin)
    try {
      this.logger.log('Syncing from intervals.icu (PRIMARY SOURCE)');
      const syncResult = await this.withTimeout(
        this.intervalsIcuService.syncAllData(days, { includeActivityDetails: false }, userId),
        7000,
      );
      results.intervalsIcu = syncResult;
    } catch (error: any) {
      results.intervalsIcu = { success: false, error: error?.message || 'Intervals.icu sync failed.' };
    }

    // BACKUP: FitnessSyncer (blood pressure only)
    try {
      const fitnessResult = await this.withTimeout(
        (async () => {
          const tokens = await this.fitnessSyncerService.loadToken(userId);
          if (!tokens) {
            return { success: false, error: 'FitnessSyncer not connected.' };
          }
          try {
            const syncResult = await this.fitnessSyncerService.syncData(tokens.accessToken, userId);
            return { success: true, ...syncResult };
          } catch (error: any) {
            if (
              error?.message?.includes('Expired') ||
              error?.message?.includes('401') ||
              error?.message?.includes('Unauthorized')
            ) {
              const refreshed = await this.fitnessSyncerService.refreshAccessToken(tokens.refreshToken);
              const retryResult = await this.fitnessSyncerService.syncData(refreshed.access_token, userId);
              return { success: true, ...retryResult };
            }
            return { success: false, error: error?.message || 'FitnessSyncer sync failed.' };
          }
        })(),
        5000,
      );
      results.fitnessSyncer = fitnessResult;
    } catch (error: any) {
      results.fitnessSyncer = { success: false, error: error?.message || 'FitnessSyncer sync failed.' };
    }

    try {
      const medicalSync = await this.withTimeout(this.medicalsService.syncFromLocalFolder({}, userId), 5000);
      const shouldRebuild = (medicalSync as any)?.added > 0;
      const csvs = shouldRebuild
        ? await this.withTimeout(this.medicalsService.rebuildMedicalCsvs(userId), 5000)
        : { bloods: 0, dna: 0, records: 0 };

      let summary: any = null;
      if (generateSummary) {
        summary = await this.withTimeout(this.medicalsService.generateDailySummary(undefined, undefined, userId), 15000);
      }

      results.medicals = {
        success: true,
        sync: medicalSync,
        csvs,
        csvsSkipped: !shouldRebuild,
        summary: summary
          ? {
              date: summary.date,
              payloadUrl: summary.payloadUrl,
              payloadShareUrl: summary.payloadShareUrl,
            }
          : null,
      };
    } catch (error: any) {
      results.medicals = { success: false, error: error?.message || 'Medical sync failed.' };
    }

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      days,
      results,
    };
  }

  private buildActivityRecommendations(
    activities: any[],
    todayBrief: any,
  ): { type: string; reason: string; confidence: number }[] {
    const recommendations: { type: string; reason: string; confidence: number }[] = [];

    if (!todayBrief) return recommendations;

    const { recovery, load } = todayBrief;

    if (recovery?.status === 'red') {
      recommendations.push({ type: 'rest', reason: 'Recovery status is poor', confidence: 0.9 });
    } else if (recovery?.status === 'yellow') {
      recommendations.push({ type: 'easy', reason: 'Recovery status is moderate', confidence: 0.7 });
    } else {
      if (load?.tss7d > 400) {
        recommendations.push({ type: 'moderate', reason: 'High weekly load', confidence: 0.8 });
      } else {
        recommendations.push({ type: 'intensity', reason: 'Good recovery, manageable load', confidence: 0.75 });
      }
    }

    return recommendations;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}
