/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as yaml from 'yaml';
import { ParquetReader } from 'parquetjs';
import { ManifestFile } from './manifest.service';
import { ParquetWriterService } from './parquet-writer.service';
import { FitnessSyncerService } from './fitnesssyncer.service';

interface MappingRule {
  column?: string;
  value?: string;
  transform?: string;
}

interface MappingRules {
  version: string;
  sources: Record<string, {
    activities?: Record<string, MappingRule>;
    vitals_daily?: Record<string, MappingRule>;
    sleep_daily?: Record<string, MappingRule>;
    body_metrics?: Record<string, MappingRule>;
  }>;
}

export class IngestService {
  private corpusRoot: string;
  private parquetWriter: ParquetWriterService;
  private mappingRules: MappingRules | null = null;
  private fitnessSyncer: FitnessSyncerService;

  constructor() {
    this.corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    this.parquetWriter = new ParquetWriterService(this.corpusRoot);
    this.fitnessSyncer = new FitnessSyncerService();
  }

  async initialize(): Promise<void> {
    await this.parquetWriter.initialize();
    await this.loadMappingRules();
  }

  async close(): Promise<void> {
    await this.parquetWriter.close();
  }

  private async loadMappingRules(): Promise<void> {
    const rulesPath = path.join(this.corpusRoot, 'metadata', 'mapping_rules.yml');
    if (fs.existsSync(rulesPath)) {
      const content = fs.readFileSync(rulesPath, 'utf-8');
      this.mappingRules = yaml.parse(content) as MappingRules;
    }
  }

  async processFile(file: ManifestFile, corpusRoot: string): Promise<void> {
    if (file.type === 'csv') {
      await this.processCsv(file, corpusRoot);
    } else if (file.type === 'fit') {
      await this.processFit(file, corpusRoot);
    }
  }

  private async processCsv(file: ManifestFile, corpusRoot: string): Promise<void> {
    const rawPath = path.join(corpusRoot, 'raw', 'csv', path.basename(file.path));
    
    if (!fs.existsSync(rawPath)) {
      throw new Error(`Raw file not found: ${rawPath}`);
    }

    const content = fs.readFileSync(rawPath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) {
      console.log(`No records found in CSV: ${file.path}`);
      return;
    }

    // Detect source type from filename or first row
    const sourceType = this.detectSourceType(file.path, records[0]);
    
    // Process based on detected type
    if (this.isActivitiesFile(records[0])) {
      await this.processActivitiesCsv(records, sourceType);
    } else if (this.isVitalsFile(records[0])) {
      await this.processVitalsCsv(records, sourceType);
    } else if (this.isSleepFile(records[0])) {
      await this.processSleepCsv(records, sourceType);
    } else if (this.isBodyMetricsFile(records[0])) {
      await this.processBodyMetricsCsv(records, sourceType);
    } else {
      console.warn(`Unknown CSV format: ${file.path}, attempting activities mapping`);
      await this.processActivitiesCsv(records, sourceType);
    }
    
    console.log(`Processed CSV: ${file.path} (${records.length} records)`);
  }

  private detectSourceType(filePath: string, firstRow: any): string {
    const pathLower = filePath.toLowerCase();
    if (pathLower.includes('trainingpeaks') || pathLower.includes('tp')) {
      return 'trainingpeaks';
    }
    if (pathLower.includes('garmin')) {
      return 'garmin';
    }
    if (pathLower.includes('strava')) {
      return 'strava';
    }
    // Default to trainingpeaks if mapping rules exist
    return this.mappingRules?.sources.trainingpeaks ? 'trainingpeaks' : 'unknown';
  }

  private isActivitiesFile(row: any): boolean {
    const keys = Object.keys(row).map(k => k.toLowerCase());
    return keys.some(k => 
      k.includes('workout') || k.includes('activity') || 
      k.includes('sport') || k.includes('duration') || k.includes('tss')
    );
  }

  private isVitalsFile(row: any): boolean {
    const keys = Object.keys(row).map(k => k.toLowerCase());
    return keys.some(k => 
      k.includes('hrv') || k.includes('resting') || k.includes('rhr') ||
      k.includes('heart rate') || k.includes('vitals')
    );
  }

