import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DuckdbService } from '../duckdb/duckdb.service';
import * as fs from 'fs';
import * as path from 'path';

export interface VitalsDaily {
  date: string;
  resting_hr_bpm?: number;
  hrv_ms?: number;
  body_temp_c?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  source: string;
}

export interface SleepDaily {
  date: string;
  sleep_total_min?: number;
  rem_min?: number;
  deep_min?: number;
  wake_min?: number;
  efficiency_pct?: number;
  awakenings?: number;
  source: string;
}

export interface BodyMetrics {
  date: string;
  weight_kg?: number;
  body_fat_pct?: number;
  fat_free_mass_kg?: number;
  muscle_mass_kg?: number;
  bone_mass_kg?: number;
  body_water_kg?: number;
  source: string;
}

export interface FormScoreDaily {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

@Injectable()
export class MetricsService {
  private corpusRoot: string;

  constructor(
    private duckdbService: DuckdbService,
    private configService: ConfigService,
  ) {
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', '/data/corpus');
  }

  async getVitals(from?: string, to?: string, userId = 'default'): Promise<VitalsDaily[]> {
    try {
      // Try CSV first, fallback to DuckDB/Parquet
      const csvPath = path.join(this.corpusRoot, userId, 'canonical', 'vitals_daily.csv');
      let results: VitalsDaily[] = [];
      
      if (fs.existsSync(csvPath)) {
        results = this.readVitalsFromCSV(csvPath);
      } else if (this.duckdbService.isDuckDBAvailable()) {
        let where = '1=1';
        if (from) where += ` AND date >= '${from}'`;
        if (to) where += ` AND date <= '${to}'`;
        
        results = await this.duckdbService.queryCanonical<VitalsDaily>(
          'vitals_daily',
          where,
          'date DESC',
        );
      }

      // Merge FitnessSyncer blood pressure if available
      const bpPath = path.join(this.corpusRoot, userId, 'canonical', 'vitals_bp.csv');
      if (fs.existsSync(bpPath)) {
        const bpRows = this.readVitalsFromCSV(bpPath);
        const vitalsByDate = new Map(results.map((row) => [row.date, row]));
        bpRows.forEach((bp) => {
          if (!bp.date) return;
          const existing = vitalsByDate.get(bp.date);
          if (existing) {
            if (bp.systolic_bp !== undefined) existing.systolic_bp = bp.systolic_bp;
            if (bp.diastolic_bp !== undefined) existing.diastolic_bp = bp.diastolic_bp;
          } else {
            results.push(bp);
            vitalsByDate.set(bp.date, bp);
          }
        });
      }

      // Apply filters
      if (from) {
        results = results.filter(v => v.date >= from);
      }
      if (to) {
        results = results.filter(v => v.date <= to);
      }

      // Sort by date DESC
      results.sort((a, b) => b.date.localeCompare(a.date));

      // Merge in Garmin HRV if available (fallback for days missing HRV from intervals.icu)
      const garminHrvPath = path.join(this.corpusRoot, userId, 'metadata', 'hrv_garmin.csv');
      if (fs.existsSync(garminHrvPath)) {
        const garminHrv = this.readGarminHrvFromCSV(garminHrvPath);
        const hrvByDate = new Map<string, number>();
        garminHrv.forEach((row) => {
          if (row.date && row.hrv_ms !== undefined) {
            hrvByDate.set(row.date, row.hrv_ms);
          }
        });

        results.forEach((row) => {
          if (row.hrv_ms === undefined) {
            const hrv = hrvByDate.get(row.date);
            if (hrv !== undefined) {
              row.hrv_ms = hrv;
            }
          }
        });

        const existingDates = new Set(results.map((r) => r.date));
        for (const [date, hrv] of hrvByDate.entries()) {
          if (!existingDates.has(date)) {
            results.push({ date, hrv_ms: hrv, source: 'garmin' });
          }
        }

        results.sort((a, b) => b.date.localeCompare(a.date));
      }

      return results;
    } catch (error) {
      console.error('Error fetching vitals:', error);
      return [];
    }
  }

