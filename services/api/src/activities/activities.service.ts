import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DuckdbService } from '../duckdb/duckdb.service';
import * as fs from 'fs';
import * as path from 'path';

export interface Activity {
  activity_id: string;
  start_time_utc: string;
  sport: string;
  duration_s: number;
  distance_m?: number;
  tss?: number;
  aerobic_te?: number;
  anaerobic_te?: number;
  training_effect_label?: string;
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

export interface ActivityStream {
  activity_id: string;
  ts_utc: string;
  hr_bpm?: number;
  power_w?: number;
  cadence_rpm?: number;
  speed_mps?: number;
  lat?: number;
  lon?: number;
  alt_m?: number;
}

export interface ActivityQuery {
  from?: string;
  to?: string;
  sport?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class ActivitiesService {
  private corpusRoot: string;

  constructor(
    private duckdbService: DuckdbService,
    private configService: ConfigService,
  ) {
    const defaultRoot = path.join(process.cwd(), 'data', 'corpus');
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', defaultRoot);
  }

  async findActivities(query: ActivityQuery, userId = 'default'): Promise<{
    activities: Activity[];
    nextCursor?: string;
  }> {
    const limit = query.limit || 50;

    try {
      // Try CSV first, fallback to DuckDB
      let results: Activity[] = [];
      
      const csvPath = path.join(this.corpusRoot, userId, 'canonical', 'activities.csv');
      if (fs.existsSync(csvPath)) {
        results = this.readActivitiesFromCSV(csvPath);
      } else if (this.duckdbService.isDuckDBAvailable()) {
        let whereClause = '1=1';
        if (query.from) {
          whereClause += ` AND start_time_utc >= '${query.from}'`;
        }
        if (query.to) {
          whereClause += ` AND start_time_utc <= '${query.to}'`;
        }
        if (query.sport) {
          whereClause += ` AND sport = '${query.sport}'`;
        }
        results = await this.duckdbService.queryCanonical<Activity>(
          'activities',
          whereClause,
          'start_time_utc DESC',
        );
      }

      // Apply filters — normalise both sides to comparable ISO strings
      if (query.from) {
        const fromTs = query.from.length === 10 ? query.from + 'T00:00:00Z' : query.from;
        results = results.filter(a => {
          const ts = a.start_time_utc.length === 10 ? a.start_time_utc + 'T00:00:00Z' : a.start_time_utc;
          return ts >= fromTs;
        });
      }
      if (query.to) {
        const toTs = query.to.length === 10 ? query.to + 'T23:59:59Z' : query.to;
        results = results.filter(a => {
          const ts = a.start_time_utc.length === 10 ? a.start_time_utc + 'T23:59:59Z' : a.start_time_utc;
          return ts <= toTs;
        });
      }
      if (query.sport) {
        results = results.filter(a => a.sport === query.sport);
      }

      // Sort by start_time_utc DESC
      results.sort((a, b) => 
        new Date(b.start_time_utc).getTime() - new Date(a.start_time_utc).getTime()
      );

      const hasMore = results.length > limit;
      const activities = hasMore ? results.slice(0, limit) : results;

      let nextCursor: string | undefined;
      if (hasMore && activities.length > 0) {
        nextCursor = Buffer.from(
          JSON.stringify({
            lastId: activities[activities.length - 1].activity_id,
            lastTime: activities[activities.length - 1].start_time_utc,
          }),
        ).toString('base64');
      }

      return { activities, nextCursor };
    } catch (error) {
      console.error('Error fetching activities:', error);
      return { activities: [] };
    }
  }

  async findOne(activityId: string, userId = 'default'): Promise<Activity | null> {
    try {
      const csvPath = path.join(this.corpusRoot, userId, 'canonical', 'activities.csv');
      if (fs.existsSync(csvPath)) {
        const activities = this.readActivitiesFromCSV(csvPath);
        return activities.find(a => a.activity_id === activityId) || null;
      } else if (this.duckdbService.isDuckDBAvailable()) {
        const results = await this.duckdbService.queryCanonical<Activity>(
          'activities',
          `activity_id = '${activityId}'`,
        );
        return results.length > 0 ? results[0] : null;
      }
      return null;
    } catch (error) {
      console.error('Error fetching activity:', error);
      return null;
    }
  }

  private readActivitiesFromCSV(csvPath: string): Activity[] {
    try {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map(h => h.trim());
      const activities: Activity[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const activity: any = {};
        
        headers.forEach((header, idx) => {
          const value = values[idx]?.trim() || '';
          // Convert numeric fields
          if (['duration_s', 'distance_m', 'tss', 'aerobic_te', 'anaerobic_te', 'avg_hr_bpm', 'max_hr_bpm', 'avg_power_w', 'np_watts', 'if'].includes(header)) {
            activity[header] = value ? parseFloat(value) : undefined;
          } 
          // Parse JSON fields
          else if (['icu_hr_zones', 'icu_hr_zone_times', 'icu_power_zones', 'icu_zone_times', 'pace_zones', 'pace_zone_times', 'gap_zone_times', 'power_field_names', 'tags', 'attachments', 'interval_summary', 'icu_achievements', 'stream_types'].includes(header)) {
            try {
              activity[header] = value ? JSON.parse(value) : undefined;
            } catch {
              activity[header] = value || undefined;
            }
          } 
          else {
            activity[header] = value || undefined;
          }
        });

        activities.push(activity as Activity);
      }

      return activities;
    } catch (error) {
      console.error('Error reading CSV:', error);
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
          i++;
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

  async getStreams(
    activityId: string,
    fields?: string[],
    downsample?: string,
  ): Promise<ActivityStream[]> {
    try {
      let sql = `SELECT * FROM read_parquet('${this.duckdbService.getCanonicalPath('activity_streams')}') WHERE activity_id = '${activityId}'`;
      
      if (fields && fields.length > 0) {
        const selectedFields = ['activity_id', 'ts_utc', ...fields].join(', ');
        sql = sql.replace('SELECT *', `SELECT ${selectedFields}`);
      }

      if (downsample) {
        // Parse downsample (e.g., "2s" -> 2 seconds)
        const match = downsample.match(/(\d+)(s|m|h)/);
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2];
          let intervalSeconds = value;
          if (unit === 'm') intervalSeconds = value * 60;
          if (unit === 'h') intervalSeconds = value * 3600;
          
          // DuckDB time_bucket for downsampling
          sql += ` ORDER BY ts_utc`;
          // Note: Full downsampling would require more complex SQL
          // For MVP, we'll return all data and let client downsample
        }
      } else {
        sql += ` ORDER BY ts_utc`;
      }

      return this.duckdbService.query<ActivityStream>(sql);
    } catch (error) {
      console.error('Error fetching streams:', error);
      return [];
    }
  }

  async getZoneSummary(userId = 'default'): Promise<{
    power: { ftp?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
    heartRate: { maxHr?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
  }> {
    if (!this.duckdbService.isDuckDBAvailable()) {
      const csvPath = path.join(this.corpusRoot, userId, 'canonical', 'activities.csv');
      if (!fs.existsSync(csvPath)) {
        return { power: null, heartRate: null };
      }
      const activities = this.readActivitiesFromCSV(csvPath);
      return this.buildZoneSummaryFromActivities(activities);
    }

    const activitiesPath = this.duckdbService.getCanonicalPath('activities');
    const streamsPath = this.duckdbService.getCanonicalPath('activity_streams');

    const [latestHrRow] = await this.duckdbService.query<{ max_hr_bpm: number }>(
      `SELECT max_hr_bpm FROM read_parquet('${activitiesPath}')
       WHERE max_hr_bpm IS NOT NULL AND max_hr_bpm > 0
       ORDER BY start_time_utc DESC
       LIMIT 1`,
    );
    const maxHr = latestHrRow?.max_hr_bpm ? Number(latestHrRow.max_hr_bpm) : undefined;

    const [latestPowerRow] = await this.duckdbService.query<{ np_watts: number; if_value: number }>(
      `SELECT np_watts, "if" AS if_value FROM read_parquet('${activitiesPath}')
       WHERE np_watts IS NOT NULL AND np_watts > 0 AND "if" IS NOT NULL AND "if" > 0
       ORDER BY start_time_utc DESC
       LIMIT 1`,
    );
    let ftp =
      latestPowerRow?.np_watts && latestPowerRow?.if_value
        ? Number(latestPowerRow.np_watts) / Number(latestPowerRow.if_value)
        : undefined;
    if (!ftp) {
      const [avgPowerRow] = await this.duckdbService.query<{ max_avg_power_w: number }>(
        `SELECT MAX(avg_power_w) AS max_avg_power_w FROM read_parquet('${activitiesPath}')
         WHERE avg_power_w IS NOT NULL AND avg_power_w > 0`,
      );
      if (avgPowerRow?.max_avg_power_w) {
        ftp = Number(avgPowerRow.max_avg_power_w);
      }
    }

    const hrCounts = await this.duckdbService.query<{ zone: string; count: number }>(
      `WITH stream AS (
         SELECT activity_id, hr_bpm
         FROM read_parquet('${streamsPath}')
         WHERE hr_bpm IS NOT NULL AND hr_bpm > 0
       ),
       act AS (
         SELECT activity_id, max_hr_bpm
         FROM read_parquet('${activitiesPath}')
         WHERE max_hr_bpm IS NOT NULL AND max_hr_bpm > 0
       ),
       joined AS (
         SELECT hr_bpm / max_hr_bpm AS ratio
         FROM stream
         JOIN act USING (activity_id)
       )
       SELECT
         CASE
           WHEN ratio < 0.6 THEN 'Z1'
           WHEN ratio < 0.7 THEN 'Z2'
           WHEN ratio < 0.8 THEN 'Z3'
           WHEN ratio < 0.9 THEN 'Z4'
           ELSE 'Z5'
         END AS zone,
         COUNT(*) AS count
       FROM joined
       GROUP BY zone`,
    );

    const powerCounts = await this.duckdbService.query<{ zone: string; count: number }>(
      `WITH stream AS (
         SELECT activity_id, power_w
         FROM read_parquet('${streamsPath}')
         WHERE power_w IS NOT NULL AND power_w > 0
       ),
       act AS (
         SELECT activity_id, np_watts, "if" AS if_value
         FROM read_parquet('${activitiesPath}')
         WHERE np_watts IS NOT NULL AND np_watts > 0 AND "if" IS NOT NULL AND "if" > 0
       ),
       joined AS (
         SELECT power_w / (np_watts / if_value) AS ratio
         FROM stream
         JOIN act USING (activity_id)
       )
       SELECT
         CASE
           WHEN ratio < 0.55 THEN 'Z1'
           WHEN ratio < 0.75 THEN 'Z2'
           WHEN ratio < 0.9 THEN 'Z3'
           WHEN ratio < 1.05 THEN 'Z4'
           WHEN ratio < 1.2 THEN 'Z5'
           WHEN ratio < 1.5 THEN 'Z6'
           ELSE 'Z7'
         END AS zone,
         COUNT(*) AS count
       FROM joined
       GROUP BY zone`,
    );

    const hrCountsFinal =
      hrCounts.length > 0
        ? hrCounts
        : await this.duckdbService.query<{ zone: string; count: number }>(
            `SELECT
               CASE
                 WHEN avg_hr_bpm / max_hr_bpm < 0.6 THEN 'Z1'
                 WHEN avg_hr_bpm / max_hr_bpm < 0.7 THEN 'Z2'
                 WHEN avg_hr_bpm / max_hr_bpm < 0.8 THEN 'Z3'
                 WHEN avg_hr_bpm / max_hr_bpm < 0.9 THEN 'Z4'
                 ELSE 'Z5'
               END AS zone,
               SUM(duration_s) AS count
             FROM read_parquet('${activitiesPath}')
             WHERE avg_hr_bpm IS NOT NULL
               AND max_hr_bpm IS NOT NULL
               AND max_hr_bpm > 0
               AND duration_s IS NOT NULL
               AND duration_s > 0
             GROUP BY zone`,
          );

    const powerCountsFinal =
      powerCounts.length > 0 || !ftp
        ? powerCounts
        : await this.duckdbService.query<{ zone: string; count: number }>(
            `SELECT
               CASE
                 WHEN avg_power_w / ${ftp} < 0.55 THEN 'Z1'
                 WHEN avg_power_w / ${ftp} < 0.75 THEN 'Z2'
                 WHEN avg_power_w / ${ftp} < 0.9 THEN 'Z3'
                 WHEN avg_power_w / ${ftp} < 1.05 THEN 'Z4'
                 WHEN avg_power_w / ${ftp} < 1.2 THEN 'Z5'
                 WHEN avg_power_w / ${ftp} < 1.5 THEN 'Z6'
                 ELSE 'Z7'
               END AS zone,
               SUM(duration_s) AS count
             FROM read_parquet('${activitiesPath}')
             WHERE avg_power_w IS NOT NULL
               AND avg_power_w > 0
               AND duration_s IS NOT NULL
               AND duration_s > 0
             GROUP BY zone`,
          );

    const hrZoneDefs = [
      { label: 'Z1', min: 0.0, max: 0.6 },
      { label: 'Z2', min: 0.6, max: 0.7 },
      { label: 'Z3', min: 0.7, max: 0.8 },
      { label: 'Z4', min: 0.8, max: 0.9 },
      { label: 'Z5', min: 0.9, max: 10 },
    ];

    const powerZoneDefs = [
      { label: 'Z1', min: 0.0, max: 0.55 },
      { label: 'Z2', min: 0.55, max: 0.75 },
      { label: 'Z3', min: 0.75, max: 0.9 },
      { label: 'Z4', min: 0.9, max: 1.05 },
      { label: 'Z5', min: 1.05, max: 1.2 },
      { label: 'Z6', min: 1.2, max: 1.5 },
      { label: 'Z7', min: 1.5, max: 10 },
    ];

    const hrZones = this.buildZoneSummary(
      ['Z5', 'Z4', 'Z3', 'Z2', 'Z1'],
      hrCountsFinal,
      maxHr,
      hrZoneDefs,
      'bpm',
    );

    const powerZones = this.buildZoneSummary(
      ['Z7', 'Z6', 'Z5', 'Z4', 'Z3', 'Z2', 'Z1'],
      powerCountsFinal,
      ftp,
      powerZoneDefs,
      'w',
    );

    return {
      power: powerZones ? { ftp: ftp ? Math.round(ftp) : undefined, zones: powerZones.zones } : null,
      heartRate: hrZones ? { maxHr: maxHr ? Math.round(maxHr) : undefined, zones: hrZones.zones } : null,
    };
  }

  async getLatestActivityZoneSummary(userId = 'default'): Promise<{
    activity: { id: string; name?: string; sport?: string; startTimeUtc?: string } | null;
    power: { ftp?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
    heartRate: { maxHr?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
  }> {
    if (!this.duckdbService.isDuckDBAvailable()) {
      const csvPath = path.join(this.corpusRoot, userId, 'canonical', 'activities.csv');
      if (!fs.existsSync(csvPath)) {
        return { activity: null, power: null, heartRate: null };
      }
      const activities = this.readActivitiesFromCSV(csvPath);
      if (!activities || activities.length === 0) {
        return { activity: null, power: null, heartRate: null };
      }
      
      // Sort by date (newest first)
      const sorted = [...activities].sort(
        (a, b) => new Date(b.start_time_utc).getTime() - new Date(a.start_time_utc).getTime(),
      );
      
      // Prefer activities with intervals.icu zone data (icu_hr_zone_times or icu_zone_times)
      // within the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentActivities = sorted.filter(
        (a) => new Date(a.start_time_utc).getTime() >= thirtyDaysAgo.getTime()
      );
      
      const activityWithZones = recentActivities.find((a) => {
        const data = a as any;
        // Check if zone times exist (can be string or array after JSON parsing)
        const hasHrZones = data.icu_hr_zone_times && 
          (Array.isArray(data.icu_hr_zone_times) ? data.icu_hr_zone_times.length > 0 : 
           (typeof data.icu_hr_zone_times === 'string' && data.icu_hr_zone_times.trim() !== ''));
        const hasPowerZones = data.icu_zone_times && 
          (Array.isArray(data.icu_zone_times) ? data.icu_zone_times.length > 0 : 
           (typeof data.icu_zone_times === 'string' && data.icu_zone_times.trim() !== ''));
        return hasHrZones || hasPowerZones;
      });
      
      // Use activity with zone data if found, otherwise use the absolute latest
      const latest = activityWithZones || sorted[0];
      const summary = this.buildZoneSummaryFromActivity(latest);
      return {
        activity: {
          id: latest.activity_id,
          name: (latest as any).name,
          sport: latest.sport,
          startTimeUtc: latest.start_time_utc,
        },
        ...summary,
      };
    }

    const activitiesPath = this.duckdbService.getCanonicalPath('activities');
    const streamsPath = this.duckdbService.getCanonicalPath('activity_streams');
    const [latestActivity] = await this.duckdbService.query<{
      activity_id: string;
      name?: string;
      sport?: string;
      start_time_utc: string;
      duration_s?: number;
      avg_hr_bpm?: number;
      max_hr_bpm?: number;
      avg_power_w?: number;
      np_watts?: number;
      if_value?: number;
    }>(
      `SELECT activity_id, name, sport, start_time_utc, duration_s, avg_hr_bpm, max_hr_bpm, avg_power_w, np_watts, "if" AS if_value
       FROM read_parquet('${activitiesPath}')
       WHERE (max_hr_bpm IS NOT NULL AND max_hr_bpm > 0)
          OR (avg_power_w IS NOT NULL AND avg_power_w > 0)
          OR (np_watts IS NOT NULL AND np_watts > 0 AND "if" IS NOT NULL AND "if" > 0)
       ORDER BY start_time_utc DESC
       LIMIT 1`,
    );
    if (!latestActivity?.activity_id) {
      const [fallbackActivity] = await this.duckdbService.query<{
        activity_id: string;
        name?: string;
        sport?: string;
        start_time_utc: string;
        duration_s?: number;
        avg_hr_bpm?: number;
        max_hr_bpm?: number;
        avg_power_w?: number;
        np_watts?: number;
        if_value?: number;
      }>(
        `SELECT activity_id, name, sport, start_time_utc, duration_s, avg_hr_bpm, max_hr_bpm, avg_power_w, np_watts, "if" AS if_value
         FROM read_parquet('${activitiesPath}')
         ORDER BY start_time_utc DESC
         LIMIT 1`,
      );
      if (!fallbackActivity?.activity_id) {
        return { activity: null, power: null, heartRate: null };
      }
      return {
        activity: {
          id: fallbackActivity.activity_id,
          name: fallbackActivity.name,
          sport: fallbackActivity.sport,
          startTimeUtc: fallbackActivity.start_time_utc,
        },
        ...this.buildZoneSummaryFromActivity(fallbackActivity as unknown as Activity),
      };
    }

    const maxHr = latestActivity.max_hr_bpm ? Number(latestActivity.max_hr_bpm) : undefined;
    let ftp =
      latestActivity.np_watts && latestActivity.if_value
        ? Number(latestActivity.np_watts) / Number(latestActivity.if_value)
        : undefined;
    if (!ftp && latestActivity.avg_power_w) {
      ftp = Number(latestActivity.avg_power_w);
    }

    let hrCounts: Array<{ zone: string; count: number }> = [];
    if (maxHr) {
      hrCounts = await this.duckdbService.query<{ zone: string; count: number }>(
        `SELECT
           CASE
             WHEN hr_bpm / ${maxHr} < 0.6 THEN 'Z1'
             WHEN hr_bpm / ${maxHr} < 0.7 THEN 'Z2'
             WHEN hr_bpm / ${maxHr} < 0.8 THEN 'Z3'
             WHEN hr_bpm / ${maxHr} < 0.9 THEN 'Z4'
             ELSE 'Z5'
           END AS zone,
           COUNT(*) AS count
         FROM read_parquet('${streamsPath}')
         WHERE activity_id = '${latestActivity.activity_id}' AND hr_bpm IS NOT NULL AND hr_bpm > 0
         GROUP BY zone`,
      );
    }

    let powerCounts: Array<{ zone: string; count: number }> = [];
    if (ftp) {
      powerCounts = await this.duckdbService.query<{ zone: string; count: number }>(
        `SELECT
           CASE
             WHEN power_w / ${ftp} < 0.55 THEN 'Z1'
             WHEN power_w / ${ftp} < 0.75 THEN 'Z2'
             WHEN power_w / ${ftp} < 0.9 THEN 'Z3'
             WHEN power_w / ${ftp} < 1.05 THEN 'Z4'
             WHEN power_w / ${ftp} < 1.2 THEN 'Z5'
             WHEN power_w / ${ftp} < 1.5 THEN 'Z6'
             ELSE 'Z7'
           END AS zone,
           COUNT(*) AS count
         FROM read_parquet('${streamsPath}')
         WHERE activity_id = '${latestActivity.activity_id}' AND power_w IS NOT NULL AND power_w > 0
         GROUP BY zone`,
      );
    }

    const hrZoneDefs = [
      { label: 'Z1', min: 0.0, max: 0.6 },
      { label: 'Z2', min: 0.6, max: 0.7 },
      { label: 'Z3', min: 0.7, max: 0.8 },
      { label: 'Z4', min: 0.8, max: 0.9 },
      { label: 'Z5', min: 0.9, max: 10 },
    ];

    const powerZoneDefs = [
      { label: 'Z1', min: 0.0, max: 0.55 },
      { label: 'Z2', min: 0.55, max: 0.75 },
      { label: 'Z3', min: 0.75, max: 0.9 },
      { label: 'Z4', min: 0.9, max: 1.05 },
      { label: 'Z5', min: 1.05, max: 1.2 },
      { label: 'Z6', min: 1.2, max: 1.5 },
      { label: 'Z7', min: 1.5, max: 10 },
    ];

    const hrZones = this.buildZoneSummary(['Z5', 'Z4', 'Z3', 'Z2', 'Z1'], hrCounts, maxHr, hrZoneDefs, 'bpm');
    const powerZones = this.buildZoneSummary(
      ['Z7', 'Z6', 'Z5', 'Z4', 'Z3', 'Z2', 'Z1'],
      powerCounts,
      ftp,
      powerZoneDefs,
      'w',
    );

    return {
      activity: {
        id: latestActivity.activity_id,
        name: latestActivity.name,
        sport: latestActivity.sport,
        startTimeUtc: latestActivity.start_time_utc,
      },
      power: powerZones ? { ftp: ftp ? Math.round(ftp) : undefined, zones: powerZones.zones } : null,
      heartRate: hrZones ? { maxHr: maxHr ? Math.round(maxHr) : undefined, zones: hrZones.zones } : null,
    };
  }

  private buildZoneSummary(
    order: string[],
    counts: Array<{ zone: string; count: number }>,
    baseValue: number | undefined,
    ranges: Array<{ label: string; min: number; max: number }>,
    unit: 'bpm' | 'w',
  ): { zones: Array<{ label: string; pct: number; range: string }> } | null {
    if (!counts || counts.length === 0) {
      return baseValue ? { zones: this.buildEmptyZones(order, ranges, baseValue, unit) } : null;
    }
    const countMap = new Map(counts.map((row) => [row.zone, Number(row.count) || 0]));
    const total = Array.from(countMap.values()).reduce((sum, value) => sum + value, 0);
    const zones = order.map((label) => {
      const count = countMap.get(label) || 0;
      const pct = total > 0 ? (count / total) * 100 : 0;
      const range = this.formatZoneRange(label, ranges, baseValue, unit);
      return { label, pct, range };
    });
    return { zones };
  }

  private buildEmptyZones(
    order: string[],
    ranges: Array<{ label: string; min: number; max: number }>,
    baseValue: number,
    unit: 'bpm' | 'w',
  ) {
    return order.map((label) => ({
      label,
      pct: 0,
      range: this.formatZoneRange(label, ranges, baseValue, unit),
    }));
  }

  private formatZoneRange(
    label: string,
    ranges: Array<{ label: string; min: number; max: number }>,
    baseValue: number | undefined,
    unit: 'bpm' | 'w',
  ): string {
    const range = ranges.find((item) => item.label === label);
    if (!range) return 'n/a';
    
    // Detect if ranges are absolute values (>10) or fractions (<= 2.0)
    const isAbsolute = range.max > 10 || (range.min > 10);
    
    let min: number, max: number | string;
    if (isAbsolute) {
      // Already absolute values (e.g., 137, 145)
      min = Math.round(range.min);
      max = range.max >= 9999 ? `${Math.round(range.min)}+` : Math.round(range.max);
    } else {
      // Fraction values that need to be multiplied by baseValue
      if (!baseValue) return 'n/a';
      min = Math.round(range.min * baseValue);
      max = range.max >= 10 ? `${Math.round(baseValue)}+` : Math.round(range.max * baseValue);
    }
    
    const unitLabel = unit === 'w' ? 'W' : 'bpm';
    return `${min}-${max} ${unitLabel}`;
  }

  private buildZoneSummaryFromActivities(activities: Activity[]): {
    power: { ftp?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
    heartRate: { maxHr?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
  } {
    if (!activities || activities.length === 0) {
      return { power: null, heartRate: null };
    }

    const sorted = [...activities].sort(
      (a, b) => new Date(b.start_time_utc).getTime() - new Date(a.start_time_utc).getTime(),
    );
    const latestMaxHr = sorted.find((a) => a.max_hr_bpm && a.max_hr_bpm > 0)?.max_hr_bpm;
    const latestPower = sorted.find((a) => a.np_watts && a.if && a.np_watts > 0 && a.if > 0);
    let ftp = latestPower ? Number(latestPower.np_watts) / Number(latestPower.if) : undefined;
    if (!ftp) {
      const maxAvgPower = sorted.reduce((max, activity) => {
        const value = activity.avg_power_w ? Number(activity.avg_power_w) : 0;
        return value > max ? value : max;
      }, 0);
      if (maxAvgPower > 0) {
        ftp = maxAvgPower;
      }
    }

    const hrZoneDefs = [
      { label: 'Z1', min: 0.0, max: 0.6 },
      { label: 'Z2', min: 0.6, max: 0.7 },
      { label: 'Z3', min: 0.7, max: 0.8 },
      { label: 'Z4', min: 0.8, max: 0.9 },
      { label: 'Z5', min: 0.9, max: 10 },
    ];

    const powerZoneDefs = [
      { label: 'Z1', min: 0.0, max: 0.55 },
      { label: 'Z2', min: 0.55, max: 0.75 },
      { label: 'Z3', min: 0.75, max: 0.9 },
      { label: 'Z4', min: 0.9, max: 1.05 },
      { label: 'Z5', min: 1.05, max: 1.2 },
      { label: 'Z6', min: 1.2, max: 1.5 },
      { label: 'Z7', min: 1.5, max: 10 },
    ];

    const hrBuckets = new Map<string, number>();
    const powerBuckets = new Map<string, number>();

    for (const activity of activities) {
      const duration = activity.duration_s ? Number(activity.duration_s) : 0;
      if (!Number.isFinite(duration) || duration <= 0) continue;

      if (activity.avg_hr_bpm && activity.max_hr_bpm && activity.max_hr_bpm > 0) {
        const ratio = Number(activity.avg_hr_bpm) / Number(activity.max_hr_bpm);
        const zone =
          ratio < 0.6 ? 'Z1' : ratio < 0.7 ? 'Z2' : ratio < 0.8 ? 'Z3' : ratio < 0.9 ? 'Z4' : 'Z5';
        hrBuckets.set(zone, (hrBuckets.get(zone) || 0) + duration);
      }

      if (ftp && activity.avg_power_w && activity.avg_power_w > 0) {
        const ratio = Number(activity.avg_power_w) / ftp;
        const zone =
          ratio < 0.55
            ? 'Z1'
            : ratio < 0.75
              ? 'Z2'
              : ratio < 0.9
                ? 'Z3'
                : ratio < 1.05
                  ? 'Z4'
                  : ratio < 1.2
                    ? 'Z5'
                    : ratio < 1.5
                      ? 'Z6'
                      : 'Z7';
        powerBuckets.set(zone, (powerBuckets.get(zone) || 0) + duration);
      }
    }

    const hrCounts = Array.from(hrBuckets.entries()).map(([zone, count]) => ({ zone, count }));
    const powerCounts = Array.from(powerBuckets.entries()).map(([zone, count]) => ({ zone, count }));

    const hrZones = this.buildZoneSummary(['Z5', 'Z4', 'Z3', 'Z2', 'Z1'], hrCounts, latestMaxHr, hrZoneDefs, 'bpm');
    const powerZones = this.buildZoneSummary(
      ['Z7', 'Z6', 'Z5', 'Z4', 'Z3', 'Z2', 'Z1'],
      powerCounts,
      ftp,
      powerZoneDefs,
      'w',
    );

    return {
      power: powerZones ? { ftp: ftp ? Math.round(ftp) : undefined, zones: powerZones.zones } : null,
      heartRate: hrZones ? { maxHr: latestMaxHr ? Math.round(latestMaxHr) : undefined, zones: hrZones.zones } : null,
    };
  }

  private buildZoneSummaryFromActivity(activity: Activity): {
    power: { ftp?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
    heartRate: { lthr?: number; maxHr?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
  } {
    if (!activity) {
      return { power: null, heartRate: null };
    }

    const duration = activity.duration_s ? Number(activity.duration_s) : 0;
    if (!Number.isFinite(duration) || duration <= 0) {
      return { power: null, heartRate: null };
    }

    const activityData = activity as any;
    
    // Use LTHR (lactate threshold) as the primary reference for HR zones
    // This is more physiologically meaningful and stable than max HR
    const lthr = activityData.lthr ? Number(activityData.lthr) : undefined;
    const maxHr = activity.max_hr_bpm ? Number(activity.max_hr_bpm) : undefined;
    
    let ftp =
      activity.np_watts && activity.if && activity.np_watts > 0 && activity.if > 0
        ? Number(activity.np_watts) / Number(activity.if)
        : undefined;
    if (!ftp && activity.avg_power_w && activity.avg_power_w > 0) {
      ftp = Number(activity.avg_power_w);
    }

    // Try to get FTP from intervals.icu data
    if (!ftp && activityData.icu_ftp) {
      ftp = Number(activityData.icu_ftp);
    }

    // Get HR zone definitions from intervals.icu
    // icu_hr_zones provides the upper boundaries: [Z1_max, Z2_max, Z3_max, Z4_max, Z5_max, Z6_max, Z7_max]
    let hrZoneDefs: Array<{ label: string; min: number; max: number }> = [];
    let icuHrZones: number[] | undefined;
    
    try {
      if (activityData.icu_hr_zones) {
        if (typeof activityData.icu_hr_zones === 'string') {
          icuHrZones = JSON.parse(activityData.icu_hr_zones);
        } else if (Array.isArray(activityData.icu_hr_zones)) {
          icuHrZones = activityData.icu_hr_zones;
        }
        
        if (Array.isArray(icuHrZones) && icuHrZones.length >= 5) {
          // Use actual zone boundaries from intervals.icu
          // Support both 5-zone and 7-zone systems dynamically
          const zones = icuHrZones; // TypeScript guard
          hrZoneDefs = zones.map((maxBpm, index) => ({
            label: `Z${index + 1}`,
            min: index === 0 ? 0 : zones[index - 1],
            max: index === zones.length - 1 ? 9999 : maxBpm,
          }));
        }
      }
    } catch (err) {
      // Failed to parse icu_hr_zones, will use LTHR-based defaults
    }
    
    // Fallback to LTHR-based zones if intervals.icu zones not available
    if (hrZoneDefs.length === 0 && lthr) {
      hrZoneDefs = [
        { label: 'Z1', min: 0, max: lthr * 0.81 },
        { label: 'Z2', min: lthr * 0.81, max: lthr * 0.89 },
        { label: 'Z3', min: lthr * 0.89, max: lthr * 0.93 },
        { label: 'Z4', min: lthr * 0.93, max: lthr * 1.00 },
        { label: 'Z5', min: lthr * 1.00, max: lthr * 1.06 },
        { label: 'Z6', min: lthr * 1.06, max: lthr * 1.20 },
        { label: 'Z7', min: lthr * 1.20, max: 9999 },
      ];
    } else if (hrZoneDefs.length === 0 && maxHr) {
      // Last resort: use max HR based zones
      hrZoneDefs = [
        { label: 'Z1', min: 0, max: maxHr * 0.6 },
        { label: 'Z2', min: maxHr * 0.6, max: maxHr * 0.7 },
        { label: 'Z3', min: maxHr * 0.7, max: maxHr * 0.8 },
        { label: 'Z4', min: maxHr * 0.8, max: maxHr * 0.9 },
        { label: 'Z5', min: maxHr * 0.9, max: 9999 },
      ];
    }

    const powerZoneDefs = [
      { label: 'Z1', min: 0.0, max: 0.55 },
      { label: 'Z2', min: 0.55, max: 0.75 },
      { label: 'Z3', min: 0.75, max: 0.9 },
      { label: 'Z4', min: 0.9, max: 1.05 },
      { label: 'Z5', min: 1.05, max: 1.2 },
      { label: 'Z6', min: 1.2, max: 1.5 },
      { label: 'Z7', min: 1.5, max: 10 },
    ];

    // Try to parse intervals.icu zone times (actual time in each zone)
    let hrCounts: Array<{ zone: string; count: number }> = [];
    try {
      if (activityData.icu_hr_zone_times) {
        // Handle both string (needs parsing) and array (already parsed) formats
        let zoneTimes: number[];
        if (typeof activityData.icu_hr_zone_times === 'string') {
          zoneTimes = JSON.parse(activityData.icu_hr_zone_times);
        } else if (Array.isArray(activityData.icu_hr_zone_times)) {
          zoneTimes = activityData.icu_hr_zone_times;
        } else {
          throw new Error('Invalid format');
        }
        
        if (Array.isArray(zoneTimes) && zoneTimes.length >= 5) {
          // intervals.icu provides times in seconds for each zone
          // Dynamically map to match the number of zones (5 or 7)
          hrCounts = zoneTimes.map((time, index) => ({
            zone: `Z${index + 1}`,
            count: time || 0,
          })).filter((z) => z.count > 0);
        }
      }
    } catch (err) {
      // Fall through to use average-based calculation
    }

    // Fallback: calculate from average HR if intervals.icu data not available
    if (hrCounts.length === 0 && activity.avg_hr_bpm && hrZoneDefs.length > 0) {
      const avgHr = Number(activity.avg_hr_bpm);
      const zoneDef = hrZoneDefs.find(z => avgHr >= z.min && avgHr < z.max) || hrZoneDefs[hrZoneDefs.length - 1];
      hrCounts.push({ zone: zoneDef.label, count: duration });
    }

    // Try to parse intervals.icu power zone times
    let powerCounts: Array<{ zone: string; count: number }> = [];
    try {
      if (activityData.icu_zone_times) {
        // Handle both string (needs parsing) and array (already parsed) formats
        let zoneTimes: any[];
        if (typeof activityData.icu_zone_times === 'string') {
          zoneTimes = JSON.parse(activityData.icu_zone_times);
        } else if (Array.isArray(activityData.icu_zone_times)) {
          zoneTimes = activityData.icu_zone_times;
        } else {
          throw new Error('Invalid format');
        }
        
        // Handle both simple arrays and object arrays from intervals.icu
        let timeValues: number[];
        if (zoneTimes.length > 0 && typeof zoneTimes[0] === 'object' && zoneTimes[0].secs !== undefined) {
          // Format: [{"id":"Z1","secs":1255}, ...]
          timeValues = zoneTimes.map(z => z.secs || 0);
        } else {
          // Format: [1255, 792, ...]
          timeValues = zoneTimes.map(z => Number(z) || 0);
        }
        
        if (Array.isArray(timeValues) && timeValues.length >= 5) {
          // intervals.icu provides times in seconds for each zone
          // Dynamically map to match the number of zones
          powerCounts = timeValues.map((time, index) => ({
            zone: `Z${index + 1}`,
            count: time || 0,
          })).filter((z) => z.count > 0);
        }
      }
    } catch (err) {
      // Fall through to use average-based calculation
    }

    // Fallback: calculate from average power if intervals.icu data not available
    if (powerCounts.length === 0 && ftp && activity.avg_power_w && activity.avg_power_w > 0) {
      const ratio = Number(activity.avg_power_w) / ftp;
      const zone =
        ratio < 0.55
          ? 'Z1'
          : ratio < 0.75
            ? 'Z2'
            : ratio < 0.9
              ? 'Z3'
              : ratio < 1.05
                ? 'Z4'
                : ratio < 1.2
                  ? 'Z5'
                  : ratio < 1.5
                    ? 'Z6'
                    : 'Z7';
      powerCounts.push({ zone, count: duration });
    }

    // Use LTHR as the primary reference, fall back to max HR if LTHR not available
    const hrReference = lthr || maxHr;
    // Dynamically generate zone labels based on the actual number of zones
    const hrZoneLabels = hrZoneDefs.map(z => z.label).reverse();
    const powerZoneLabels = powerZoneDefs.map(z => z.label).reverse();
    const hrZones = this.buildZoneSummary(hrZoneLabels, hrCounts, hrReference, hrZoneDefs, 'bpm');
    const powerZones = this.buildZoneSummary(
      powerZoneLabels,
      powerCounts,
      ftp,
      powerZoneDefs,
      'w',
    );

    return {
      power: powerZones ? { ftp: ftp ? Math.round(ftp) : undefined, zones: powerZones.zones } : null,
      heartRate: hrZones ? { 
        lthr: lthr ? Math.round(lthr) : undefined,
        maxHr: maxHr ? Math.round(maxHr) : undefined, 
        zones: hrZones.zones 
      } : null,
    };
  }
}