  private isSleepFile(row: any): boolean {
    const keys = Object.keys(row).map(k => k.toLowerCase());
    return keys.some(k => 
      k.includes('sleep') || k.includes('rem') || k.includes('deep')
    );
  }

  private isBodyMetricsFile(row: any): boolean {
    const keys = Object.keys(row).map(k => k.toLowerCase());
    return keys.some(k => 
      k.includes('weight') || k.includes('body fat') || k.includes('bmi')
    );
  }

  private async processActivitiesCsv(records: any[], sourceType: string): Promise<void> {
    const mapping = this.mappingRules?.sources[sourceType]?.activities;
    const activities = records.map((record, index) => {
      const activity: any = {
        activity_id: this.mapField(record, mapping, 'activity_id', `activity-${Date.now()}-${index}`),
        start_time_utc: this.mapField(record, mapping, 'start_time_utc', new Date().toISOString()),
        sport: this.mapField(record, mapping, 'sport', 'Unknown'),
        duration_s: this.parseDuration(this.mapField(record, mapping, 'duration_s', '0')),
        source: this.mapField(record, mapping, 'source', sourceType),
        created_at_utc: new Date().toISOString(),
        updated_at_utc: new Date().toISOString(),
      };

      // Optional fields
      const distance = this.mapField(record, mapping, 'distance_m');
      if (distance) activity.distance_m = this.parseDistance(distance);
      
      const tss = this.mapField(record, mapping, 'tss');
      if (tss) activity.tss = parseFloat(tss) || undefined;
      
      const avgHr = this.mapField(record, mapping, 'avg_hr_bpm');
      if (avgHr) activity.avg_hr_bpm = parseFloat(avgHr) || undefined;
      
      const maxHr = this.mapField(record, mapping, 'max_hr_bpm');
      if (maxHr) activity.max_hr_bpm = parseFloat(maxHr) || undefined;
      
      const avgPower = this.mapField(record, mapping, 'avg_power_w');
      if (avgPower) activity.avg_power_w = parseFloat(avgPower) || undefined;
      
      const np = this.mapField(record, mapping, 'np_watts');
      if (np) activity.np_watts = parseFloat(np) || undefined;
      
      const ifValue = this.mapField(record, mapping, 'if');
      if (ifValue) activity.if = parseFloat(ifValue) || undefined;

      return activity;
    });

    await this.parquetWriter.appendCanonicalTable('activities', activities);
  }

  private async processVitalsCsv(records: any[], sourceType: string): Promise<void> {
    const mapping = this.mappingRules?.sources[sourceType]?.vitals_daily;
    const vitals = records.map((record) => {
      const date = this.mapField(record, mapping, 'date', new Date().toISOString().split('T')[0]);
      return {
        date: date.split('T')[0],
        resting_hr_bpm: this.parseNumber(this.mapField(record, mapping, 'resting_hr_bpm')),
        hrv_ms: this.parseNumber(this.mapField(record, mapping, 'hrv_ms')),
        body_temp_c: this.parseNumber(this.mapField(record, mapping, 'body_temp_c')),
        source: this.mapField(record, mapping, 'source', sourceType),
      };
    });

    await this.parquetWriter.appendCanonicalTable('vitals_daily', vitals);
  }

  private async processSleepCsv(records: any[], sourceType: string): Promise<void> {
    const mapping = this.mappingRules?.sources[sourceType]?.sleep_daily;
    const sleep = records.map((record) => {
      const date = this.mapField(record, mapping, 'date', new Date().toISOString().split('T')[0]);
      return {
        date: date.split('T')[0],
        sleep_total_min: this.parseNumber(this.mapField(record, mapping, 'sleep_total_min')),
        rem_min: this.parseNumber(this.mapField(record, mapping, 'rem_min')),
        deep_min: this.parseNumber(this.mapField(record, mapping, 'deep_min')),
        wake_min: this.parseNumber(this.mapField(record, mapping, 'wake_min')),
        efficiency_pct: this.parseNumber(this.mapField(record, mapping, 'efficiency_pct')),
        source: this.mapField(record, mapping, 'source', sourceType),
      };
    });

    await this.parquetWriter.appendCanonicalTable('sleep_daily', sleep);
  }