  async getSleep(from?: string, to?: string, userId = 'default'): Promise<SleepDaily[]> {
    try {
      // Try CSV first, fallback to DuckDB/Parquet
      const csvPath = path.join(this.corpusRoot, userId, 'canonical', 'sleep_daily.csv');
      let results: SleepDaily[] = [];
      
      if (fs.existsSync(csvPath)) {
        results = this.readSleepFromCSV(csvPath);
      } else if (this.duckdbService.isDuckDBAvailable()) {
        let where = '1=1';
        if (from) where += ` AND date >= '${from}'`;
        if (to) where += ` AND date <= '${to}'`;
        
        results = await this.duckdbService.queryCanonical<SleepDaily>(
          'sleep_daily',
          where,
          'date DESC',
        );
      }

      // Apply filters
      if (from) {
        results = results.filter(s => s.date >= from);
      }
      if (to) {
        results = results.filter(s => s.date <= to);
      }

      // Sort by date DESC
      results.sort((a, b) => b.date.localeCompare(a.date));

      return results;
    } catch (error) {
      console.error('Error fetching sleep:', error);
      return [];
    }
  }

  async getBodyMetrics(from?: string, to?: string, userId = 'default'): Promise<BodyMetrics[]> {
    try {
      // Try CSV first, fallback to DuckDB/Parquet
      const csvPath = path.join(this.corpusRoot, userId, 'canonical', 'body_metrics.csv');
      let results: BodyMetrics[] = [];
      
      if (fs.existsSync(csvPath)) {
        results = this.readBodyMetricsFromCSV(csvPath);
      } else if (this.duckdbService.isDuckDBAvailable()) {
        let where = '1=1';
        if (from) where += ` AND date >= '${from}'`;
        if (to) where += ` AND date <= '${to}'`;
        
        results = await this.duckdbService.queryCanonical<BodyMetrics>(
          'body_metrics',
          where,
          'date DESC',
        );
      }

      // Apply filters
      if (from) {
        results = results.filter(b => b.date >= from);
      }
      if (to) {
        results = results.filter(b => b.date <= to);
      }

      // Sort by date DESC
      results.sort((a, b) => b.date.localeCompare(a.date));

      return results;
    } catch (error) {
      console.error('Error fetching body metrics:', error);
      return [];
    }
  }

  async getFormScores(from?: string, to?: string, userId = 'default'): Promise<FormScoreDaily[]> {
    try {
      // Prefer wellness-sourced fitness_daily.csv (has official CTL/ATL/TSB from Intervals.icu,
      // including rest days and post-last-activity decay)
      const fitnessCsvPath = path.join(this.corpusRoot, userId, 'canonical', 'fitness_daily.csv');
      if (fs.existsSync(fitnessCsvPath)) {
        const rows = this.readFitnessDailyFromCSV(fitnessCsvPath);
        if (rows.length > 0) {
          return rows.filter(row => {
            if (from && row.date < from) return false;
            if (to && row.date > to) return false;
            return true;
          });
        }
      }

      // Fallback: derive from activity TSS (stops at last activity date)
      const csvPath = path.join(this.corpusRoot, userId, 'canonical', 'activities.csv');
      if (!fs.existsSync(csvPath)) return [];

      const dailyTss = this.readDailyTssFromActivitiesCSV(csvPath);
      if (dailyTss.size === 0) return [];

      const allDates = [...dailyTss.keys()].sort();
      const startDate = allDates[0];
      const endDate = allDates[allDates.length - 1];

      const results: FormScoreDaily[] = [];
      let ctl = dailyTss.get(startDate) ?? 0;
      let atl = dailyTss.get(startDate) ?? 0;

      for (let date = startDate; date <= endDate; date = this.addDays(date, 1)) {
        const tss = dailyTss.get(date) ?? 0;
        if (date !== startDate) {
          ctl = ctl + (tss - ctl) / 42;
          atl = atl + (tss - atl) / 7;
        }
        results.push({
          date,
          tss,
          ctl,
          atl,
          tsb: ctl - atl,
        });
      }

      return results.filter(row => {
        if (from && row.date < from) return false;
        if (to && row.date > to) return false;
        return true;
      });
    } catch (error) {
      console.error('Error computing form scores:', error);
      return [];
    }
  }

  private readFitnessDailyFromCSV(csvPath: string): FormScoreDaily[] {
    try {
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n');
      if (lines.length < 2) return [];
      const headers = lines[0].split(',').map(h => h.trim());
      const dateIdx = headers.indexOf('date');
      const ctlIdx = headers.indexOf('ctl');
      const atlIdx = headers.indexOf('atl');
      const tsbIdx = headers.indexOf('tsb');
      if (dateIdx === -1 || ctlIdx === -1) return [];
      const results: FormScoreDaily[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const date = values[dateIdx]?.trim();
        const ctl = parseFloat(values[ctlIdx] ?? '');
        const atl = parseFloat(values[atlIdx] ?? '');
        const tsb = tsbIdx !== -1 ? parseFloat(values[tsbIdx] ?? '') : ctl - atl;
        if (!date || !Number.isFinite(ctl)) continue;
        results.push({ date, tss: 0, ctl, atl: Number.isFinite(atl) ? atl : 0, tsb: Number.isFinite(tsb) ? tsb : ctl - atl });
      }
      return results.sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  private readSleepFromCSV(csvPath: string): SleepDaily[] {
    try {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map(h => h.trim());
      const sleep: SleepDaily[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const record: any = {};
        
        headers.forEach((header, idx) => {
          const value = values[idx]?.trim() || '';
          // Convert numeric fields
          if (['sleep_total_min', 'rem_min', 'deep_min', 'wake_min', 'efficiency_pct', 'awakenings'].includes(header)) {
            record[header] = value ? parseFloat(value) : undefined;
          } else {
            record[header] = value || undefined;
          }
        });

        sleep.push(record as SleepDaily);
      }

      return sleep;
    } catch (error) {
      console.error('Error reading sleep CSV:', error);
      return [];
    }
  }

  private readVitalsFromCSV(csvPath: string): VitalsDaily[] {
    try {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map(h => h.trim());
      const vitals: VitalsDaily[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const record: any = {};
        
        headers.forEach((header, idx) => {
          const value = values[idx]?.trim() || '';
          // Convert numeric fields
          if (['resting_hr_bpm', 'hrv_ms', 'body_temp_c', 'systolic_bp', 'diastolic_bp'].includes(header)) {
            record[header] = value ? parseFloat(value) : undefined;
          } else {
            record[header] = value || undefined;
          }
        });

        vitals.push(record as VitalsDaily);
      }

      return vitals;
    } catch (error) {
      console.error('Error reading vitals CSV:', error);
      return [];
    }
  }

  private readBodyMetricsFromCSV(csvPath: string): BodyMetrics[] {
    try {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map(h => h.trim());
      const bodyMetrics: BodyMetrics[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const record: any = {};
        
        headers.forEach((header, idx) => {
          const value = values[idx]?.trim() || '';
          // Convert numeric fields
          if (['weight_kg', 'body_fat_pct', 'fat_free_mass_kg', 'muscle_mass_kg', 'bone_mass_kg', 'body_water_kg'].includes(header)) {
            record[header] = value ? parseFloat(value) : undefined;
          } else {
            record[header] = value || undefined;
          }
        });

        bodyMetrics.push(record as BodyMetrics);
      }

      return bodyMetrics;
    } catch (error) {
      console.error('Error reading body metrics CSV:', error);
      return [];
    }
  }

  private readGarminHrvFromCSV(csvPath: string): Array<{ date: string; hrv_ms: number }> {
    try {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map((h) => h.trim());
      const rows: Array<{ date: string; hrv_ms: number }> = [];

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const record: any = {};

        headers.forEach((header, idx) => {
          const value = values[idx]?.trim() || '';
          if (header === 'hrv_ms') {
            record[header] = value ? parseFloat(value) : undefined;
          } else {
            record[header] = value || undefined;
          }
        });

        if (record.date && record.hrv_ms !== undefined) {
          rows.push({ date: record.date, hrv_ms: record.hrv_ms });
        }
      }

      return rows;
    } catch (error) {
      console.error('Error reading Garmin HRV CSV:', error);
      return [];
    }
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private parseTimestampValue(value: string): number | undefined {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return numeric;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Math.floor(parsed.getTime() / 1000);
    }
    return undefined;
  }

  private readDailyTssFromActivitiesCSV(csvPath: string): Map<string, number> {
    const dailyTss = new Map<string, number>();
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return dailyTss;

    const headers = lines[0].split(',').map(h => h.trim());
    const startIdx = headers.indexOf('start_time_utc');
    const tssIdx = headers.indexOf('tss');
    if (startIdx === -1 || tssIdx === -1) return dailyTss;

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const startTime = values[startIdx]?.trim();
      if (!startTime || startTime.length < 10) continue;
      const date = startTime.slice(0, 10);
      const tssValue = parseFloat(values[tssIdx] ?? '');
      if (!Number.isFinite(tssValue)) continue;
      dailyTss.set(date, (dailyTss.get(date) ?? 0) + tssValue);
    }

    return dailyTss;
  }

  private addDays(date: string, days: number): string {
    const [year, month, day] = date.split('-').map(part => parseInt(part, 10));
    const current = new Date(Date.UTC(year, month - 1, day));
    current.setUTCDate(current.getUTCDate() + days);
    return current.toISOString().slice(0, 10);
  }
}