  private async processBodyMetricsCsv(records: any[], sourceType: string): Promise<void> {
    const mapping = this.mappingRules?.sources[sourceType]?.body_metrics;
    const bodyMetrics = records.map((record) => {
      const date = this.mapField(record, mapping, 'date', new Date().toISOString().split('T')[0]);
      return {
        date: date.split('T')[0],
        weight_kg: this.parseNumber(this.mapField(record, mapping, 'weight_kg')),
        body_fat_pct: this.parseNumber(this.mapField(record, mapping, 'body_fat_pct')),
        source: this.mapField(record, mapping, 'source', sourceType),
      };
    });

    await this.parquetWriter.appendCanonicalTable('body_metrics', bodyMetrics);
  }

  private mapField(record: any, mapping: Record<string, MappingRule> | undefined, field: string, defaultValue?: string): string {
    if (!mapping || !mapping[field]) {
      // Try direct column match
      return record[field] || record[field.toLowerCase()] || defaultValue || '';
    }

    const rule = mapping[field];
    if (rule.value) {
      if (rule.value === 'now') {
        return new Date().toISOString();
      }
      return rule.value;
    }

    if (rule.column) {
      const value = record[rule.column] || record[rule.column.toLowerCase()];
      if (value !== undefined && value !== null) {
        return this.transformValue(value, rule.transform);
      }
    }

    return defaultValue || '';
  }

  private transformValue(value: any, transform?: string): string {
    if (!transform) return String(value);

    switch (transform) {
      case 'datetime':
        return new Date(value).toISOString();
      case 'seconds':
        return String(this.parseDuration(value));
      case 'meters':
        return String(this.parseDistance(value));
      case 'number':
        return String(parseFloat(value) || 0);
      case 'string':
      default:
        return String(value);
    }
  }

  private parseDuration(value: any): number {
    if (typeof value === 'number') return value;
    const str = String(value);
    // Handle HH:MM:SS format
    const parts = str.split(':');
    if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    // Handle seconds as string
    return parseInt(str) || 0;
  }

  private parseDistance(value: any): number {
    if (typeof value === 'number') return value;
    const str = String(value).replace(/[^\d.]/g, '');
    const num = parseFloat(str);
    // Assume km if > 100, otherwise meters
    return num > 100 ? num * 1000 : num;
  }

  private parseNumber(value: any): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  }

  private async processFit(file: ManifestFile, corpusRoot: string): Promise<void> {
    // FIT file processing is optional in MVP
    // This would require a FIT file parser library
    console.log(`FIT processing not yet implemented: ${file.path}`);
  }

  async recomputeDerived(corpusRoot: string): Promise<void> {
    console.log('Recomputing derived datasets...');
    
    try {
      // Read activities
      const activitiesPath = path.join(corpusRoot, 'canonical', 'activities.parquet');
      if (!fs.existsSync(activitiesPath)) {
        console.log('No activities.parquet found, skipping derived computation');
        return;
      }

      // Read vitals
      const vitalsPath = path.join(corpusRoot, 'canonical', 'vitals_daily.parquet');
      const hasVitals = fs.existsSync(vitalsPath);

      // Read sleep
      const sleepPath = path.join(corpusRoot, 'canonical', 'sleep_daily.parquet');
      const hasSleep = fs.existsSync(sleepPath);

      // Compute rolling summary
      const rollingSummary = await this.computeRollingSummary(activitiesPath, vitalsPath, sleepPath, hasVitals, hasSleep);
      await this.parquetWriter.writeDerivedTable('rolling_summary', rollingSummary);

      // Compute today brief
      const todayBrief = await this.computeTodayBrief(rollingSummary, vitalsPath, sleepPath, hasVitals, hasSleep);
      await this.parquetWriter.writeDerivedTable('today_brief', [todayBrief]);

      console.log('Derived datasets recomputed');
    } catch (error: any) {
      console.error('Error recomputing derived datasets:', error);
      throw error;
    }
  }

  private async computeRollingSummary(
    activitiesPath: string,
    vitalsPath: string | null,
    sleepPath: string | null,
    hasVitals: boolean,
    hasSleep: boolean,
  ): Promise<any[]> {
    // Read activities using parquetjs
    let activities: any[] = [];
    
    try {
      const reader = await ParquetReader.openFile(activitiesPath);
      const cursor = reader.getCursor();
      let row = await cursor.next();
      while (row) {
        activities.push(row);
        row = await cursor.next();
      }
      await reader.close();
    } catch (error) {
      console.warn(`Could not read activities from ${activitiesPath}:`, error);
      return [];
    }

    // Sort by start_time_utc
    activities.sort((a, b) => {
      const dateA = a.start_time_utc || '';
      const dateB = b.start_time_utc || '';
      return dateA.localeCompare(dateB);
    });

    if (activities.length === 0) {
      return [];
    }

    // Group by date
    const byDate = new Map<string, any[]>();
    for (const activity of activities) {
      const date = activity.start_time_utc.split('T')[0];
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(activity);
    }

    const dates = Array.from(byDate.keys()).sort();
    const rollingSummary: any[] = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const dateIndex = dates.indexOf(date);
      
      // Get activities in rolling windows
      const date7d = dates.slice(Math.max(0, dateIndex - 6), dateIndex + 1);
      const date28d = dates.slice(Math.max(0, dateIndex - 27), dateIndex + 1);
      const date90d = dates.slice(Math.max(0, dateIndex - 89), dateIndex + 1);

      const activities7d = date7d.flatMap(d => byDate.get(d) || []);
      const activities28d = date28d.flatMap(d => byDate.get(d) || []);
      const activities90d = date90d.flatMap(d => byDate.get(d) || []);

      const tss7d = activities7d.reduce((sum, a) => sum + (a.tss || 0), 0);
      const tss28d = activities28d.reduce((sum, a) => sum + (a.tss || 0), 0);
      const tss90d = activities90d.reduce((sum, a) => sum + (a.tss || 0), 0);

      const duration7dS = activities7d.reduce((sum, a) => sum + (a.duration_s || 0), 0);
      const duration28dS = activities28d.reduce((sum, a) => sum + (a.duration_s || 0), 0);
      const duration90dS = activities90d.reduce((sum, a) => sum + (a.duration_s || 0), 0);

      // Compute trend
      let loadTrend: 'up' | 'down' | 'flat' = 'flat';
      if (dateIndex > 0) {
        const prevTss7d = rollingSummary[rollingSummary.length - 1]?.tss_7d || 0;
        if (tss7d > prevTss7d * 1.1) loadTrend = 'up';
        else if (tss7d < prevTss7d * 0.9) loadTrend = 'down';
      }

      // Get vitals baseline if available
      let baselineHrv28d: number | undefined;
      let baselineRhr28d: number | undefined;
      if (hasVitals && vitalsPath) {
        try {
          const reader = await ParquetReader.openFile(vitalsPath);
          const cursor = reader.getCursor();
          const allVitals: any[] = [];
          let row = await cursor.next();
          while (row) {
            allVitals.push(row);
            row = await cursor.next();
          }
          await reader.close();
          
          // Filter vitals by date and get last 28 days
          const vitals = allVitals
            .filter(v => v.date && v.date <= date)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 28);
          
          const hrvValues = vitals.map(v => v.hrv_ms).filter(v => v != null);
          const rhrValues = vitals.map(v => v.resting_hr_bpm).filter(v => v != null);
          if (hrvValues.length > 0) {
            baselineHrv28d = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
          }
          if (rhrValues.length > 0) {
            baselineRhr28d = rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length;
          }
        } catch (error) {
          // Ignore vitals errors
        }
      }

      rollingSummary.push({
        date,
        tss_7d: tss7d,
        tss_28d: tss28d,
        tss_90d: tss90d,
        duration_7d_s: duration7dS,
        duration_28d_s: duration28dS,
        duration_90d_s: duration90dS,
        load_trend: loadTrend,
        baseline_hrv_28d: baselineHrv28d,
        baseline_rhr_28d: baselineRhr28d,
        baseline_sleep_28d: undefined,
        hrv_delta: undefined,
        rhr_delta: undefined,
        sleep_debt_min: undefined,
        overreach_risk: tss7d > 600,
        injury_risk: false,
        fatigue_risk: tss7d > 500 && duration7dS > 10 * 3600,
      });
    }

    return rollingSummary;
  }

  private async computeTodayBrief(
    rollingSummary: any[],
    vitalsPath: string | null,
    sleepPath: string | null,
    hasVitals: boolean,
    hasSleep: boolean,
  ): Promise<any> {
    const today = new Date().toISOString().split('T')[0];
    const todaySummary = rollingSummary.find(r => r.date === today) || rollingSummary[rollingSummary.length - 1];

    if (!todaySummary) {
      return {
        date: today,
        recovery_status: 'unknown',
        hrv_delta: null,
        rhr_delta: null,
        sleep_debt_min: null,
        tss_7d: 0,
        tss_28d: 0,
        tss_90d: 0,
        load_trend: 'flat',
        recommendation_type: 'rest',
        recommendation_notes: JSON.stringify(['No data available']),
        flags: JSON.stringify([]),
      };
    }

    // Determine recovery status
    let recoveryStatus: 'green' | 'yellow' | 'red' = 'green';
    const flags: any[] = [];

    if (todaySummary.overreach_risk) {
      recoveryStatus = 'red';
      flags.push({ code: 'OVERREACH', severity: 'high', reason: 'High training load detected' });
    } else if (todaySummary.fatigue_risk) {
      recoveryStatus = 'yellow';
      flags.push({ code: 'FATIGUE', severity: 'medium', reason: 'Elevated fatigue risk' });
    }

    // Determine recommendation
    let recommendationType: 'rest' | 'easy' | 'moderate' | 'intensity' = 'easy';
    const recommendationNotes: string[] = [];

    if (recoveryStatus === 'red') {
      recommendationType = 'rest';
      recommendationNotes.push('High training load - consider rest day');
    } else if (todaySummary.tss_7d < 200) {
      recommendationType = 'moderate';
      recommendationNotes.push('Low training load - can increase intensity');
    } else if (todaySummary.tss_7d > 400) {
      recommendationType = 'easy';
      recommendationNotes.push('Moderate training load - maintain or reduce');
    }

    return {
      date: today,
      recovery_status: recoveryStatus,
      hrv_delta: todaySummary.hrv_delta,
      rhr_delta: todaySummary.rhr_delta,
      sleep_debt_min: todaySummary.sleep_debt_min,
      tss_7d: todaySummary.tss_7d,
      tss_28d: todaySummary.tss_28d,
      tss_90d: todaySummary.tss_90d,
      load_trend: todaySummary.load_trend,
      recommendation_type: recommendationType,
      recommendation_notes: JSON.stringify(recommendationNotes),
      flags: JSON.stringify(flags),
    };
  }

  async syncFromFitnessSyncer(accessToken: string): Promise<void> {
    console.log('Syncing data from FitnessSyncer...');

    try {
      // Fetch vitals (blood pressure only)
      const vitals = await this.fitnessSyncer.getVitals(accessToken);
      const bpVitals = vitals.filter((v: any) =>
        v.sourceType === 'BloodPressure' || v.systolic || v.diastolic,
      );
      const canonicalVitals = bpVitals.map((v: any) => ({
        date: v.date?.split('T')[0] || new Date().toISOString().split('T')[0],
        systolic_bp: v.systolic,
        diastolic_bp: v.diastolic,
        source: 'fitnesssyncer',
      }));
      await this.parquetWriter.appendCanonicalTable('vitals_daily', canonicalVitals);

      console.log(`Synced ${bpVitals.length} blood pressure records`);
    } catch (error: any) {
      console.error('Error syncing from FitnessSyncer:', error);
      throw error;
    }
  }
}

