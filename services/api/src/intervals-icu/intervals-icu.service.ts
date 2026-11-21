import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface IntervalsActivity {
  // Core identifiers
  id: string;
  icu_athlete_id?: string;
  external_id?: string;
  strava_id?: string;
  
  // Dates and times
  start_date?: string;
  start_date_local: string;
  created?: string;
  icu_sync_date?: string;
  analyzed?: string;
  
  // Activity type and metadata
  type: string;
  sub_type?: string;
  name?: string;
  description?: string;
  source?: string;
  file_type?: string;
  file_sport_index?: number;
  
  // Time durations
  moving_time?: number;
  elapsed_time?: number;
  icu_recording_time?: number;
  coasting_time?: number;
  icu_warmup_time?: number;
  icu_cooldown_time?: number;
  
  // Distance and speed
  distance?: number;
  icu_distance?: number;
  average_speed?: number;
  max_speed?: number;
  pace?: number;
  gap?: number;
  gap_model?: string;
  threshold_pace?: number;
  average_stride?: number;
  
  // Elevation
  total_elevation_gain?: number;
  total_elevation_loss?: number;
  average_altitude?: number;
  min_altitude?: number;
  max_altitude?: number;
  use_elevation_correction?: boolean;
  
  // Heart rate
  has_heartrate?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  athlete_max_hr?: number;
  lthr?: number;
  icu_resting_hr?: number;
  icu_hr_zones?: number[];
  icu_hr_zone_times?: number[];
  icu_hrr?: number;
  
  // Power
  device_watts?: boolean;
  average_watts?: number;
  icu_average_watts?: number;
  weighted_average_watts?: number;
  icu_weighted_avg_watts?: number;
  normalized_power?: number;
  icu_joules?: number;
  icu_joules_above_ftp?: number;
  icu_max_wbal_depletion?: number;
  p_max?: number;
  icu_power_zones?: number[];
  icu_zone_times?: number[];
  icu_sweet_spot_min?: number;
  icu_sweet_spot_max?: number;
  icu_power_spike_threshold?: number;
  power_field_names?: string[];
  power_field?: string;
  
  // Power model (PM) metrics
  icu_pm_cp?: number;
  icu_pm_w_prime?: number;
  icu_pm_p_max?: number;
  icu_pm_ftp?: number;
  icu_pm_ftp_secs?: number;
  icu_pm_ftp_watts?: number;
  
  // Rolling metrics
  icu_rolling_cp?: number;
  icu_rolling_w_prime?: number;
  icu_rolling_p_max?: number;
  icu_rolling_ftp?: number;
  icu_rolling_ftp_delta?: number;
  icu_w_prime?: number;
  
  // Skiba / Coggan metrics
  ss_p_max?: number;
  ss_w_prime?: number;
  ss_cp?: number;
  icu_ftp?: number;
  
  // Cadence
  average_cadence?: number;
  max_cadence?: number;
  icu_cadence_z2?: number;
  
  // Training load and fitness
  training_load?: number;
  icu_training_load?: number;
  icu_training_load_data?: number;
  icu_atl?: number;
  icu_ctl?: number;
  trimp?: number;
  power_load?: number;
  hr_load?: number;
  pace_load?: number;
  hr_load_type?: string;
  pace_load_type?: string;
  
  // Intensity and efficiency
  intensity?: number;
  icu_intensity?: number;
  icu_efficiency_factor?: number;
  icu_power_hr?: number;
  icu_power_hr_z2?: number;
  icu_power_hr_z2_mins?: number;
  icu_variability_index?: number;
  polarization_index?: number;
  decoupling?: number;
  strain_score?: number;
  p30s_exponent?: number;
  
  // Perceived exertion and feel
  feel?: number;
  perceived_exertion?: number;
  icu_rpe?: number;
  session_rpe?: number;
  rpe?: number;
  
  // Pace zones
  pace_zones?: number[];
  pace_zone_times?: number[];
  gap_zone_times?: number[];
  use_gap_zone_times?: boolean;
  tiz_order?: string;
  
  // Calories and nutrition
  calories?: number;
  carbs_used?: number;
  carbs_ingested?: number;
  kg_lifted?: number;
  
  // Temperature
  average_temp?: number;
  min_temp?: number;
  max_temp?: number;
  
  // Weather
  has_weather?: boolean;
  average_weather_temp?: number;
  min_weather_temp?: number;
  max_weather_temp?: number;
  average_feels_like?: number;
  min_feels_like?: number;
  max_feels_like?: number;
  average_wind_speed?: number;
  average_wind_gust?: number;
  prevailing_wind_deg?: number;
  headwind_percent?: number;
  tailwind_percent?: number;
  average_clouds?: number;
  max_rain?: number;
  max_snow?: number;
  
  // Equipment and device
  device_name?: string;
  power_meter?: string;
  power_meter_serial?: string;
  power_meter_battery?: number;
  crank_length?: number;
  gear?: string;
  icu_weight?: number;
  fit_path?: string;
  
  // Activity flags
  trainer?: boolean;
  commute?: boolean;
  race?: boolean;
  icu_ignore_time?: boolean;
  icu_ignore_power?: boolean;
  icu_ignore_hr?: boolean;
  ignore_velocity?: boolean;
  ignore_pace?: boolean;
  ignore_parts?: string;
  
  // Intervals and laps
  icu_lap_count?: number;
  interval_summary?: string[];
  icu_intervals_edited?: boolean;
  lock_intervals?: boolean;
  icu_achievements?: any[];
  
  // Swimming
  lengths?: number;
  pool_length?: number;
  avg_lr_balance?: number;
  
  // Segments and streams
  has_segments?: boolean;
  stream_types?: string[];
  
  // Metadata
  timezone?: string;
  group?: string;
  tags?: string[];
  attachments?: any[];
  icu_color?: string;
  paired_event_id?: string;
  icu_chat_id?: string;
  route_id?: string;
  
  // Workout compliance
  compliance?: number;
  coach_tick?: boolean;
  workout_shift_secs?: number;
  
  // OAuth and sync
  oauth_client_id?: string;
  oauth_client_name?: string;
  icu_sync_error?: string;
  
  // Other
  icu_median_time_delta?: number;
  recording_stops?: number;
  skyline_chart_bytes?: string;
  custom_zones?: any;
  power_curve?: any; // Power curve data
}

export interface WellnessEntry {
  id: string;
  weight?: number;
  restingHR?: number;
  hrv?: number;
  menstrualPhase?: string;
  ctl?: number;
  atl?: number;
  rr?: number;
  tsb?: number;
  sleepSecs?: number;
  sleepScore?: number;
  sleepQuality?: number;
  avgSleepingHR?: number;
  soreness?: number;
  fatigue?: number;
  stress?: number;
  mood?: number;
  motivation?: number;
  injury?: number;
  spO2?: number;
  systolic?: number;
  diastolic?: number;
  hydration?: number;
  hydrationVolume?: number;
  readiness?: number;
  bloodGlucose?: number;
  lactate?: number;
  bodyFat?: number;
  vo2max?: number;
}

@Injectable()
export class IntervalsIcuService {
  private readonly logger = new Logger(IntervalsIcuService.name);
  private readonly baseUrl = 'https://intervals.icu/api/v1';
  private readonly corpusRoot: string;

  // Global fallback credentials from env (used when user has no per-user creds)
  private readonly globalApiKey: string;
  private readonly globalAthleteId: string;

  constructor(private configService: ConfigService) {
    this.globalApiKey = this.configService.get<string>('INTERVALS_ICU_API_KEY', '');
    this.globalAthleteId = this.configService.get<string>('INTERVALS_ICU_ATHLETE_ID', '');
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', '/data/corpus');

    if (!this.globalApiKey) {
      this.logger.warn('Intervals.icu global API key not configured (users must connect their own accounts)');
    }
  }

  /**
   * Resolve credentials: per-user creds take priority.
   * Falls back to global env vars ONLY when called without any user context
   * (i.e. userApiKey is explicitly undefined AND no userId context is expected).
   * Pass `allowGlobalFallback: true` only for system/admin jobs.
   */
  private resolveCredentials(
    userApiKey?: string,
    userAthleteId?: string,
    allowGlobalFallback = false,
  ): { apiKey: string; athleteId: string } {
    const apiKey = userApiKey?.trim() || (allowGlobalFallback ? this.globalApiKey : '');
    const athleteId = userAthleteId?.trim() || (allowGlobalFallback ? this.globalAthleteId : '');
    return { apiKey, athleteId };
  }

  /**
   * Get the athlete ID (must be configured in environment)
   */
  async getAthleteId(userAthleteId?: string): Promise<string> {
    const athleteId = userAthleteId?.trim() || this.globalAthleteId;
    if (athleteId) {
      return athleteId;
    }

    throw new Error(
      'Intervals.icu athlete ID not configured. Please connect your intervals.icu account in Settings → Connections.'
    );
  }

  async getAthleteProfile(userApiKey?: string, userAthleteId?: string): Promise<Record<string, any>> {
    const { apiKey, athleteId } = this.resolveCredentials(userApiKey, userAthleteId);
    if (!apiKey || !athleteId) throw new Error('No intervals.icu credentials configured.');
    return this.makeRequest<Record<string, any>>(`/athlete/${athleteId}`, apiKey);
  }

  /**
   * Make authenticated request to intervals.icu API
   */
  private async makeRequest<T>(endpoint: string, apiKey?: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    this.logger.log(`Fetching: ${url}`);

    const resolvedApiKey = apiKey;
    const timeoutMs = parseInt(this.configService.get<string>('INTERVALS_ICU_TIMEOUT_MS', '30000'), 10);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`API_KEY:${resolvedApiKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Intervals.icu API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Fetch activities for a date range
   */
  async getActivities(startDate?: string, endDate?: string, userApiKey?: string, userAthleteId?: string): Promise<IntervalsActivity[]> {
    const { apiKey, athleteId } = this.resolveCredentials(userApiKey, userAthleteId);
    if (!apiKey || !athleteId) return [];

    // Default to last 90 days
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const activities = await this.makeRequest<IntervalsActivity[]>(
      `/athlete/${athleteId}/activities?oldest=${start}&newest=${end}`,
      apiKey,
    );

    this.logger.log(`Fetched ${activities.length} activities from ${start} to ${end}`);
    return activities;
  }

  /**
   * Fetch a single activity with full details including zone times
   */
  async getActivity(id: string, userApiKey?: string, userAthleteId?: string): Promise<IntervalsActivity> {
    const { apiKey, athleteId } = this.resolveCredentials(userApiKey, userAthleteId);
    if (!apiKey || !athleteId) throw new Error('No intervals.icu credentials configured.');
    
    // Note: The API returns an array with a single activity, not a single object
    const response = await this.makeRequest<IntervalsActivity[]>(
      `/athlete/${athleteId}/activities/${id}`,
      apiKey,
    );
    
    const activity = Array.isArray(response) ? response[0] : response;
    this.logger.log(`Fetched activity ${id}`);
    return activity;
  }

  /**
   * Fetch wellness data for a date range
   */
  async getWellness(startDate?: string, endDate?: string, userApiKey?: string, userAthleteId?: string): Promise<WellnessEntry[]> {
    const { apiKey, athleteId } = this.resolveCredentials(userApiKey, userAthleteId);
    if (!apiKey || !athleteId) return [];

    // intervals.icu wellness endpoint supports oldest/newest date range params
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const wellness = await this.makeRequest<WellnessEntry[]>(
      `/athlete/${athleteId}/wellness?oldest=${start}&newest=${end}`,
      apiKey,
    );

    this.logger.log(`Fetched ${wellness.length} wellness entries from ${start} to ${end}`);
    return wellness;
  }

  /**
   * Sync all data and save to CSVs
   */
  async syncAllData(
    days: number = 90,
    options?: { includeActivityDetails?: boolean },
    userId = 'default',
    userApiKey?: string,
    userAthleteId?: string,
  ): Promise<{
    success: boolean;
    activities: number;
    wellness: number;
    errors?: string[];
  }> {
    const { apiKey, athleteId } = this.resolveCredentials(userApiKey, userAthleteId);

    if (!apiKey || !athleteId) {
      throw new Error('No intervals.icu credentials configured. Please connect your account in Settings → Connections.');
    }

    const errors: string[] = [];
    let activitiesCount = 0;
    let wellnessCount = 0;

    try {
      this.logger.log(`Syncing intervals.icu data for last ${days} days (athlete ${athleteId})`);
      const includeActivityDetails =
        options?.includeActivityDetails ??
        (this.configService.get<string>('INTERVALS_ICU_INCLUDE_ACTIVITY_DETAILS', 'false') === 'true');

      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Fetch activities
      try {
        const activities = await this.getActivities(startDate, endDate, apiKey, athleteId);

        let activitiesToSave: IntervalsActivity[] = activities;
        if (includeActivityDetails) {
          const detailedActivities: IntervalsActivity[] = [];
          const activitiesNeedingDetails = activities.filter((a) => a.average_watts || a.average_heartrate);
          this.logger.log(`Fetching details for ${activitiesNeedingDetails.length} activities (rate limited)...`);

          for (let i = 0; i < activities.length; i++) {
            const activity = activities[i];
            try {
              if (activity.average_watts || activity.average_heartrate) {
                const detailed = await this.getActivity(activity.id, apiKey, athleteId);
                detailedActivities.push(detailed);
                if (i < activities.length - 1) {
                  await new Promise((resolve) => setTimeout(resolve, 250));
                }
              } else {
                detailedActivities.push(activity);
              }
            } catch (err: any) {
              this.logger.warn(`Failed to fetch details for activity ${activity.id}: ${err?.message || 'Unknown error'}`);
              detailedActivities.push(activity);
            }
          }
          this.logger.log(`Fetched details for ${detailedActivities.length} activities`);
          activitiesToSave = detailedActivities;
        } else {
          this.logger.log(`Skipping per-activity detail fetch (fast sync).`);
        }

        await this.saveActivitiesToCSV(activitiesToSave, userId);
        activitiesCount = activitiesToSave.length;
        this.logger.log(`Synced ${activitiesCount} activities`);
      } catch (error) {
        const errorMsg = `Activities sync failed: ${error.message}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }

      // Fetch wellness
      try {
        const wellness = await this.getWellness(startDate, endDate, apiKey, athleteId);
        await this.saveWellnessToCSV(wellness, userId);
        wellnessCount = wellness.length;
        this.logger.log(`Synced ${wellnessCount} wellness entries`);
      } catch (error) {
        const errorMsg = `Wellness sync failed: ${error.message}`;
        this.logger.warn(errorMsg);
        errors.push(errorMsg);
      }

      this.logger.log('Intervals.icu sync completed');

      return {
        success: activitiesCount > 0 || wellnessCount > 0,
        activities: activitiesCount,
        wellness: wellnessCount,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      this.logger.error(`Sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save activities to CSV
   * Maps ALL fields from intervals.icu API to CSV format
   */
  private async saveActivitiesToCSV(activities: IntervalsActivity[], userId = 'default'): Promise<void> {
    if (!activities || activities.length === 0) return;

    // Filter out activities without valid dates
    const validActivities = activities.filter(activity => {
      if (!activity.start_date && !activity.start_date_local) {
        this.logger.warn(`Skipping activity ${activity.id} - no valid date`);
        return false;
      }
      return true;
    });

    const rows = validActivities.map((activity) => {
      // Ensure we have a valid start_time_utc
      let startTimeUtc: string;
      if (activity.start_date) {
        startTimeUtc = activity.start_date;
      } else if (activity.start_date_local) {
        try {
          startTimeUtc = new Date(activity.start_date_local).toISOString();
        } catch (err) {
          this.logger.warn(`Invalid date for activity ${activity.id}: ${activity.start_date_local}`);
          startTimeUtc = new Date().toISOString(); // Fallback to current time
        }
      } else {
        startTimeUtc = new Date().toISOString(); // Fallback to current time
      }

      const row: Record<string, any> = {
        // Core identifiers (using canonical field names where applicable)
        activity_id: String(activity.id),
        icu_athlete_id: activity.icu_athlete_id,
        external_id: activity.external_id,
        strava_id: activity.strava_id,
        
        // Dates and times
        start_time_utc: startTimeUtc,
        start_date_local: activity.start_date_local,
        created: activity.created,
        icu_sync_date: activity.icu_sync_date,
        analyzed: activity.analyzed,
        
        // Activity type and metadata
        sport: activity.type || 'Unknown',
        sub_type: activity.sub_type,
        name: activity.name,
        description: activity.description,
        source: activity.source || 'intervals_icu',
        file_type: activity.file_type,
        file_sport_index: activity.file_sport_index,
        
        // Time durations
        moving_time: activity.moving_time,
        elapsed_time: activity.elapsed_time,
        icu_recording_time: activity.icu_recording_time,
        coasting_time: activity.coasting_time,
        icu_warmup_time: activity.icu_warmup_time,
        icu_cooldown_time: activity.icu_cooldown_time,
        duration_s: activity.moving_time || activity.elapsed_time || 0,
        
        // Distance and speed
        distance: activity.distance,
        distance_m: activity.distance ? Math.round(activity.distance) : undefined,
        icu_distance: activity.icu_distance,
        average_speed: activity.average_speed,
        max_speed: activity.max_speed,
        pace: activity.pace,
        gap: activity.gap,
        gap_model: activity.gap_model,
        threshold_pace: activity.threshold_pace,
        average_stride: activity.average_stride,
        
        // Elevation
        total_elevation_gain: activity.total_elevation_gain,
        total_elevation_loss: activity.total_elevation_loss,
        average_altitude: activity.average_altitude,
        min_altitude: activity.min_altitude,
        max_altitude: activity.max_altitude,
        use_elevation_correction: activity.use_elevation_correction,
        
        // Heart rate
        has_heartrate: activity.has_heartrate,
        average_heartrate: activity.average_heartrate,
        avg_hr_bpm: activity.average_heartrate,
        max_heartrate: activity.max_heartrate,
        max_hr_bpm: activity.max_heartrate,
        athlete_max_hr: activity.athlete_max_hr,
        lthr: activity.lthr,
        icu_resting_hr: activity.icu_resting_hr,
        icu_hr_zones: activity.icu_hr_zones ? JSON.stringify(activity.icu_hr_zones) : undefined,
        icu_hr_zone_times: (() => {
          if (!activity.icu_hr_zone_times) return undefined;
          try {
            if (Array.isArray(activity.icu_hr_zone_times)) {
              return JSON.stringify(activity.icu_hr_zone_times);
            } else if (typeof activity.icu_hr_zone_times === 'object') {
              // Convert object to array
              const asArray = Object.values(activity.icu_hr_zone_times);
              return JSON.stringify(asArray);
            } else {
              this.logger.warn(`Unexpected type for icu_hr_zone_times in activity ${activity.id}: ${typeof activity.icu_hr_zone_times}`);
              return JSON.stringify(activity.icu_hr_zone_times);
            }
          } catch (err) {
            this.logger.error(`Failed to stringify icu_hr_zone_times for activity ${activity.id}:`, err);
            return undefined;
          }
        })(),
        icu_hrr: activity.icu_hrr,
        
        // Power
        device_watts: activity.device_watts,
        average_watts: activity.average_watts,
        avg_power_w: activity.average_watts,
        icu_average_watts: activity.icu_average_watts,
        weighted_average_watts: activity.weighted_average_watts,
        icu_weighted_avg_watts: activity.icu_weighted_avg_watts,
        normalized_power: activity.normalized_power,
        np_watts: activity.normalized_power || activity.weighted_average_watts,
        icu_joules: activity.icu_joules,
        icu_joules_above_ftp: activity.icu_joules_above_ftp,
        icu_max_wbal_depletion: activity.icu_max_wbal_depletion,
        p_max: activity.p_max,
        icu_power_zones: activity.icu_power_zones ? JSON.stringify(activity.icu_power_zones) : undefined,
        icu_zone_times: (() => {
          if (!activity.icu_zone_times) return undefined;
          try {
            if (Array.isArray(activity.icu_zone_times)) {
              return JSON.stringify(activity.icu_zone_times);
            } else if (typeof activity.icu_zone_times === 'object') {
              // Convert object to array
              const asArray = Object.values(activity.icu_zone_times);
              return JSON.stringify(asArray);
            } else {
              this.logger.warn(`Unexpected type for icu_zone_times in activity ${activity.id}: ${typeof activity.icu_zone_times}`);
              return JSON.stringify(activity.icu_zone_times);
            }
          } catch (err) {
            this.logger.error(`Failed to stringify icu_zone_times for activity ${activity.id}:`, err);
            return undefined;
          }
        })(),
        icu_sweet_spot_min: activity.icu_sweet_spot_min,
        icu_sweet_spot_max: activity.icu_sweet_spot_max,
        icu_power_spike_threshold: activity.icu_power_spike_threshold,
        power_field_names: activity.power_field_names ? JSON.stringify(activity.power_field_names) : undefined,
        power_field: activity.power_field,
        
        // Power model (PM) metrics
        icu_pm_cp: activity.icu_pm_cp,
        icu_pm_w_prime: activity.icu_pm_w_prime,
        icu_pm_p_max: activity.icu_pm_p_max,
        icu_pm_ftp: activity.icu_pm_ftp,
        icu_pm_ftp_secs: activity.icu_pm_ftp_secs,
        icu_pm_ftp_watts: activity.icu_pm_ftp_watts,
        
        // Rolling metrics
        icu_rolling_cp: activity.icu_rolling_cp,
        icu_rolling_w_prime: activity.icu_rolling_w_prime,
        icu_rolling_p_max: activity.icu_rolling_p_max,
        icu_rolling_ftp: activity.icu_rolling_ftp,
        icu_rolling_ftp_delta: activity.icu_rolling_ftp_delta,
        icu_w_prime: activity.icu_w_prime,
        
        // Skiba / Coggan metrics
        ss_p_max: activity.ss_p_max,
        ss_w_prime: activity.ss_w_prime,
        ss_cp: activity.ss_cp,
        icu_ftp: activity.icu_ftp,
        ftp: activity.icu_ftp,
        
        // Cadence
        average_cadence: activity.average_cadence,
        avg_cadence: activity.average_cadence,
        max_cadence: activity.max_cadence,
        icu_cadence_z2: activity.icu_cadence_z2,
        
        // Training load and fitness
        training_load: activity.training_load,
        icu_training_load: activity.icu_training_load,
        tss: activity.icu_training_load || activity.training_load,
        icu_training_load_data: activity.icu_training_load_data,
        icu_atl: activity.icu_atl,
        icu_ctl: activity.icu_ctl,
        trimp: activity.trimp,
        power_load: activity.power_load,
        hr_load: activity.hr_load,
        pace_load: activity.pace_load,
        hr_load_type: activity.hr_load_type,
        pace_load_type: activity.pace_load_type,
        
        // Intensity and efficiency
        intensity: activity.intensity,
        icu_intensity: activity.icu_intensity,
        if: activity.icu_intensity || activity.intensity,
        icu_efficiency_factor: activity.icu_efficiency_factor,
        icu_power_hr: activity.icu_power_hr,
        icu_power_hr_z2: activity.icu_power_hr_z2,
        power_hr_z2: activity.icu_power_hr_z2,
        icu_power_hr_z2_mins: activity.icu_power_hr_z2_mins,
        icu_variability_index: activity.icu_variability_index,
        polarization_index: activity.polarization_index,
        decoupling: activity.decoupling,
        strain_score: activity.strain_score,
        p30s_exponent: activity.p30s_exponent,
        
        // Perceived exertion and feel
        feel: activity.feel,
        perceived_exertion: activity.perceived_exertion,
        icu_rpe: activity.icu_rpe,
        session_rpe: activity.session_rpe,
        rpe: activity.rpe || activity.icu_rpe || activity.perceived_exertion,
        
        // Pace zones
        pace_zones: activity.pace_zones ? JSON.stringify(activity.pace_zones) : undefined,
        pace_zone_times: activity.pace_zone_times ? JSON.stringify(activity.pace_zone_times) : undefined,
        gap_zone_times: activity.gap_zone_times ? JSON.stringify(activity.gap_zone_times) : undefined,
        use_gap_zone_times: activity.use_gap_zone_times,
        tiz_order: activity.tiz_order,
        
        // Calories and nutrition
        calories: activity.calories,
        carbs_used: activity.carbs_used,
        carbs_ingested: activity.carbs_ingested,
        kg_lifted: activity.kg_lifted,
        
        // Temperature
        average_temp: activity.average_temp,
        min_temp: activity.min_temp,
        max_temp: activity.max_temp,
        
        // Weather
        has_weather: activity.has_weather,
        average_weather_temp: activity.average_weather_temp,
        min_weather_temp: activity.min_weather_temp,
        max_weather_temp: activity.max_weather_temp,
        average_feels_like: activity.average_feels_like,
        min_feels_like: activity.min_feels_like,
        max_feels_like: activity.max_feels_like,
        average_wind_speed: activity.average_wind_speed,
        average_wind_gust: activity.average_wind_gust,
        prevailing_wind_deg: activity.prevailing_wind_deg,
        headwind_percent: activity.headwind_percent,
        tailwind_percent: activity.tailwind_percent,
        average_clouds: activity.average_clouds,
        max_rain: activity.max_rain,
        max_snow: activity.max_snow,
        
        // Equipment and device
        device_name: activity.device_name,
        power_meter: activity.power_meter,
        power_meter_serial: activity.power_meter_serial,
        power_meter_battery: activity.power_meter_battery,
        crank_length: activity.crank_length,
        gear: activity.gear,
        icu_weight: activity.icu_weight,
        
        // Activity flags
        trainer: activity.trainer,
        commute: activity.commute,
        race: activity.race,
        icu_ignore_time: activity.icu_ignore_time,
        icu_ignore_power: activity.icu_ignore_power,
        icu_ignore_hr: activity.icu_ignore_hr,
        ignore_velocity: activity.ignore_velocity,
        ignore_pace: activity.ignore_pace,
        ignore_parts: activity.ignore_parts,
        
        // Intervals and laps
        icu_lap_count: activity.icu_lap_count,
        interval_summary: activity.interval_summary ? JSON.stringify(activity.interval_summary) : undefined,
        icu_intervals_edited: activity.icu_intervals_edited,
        lock_intervals: activity.lock_intervals,
        icu_achievements: activity.icu_achievements ? JSON.stringify(activity.icu_achievements) : undefined,
        
        // Swimming
        lengths: activity.lengths,
        pool_length: activity.pool_length,
        avg_lr_balance: activity.avg_lr_balance,
        
        // Segments and streams
        has_segments: activity.has_segments,
        stream_types: activity.stream_types ? JSON.stringify(activity.stream_types) : undefined,
        
        // Metadata
        timezone: activity.timezone,
        group: activity.group,
        tags: activity.tags ? JSON.stringify(activity.tags) : undefined,
        attachments: activity.attachments ? JSON.stringify(activity.attachments) : undefined,
        icu_color: activity.icu_color,
        paired_event_id: activity.paired_event_id,
        icu_chat_id: activity.icu_chat_id,
        route_id: activity.route_id,
        
        // Workout compliance
        compliance: activity.compliance,
        coach_tick: activity.coach_tick,
        workout_shift_secs: activity.workout_shift_secs,
        
        // OAuth and sync
        oauth_client_id: activity.oauth_client_id,
        oauth_client_name: activity.oauth_client_name,
        icu_sync_error: activity.icu_sync_error,
        
        // Other
        icu_median_time_delta: activity.icu_median_time_delta,
        recording_stops: activity.recording_stops,
        
        // Timestamps for corpus system
        created_at_utc: new Date().toISOString(),
        updated_at_utc: new Date().toISOString(),
      };

      return row;
    });

    await this.saveCanonicalCsv('activities', rows, 'activity_id', userId);
  }

  /**
   * Save wellness data to CSVs (split by type)
   */
  private async saveWellnessToCSV(wellness: WellnessEntry[], userId = 'default'): Promise<void> {
    if (!wellness || wellness.length === 0) return;

    // Split wellness data into different categories
    const vitalsDaily: any[] = [];
    const bodyMetrics: any[] = [];
    const sleepDaily: any[] = [];
    const vitalsBp: any[] = [];
    const fitnessDaily: any[] = [];

    wellness.forEach((entry) => {
      const date = entry.id; // In intervals.icu, the wellness ID is the date (YYYY-MM-DD)

      // Vitals (HRV, resting HR, etc.)
      if (entry.restingHR || entry.hrv || entry.spO2) {
        vitalsDaily.push({
          date,
          resting_hr_bpm: entry.restingHR,
          hrv_ms: entry.hrv,
          spo2: entry.spO2,
          source: 'intervals_icu',
        });
      }

      // Body metrics (weight, body fat, etc.)
      if (entry.weight || entry.bodyFat) {
        bodyMetrics.push({
          date,
          weight_kg: entry.weight,
          body_fat_pct: entry.bodyFat,
          source: 'intervals_icu',
        });
      }

      // Sleep
      if (entry.sleepSecs) {
        sleepDaily.push({
          date,
          sleep_total_min: entry.sleepSecs / 60,
          sleep_score: entry.sleepScore,
          sleep_quality: entry.sleepQuality,
          avg_sleeping_hr: entry.avgSleepingHR,
          source: 'intervals_icu',
        });
      }

      // Blood pressure
      if (entry.systolic || entry.diastolic) {
        vitalsBp.push({
          date,
          systolic_bp: entry.systolic,
          diastolic_bp: entry.diastolic,
          source: 'intervals_icu',
        });
      }

      // Daily fitness (CTL/ATL/TSB from Intervals.icu)
      if (entry.ctl != null || entry.atl != null || entry.tsb != null) {
        fitnessDaily.push({
          date,
          ctl: entry.ctl,
          atl: entry.atl,
          tsb: entry.tsb ?? (entry.ctl != null && entry.atl != null ? entry.ctl - entry.atl : undefined),
          soreness: entry.soreness,
          fatigue: entry.fatigue,
          stress: entry.stress,
          mood: entry.mood,
          motivation: entry.motivation,
          readiness: entry.readiness,
          source: 'intervals_icu',
        });
      }
    });

    // Save each category
    if (vitalsDaily.length > 0) {
      await this.saveCanonicalCsv('vitals_daily', vitalsDaily, 'date', userId);
    }
    if (bodyMetrics.length > 0) {
      await this.saveCanonicalCsv('body_metrics', bodyMetrics, 'date', userId);
    }
    if (sleepDaily.length > 0) {
      await this.saveCanonicalCsv('sleep_daily', sleepDaily, 'date', userId);
    }
    if (vitalsBp.length > 0) {
      await this.saveCanonicalCsv('vitals_bp', vitalsBp, 'date', userId);
    }
    if (fitnessDaily.length > 0) {
      await this.saveCanonicalCsv('fitness_daily', fitnessDaily, 'date', userId);
      this.logger.log(`Saved ${fitnessDaily.length} fitness (CTL/ATL/TSB) rows for user ${userId}`);
    }
  }

  /**
   * Save data to canonical CSV with deduplication
   */
  private async saveCanonicalCsv(tableName: string, newData: any[], uniqueKey: string, userId = 'default'): Promise<void> {
    if (!newData || newData.length === 0) return;

    const canonicalDir = path.join(this.corpusRoot, userId, 'canonical');
    if (!fs.existsSync(canonicalDir)) {
      fs.mkdirSync(canonicalDir, { recursive: true });
    }

    const csvPath = path.join(canonicalDir, `${tableName}.csv`);
    let existingData: any[] = [];
    let existingHeaders: string[] = [];

    // Read existing data
    if (fs.existsSync(csvPath)) {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      if (lines.length > 0) {
        existingHeaders = lines[0].split(',');
        for (let i = 1; i < lines.length; i++) {
          const values = this.parseCSVLine(lines[i]);
          const row: any = {};
          existingHeaders.forEach((header, idx) => {
            row[header.trim()] = values[idx]?.trim() || '';
          });
          existingData.push(row);
        }
      }
    }

    // Merge and deduplicate
    const merged = [...existingData, ...newData];
    const deduplicated = Array.from(new Map(merged.map((row) => [row[uniqueKey], row])).values());

    // Get all headers
    const headersSet = new Set<string>();
    [...existingData, ...newData].forEach((row) => {
      Object.keys(row).forEach((key) => headersSet.add(key));
    });
    const headers = Array.from(headersSet);

    // Convert to CSV
    const csvRows = deduplicated.map((row) =>
      headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }),
    );

    const csvContent = [headers.join(','), ...csvRows.map((row) => row.join(','))].join('\n');
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    this.logger.log(`Saved ${deduplicated.length} rows to ${csvPath} (${newData.length} new)`);
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

  /**
   * Get HR zone distribution across activities
   */
  async getHrZoneDistribution(startDate?: string, endDate?: string, sport?: string, userApiKey?: string, userAthleteId?: string) {
    const activities = await this.getActivities(startDate, endDate, userApiKey, userAthleteId);
    
    const filteredActivities = sport
      ? activities.filter((a) => a.type?.toLowerCase() === sport.toLowerCase())
      : activities;

    const totalTimeByZone: number[] = [0, 0, 0, 0, 0, 0, 0]; // 7 zones
    let totalTime = 0;
    let activitiesWithZones = 0;
    let latestZones: number[] | null = null;

    filteredActivities.forEach((activity) => {
      let zoneTimes: number[] | null = null;
      
      // Parse icu_hr_zone_times if it's a JSON string
      if (typeof activity.icu_hr_zone_times === 'string' && activity.icu_hr_zone_times) {
        try {
          const parsed = JSON.parse(activity.icu_hr_zone_times);
          zoneTimes = Array.isArray(parsed) ? parsed : null;
        } catch (e) {
          this.logger.warn(`Failed to parse icu_hr_zone_times for activity ${activity.id}: ${e.message}`);
        }
      } else if (Array.isArray(activity.icu_hr_zone_times)) {
        zoneTimes = activity.icu_hr_zone_times;
      }
      
      if (zoneTimes && zoneTimes.length > 0) {
        zoneTimes.forEach((time, idx) => {
          if (idx < totalTimeByZone.length) {
            totalTimeByZone[idx] += time || 0;
            totalTime += time || 0;
          }
        });
        activitiesWithZones++;
        
        // Parse HR zones
        if (typeof activity.icu_hr_zones === 'string' && activity.icu_hr_zones) {
          try {
            latestZones = JSON.parse(activity.icu_hr_zones);
          } catch (e) {
            // Ignore parse error
          }
        } else if (Array.isArray(activity.icu_hr_zones)) {
          latestZones = activity.icu_hr_zones;
        }
      }
    });

    const distribution = totalTimeByZone.map((time, idx) => ({
      zone: idx + 1,
      zone_label: this.getZoneLabel(idx + 1),
      time_seconds: time,
      time_hours: parseFloat((time / 3600).toFixed(2)),
      percentage: totalTime > 0 ? parseFloat(((time / totalTime) * 100).toFixed(1)) : 0,
      zone_boundary: latestZones && idx < latestZones.length ? latestZones[idx] : null,
    }));

    return {
      total_activities: filteredActivities.length,
      activities_with_hr_zones: activitiesWithZones,
      total_time_seconds: totalTime,
      total_time_hours: parseFloat((totalTime / 3600).toFixed(2)),
      zones: distribution,
      polarization: this.calculatePolarization(distribution),
      latest_zone_boundaries: latestZones,
    };
  }

  /**
   * Get power zone distribution across activities
   */
  async getPowerZoneDistribution(startDate?: string, endDate?: string, sport?: string, userApiKey?: string, userAthleteId?: string) {
    const activities = await this.getActivities(startDate, endDate, userApiKey, userAthleteId);
    
    const filteredActivities = sport
      ? activities.filter((a) => a.type?.toLowerCase() === sport.toLowerCase())
      : activities;

    const totalTimeByZone: number[] = [0, 0, 0, 0, 0, 0, 0]; // 7 zones
    let totalTime = 0;
    let activitiesWithZones = 0;
    let latestZones: number[] | null = null;

    filteredActivities.forEach((activity) => {
      let zoneTimes: number[] | null = null;
      
      // Parse icu_zone_times if it's a JSON string
      if (typeof activity.icu_zone_times === 'string' && activity.icu_zone_times) {
        try {
          const parsed = JSON.parse(activity.icu_zone_times);
          // Intervals.icu returns format: [{"id":"Z1","secs":1255}, {"id":"Z2","secs":792}, ...]
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].secs !== undefined) {
            zoneTimes = parsed.map(z => z.secs || 0);
          } else if (Array.isArray(parsed)) {
            zoneTimes = parsed;
          }
        } catch (e) {
          this.logger.warn(`Failed to parse icu_zone_times for activity ${activity.id}: ${e.message}`);
        }
      } else if (Array.isArray(activity.icu_zone_times)) {
        // If already parsed
        const times = activity.icu_zone_times as any[];
        if (times.length > 0 && times[0].secs !== undefined) {
          zoneTimes = times.map(z => z.secs || 0);
        } else {
          zoneTimes = times as number[];
        }
      }
      
      if (zoneTimes && zoneTimes.length > 0) {
        zoneTimes.forEach((time, idx) => {
          if (idx < totalTimeByZone.length) {
            const numTime = Number(time);
            if (!isNaN(numTime)) {
              totalTimeByZone[idx] += numTime;
              totalTime += numTime;
            }
          }
        });
        activitiesWithZones++;
        
        // Parse power zones
        if (typeof activity.icu_power_zones === 'string' && activity.icu_power_zones) {
          try {
            latestZones = JSON.parse(activity.icu_power_zones);
          } catch (e) {
            // Ignore parse error
          }
        } else if (Array.isArray(activity.icu_power_zones)) {
          latestZones = activity.icu_power_zones;
        }
      }
    });

    const distribution = totalTimeByZone.map((time, idx) => ({
      zone: idx + 1,
      zone_label: this.getZoneLabel(idx + 1),
      time_seconds: time,
      time_hours: parseFloat((time / 3600).toFixed(2)),
      percentage: totalTime > 0 ? parseFloat(((time / totalTime) * 100).toFixed(1)) : 0,
      zone_boundary: latestZones && idx < latestZones.length ? latestZones[idx] : null,
    }));

    return {
      total_activities: filteredActivities.length,
      activities_with_power_zones: activitiesWithZones,
      total_time_seconds: totalTime,
      total_time_hours: parseFloat((totalTime / 3600).toFixed(2)),
      zones: distribution,
      polarization: this.calculatePolarization(distribution),
      latest_zone_boundaries: latestZones,
    };
  }

  /**
   * Get pace zone distribution across activities
   */
  async getPaceZoneDistribution(startDate?: string, endDate?: string, sport?: string, userApiKey?: string, userAthleteId?: string) {
    const activities = await this.getActivities(startDate, endDate, userApiKey, userAthleteId);
    
    const filteredActivities = sport
      ? activities.filter((a) => a.type?.toLowerCase() === sport.toLowerCase())
      : activities;

    const totalTimeByZone: number[] = [0, 0, 0, 0, 0, 0, 0]; // 7 zones
    let totalTime = 0;
    let activitiesWithZones = 0;
    let latestZones: number[] | null = null;

    filteredActivities.forEach((activity) => {
      let zoneTimes: number[] | null = null;
      
      // Parse pace_zone_times if it's a JSON string
      if (typeof activity.pace_zone_times === 'string' && activity.pace_zone_times) {
        try {
          const parsed = JSON.parse(activity.pace_zone_times);
          // Handle format: [{"id":"Z1","secs":1255}, ...] or simple array [1255, 792, ...]
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].secs !== undefined) {
            zoneTimes = parsed.map(z => z.secs || 0);
          } else if (Array.isArray(parsed)) {
            zoneTimes = parsed;
          }
        } catch (e) {
          this.logger.warn(`Failed to parse pace_zone_times for activity ${activity.id}: ${e.message}`);
        }
      } else if (Array.isArray(activity.pace_zone_times)) {
        const times = activity.pace_zone_times as any[];
        if (times.length > 0 && times[0].secs !== undefined) {
          zoneTimes = times.map(z => z.secs || 0);
        } else {
          zoneTimes = times as number[];
        }
      }
      
      if (zoneTimes && zoneTimes.length > 0) {
        zoneTimes.forEach((time, idx) => {
          if (idx < totalTimeByZone.length) {
            totalTimeByZone[idx] += time || 0;
            totalTime += time || 0;
          }
        });
        activitiesWithZones++;
        
        // Parse pace zones
        if (typeof activity.pace_zones === 'string' && activity.pace_zones) {
          try {
            latestZones = JSON.parse(activity.pace_zones);
          } catch (e) {
            // Ignore parse error
          }
        } else if (Array.isArray(activity.pace_zones)) {
          latestZones = activity.pace_zones;
        }
      }
    });

    const distribution = totalTimeByZone.map((time, idx) => ({
      zone: idx + 1,
      zone_label: this.getZoneLabel(idx + 1),
      time_seconds: time,
      time_hours: parseFloat((time / 3600).toFixed(2)),
      percentage: totalTime > 0 ? parseFloat(((time / totalTime) * 100).toFixed(1)) : 0,
      zone_boundary: latestZones && idx < latestZones.length ? latestZones[idx] : null,
    }));

    return {
      total_activities: filteredActivities.length,
      activities_with_pace_zones: activitiesWithZones,
      total_time_seconds: totalTime,
      total_time_hours: parseFloat((totalTime / 3600).toFixed(2)),
      zones: distribution,
      polarization: this.calculatePolarization(distribution),
      latest_zone_boundaries: latestZones,
    };
  }

  /**
   * Get comprehensive zone summary (HR, power, pace)
   */
  async getZoneSummary(startDate?: string, endDate?: string, sport?: string, userApiKey?: string, userAthleteId?: string) {
    const [hrZones, powerZones, paceZones] = await Promise.all([
      this.getHrZoneDistribution(startDate, endDate, sport, userApiKey, userAthleteId),
      this.getPowerZoneDistribution(startDate, endDate, sport, userApiKey, userAthleteId),
      this.getPaceZoneDistribution(startDate, endDate, sport, userApiKey, userAthleteId),
    ]);

    return {
      date_range: {
        start: startDate || 'all',
        end: endDate || 'all',
      },
      sport_filter: sport || 'all',
      hr_zones: hrZones,
      power_zones: powerZones,
      pace_zones: paceZones,
    };
  }

  /**
   * Get zone label (based on Friel's 7-zone model)
   */
  private getZoneLabel(zone: number): string {
    const labels: Record<number, string> = {
      1: 'Recovery',
      2: 'Endurance',
      3: 'Tempo',
      4: 'Threshold',
      5: 'VO2 Max',
      6: 'Anaerobic',
      7: 'Neuromuscular',
    };
    return labels[zone] || `Zone ${zone}`;
  }

  /**
   * Calculate polarization index (Seiler's model)
   * High polarization = more time in Z1-Z2 and Z5-Z7, less in Z3-Z4
   */
  private calculatePolarization(distribution: any[]): {
    low_intensity_pct: number;
    moderate_intensity_pct: number;
    high_intensity_pct: number;
    polarization_ratio: number;
    is_polarized: boolean;
  } {
    // Z1-Z2 = Low intensity
    const lowIntensity = (distribution[0]?.percentage || 0) + (distribution[1]?.percentage || 0);
    
    // Z3-Z4 = Moderate intensity
    const moderateIntensity = (distribution[2]?.percentage || 0) + (distribution[3]?.percentage || 0);
    
    // Z5-Z7 = High intensity
    const highIntensity = (distribution[4]?.percentage || 0) + (distribution[5]?.percentage || 0) + (distribution[6]?.percentage || 0);

    // Polarization ratio: (Low + High) / Moderate
    const polarizationRatio = moderateIntensity > 0 
      ? parseFloat(((lowIntensity + highIntensity) / moderateIntensity).toFixed(2))
      : 0;

    // Generally polarized if >80% in Z1-Z2, <5% in Z3-Z4, >10% in Z5+
    const isPolarized = lowIntensity > 75 && moderateIntensity < 10 && highIntensity > 10;

    return {
      low_intensity_pct: parseFloat(lowIntensity.toFixed(1)),
      moderate_intensity_pct: parseFloat(moderateIntensity.toFixed(1)),
      high_intensity_pct: parseFloat(highIntensity.toFixed(1)),
      polarization_ratio: polarizationRatio,
      is_polarized: isPolarized,
    };
  }

  /**
   * Get fitness/fatigue/form chart (CTL/ATL/TSB)
   */
  async getFitnessChart(startDate?: string, endDate?: string, userApiKey?: string, userAthleteId?: string) {
    const activities = await this.getActivities(startDate, endDate, userApiKey, userAthleteId);
    
    // Sort by date
    const sortedActivities = activities.sort((a, b) => 
      new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime()
    );

    const fitnessData = sortedActivities.map((activity) => ({
      date: activity.start_date_local.split('T')[0],
      ctl: activity.icu_ctl, // Chronic Training Load (Fitness)
      atl: activity.icu_atl, // Acute Training Load (Fatigue)
      tsb: activity.icu_ctl && activity.icu_atl ? activity.icu_ctl - activity.icu_atl : null, // Training Stress Balance (Form)
      tss: activity.icu_training_load || activity.training_load,
      activity_name: activity.name,
      activity_type: activity.type,
    }));

    // Get latest values
    const latest = fitnessData[fitnessData.length - 1];

    return {
      chart_data: fitnessData,
      latest: {
        ctl: latest?.ctl || 0,
        atl: latest?.atl || 0,
        tsb: latest?.tsb || 0,
        date: latest?.date,
      },
      interpretation: this.interpretForm(latest?.tsb || 0),
    };
  }

  /**
   * Interpret form (TSB) value
   */
  private interpretForm(tsb: number): string {
    if (tsb > 25) return 'Over-rested: Consider increasing training load';
    if (tsb > 5) return 'Fresh: Good for racing or hard efforts';
    if (tsb > -10) return 'Neutral: Maintaining fitness';
    if (tsb > -30) return 'Optimal training zone: Building fitness';
    return 'Fatigued: Consider recovery';
  }

  /**
   * Get HRV-based recovery scores
   */
  async getRecoveryScores(startDate?: string, endDate?: string, userApiKey?: string, userAthleteId?: string) {
    const wellness = await this.getWellness(startDate, endDate, userApiKey, userAthleteId);
    
    // Calculate personal HRV baseline (7-day and 30-day averages)
    const hrvValues = wellness
      .filter(w => w.hrv != null && w.hrv > 0)
      .map(w => ({ date: w.id, hrv: w.hrv!, restingHR: w.restingHR }));
    
    if (hrvValues.length === 0) {
      return {
        success: false,
        message: 'No HRV data available',
        data: [],
      };
    }
    
    // Calculate 30-day baseline
    const recentHRV = hrvValues.slice(-30);
    const hrvBaseline = recentHRV.reduce((sum, v) => sum + v.hrv, 0) / recentHRV.length;
    const hrvStdDev = Math.sqrt(
      recentHRV.reduce((sum, v) => sum + Math.pow(v.hrv - hrvBaseline, 2), 0) / recentHRV.length
    );
    
    // Calculate recovery scores (0-100 scale)
    const recoveryData = hrvValues.map(v => {
      // Z-score based calculation
      const zScore = (v.hrv - hrvBaseline) / (hrvStdDev || 1);
      
      // Convert to 0-100 scale (baseline = 50, each std dev = 15 points)
      let score = 50 + (zScore * 15);
      score = Math.max(0, Math.min(100, score)); // Clamp to 0-100
      
      // Resting HR influence (optional, if available)
      let status = 'Normal';
      if (score >= 75) status = 'Excellent';
      else if (score >= 60) status = 'Good';
      else if (score >= 40) status = 'Fair';
      else status = 'Low';
      
      return {
        date: v.date,
        hrv: v.hrv,
        restingHR: v.restingHR,
        recovery_score: Math.round(score),
        status,
        baseline: Math.round(hrvBaseline),
      };
    });
    
    const latest = recoveryData[recoveryData.length - 1];
    
    return {
      success: true,
      data: recoveryData,
      latest: {
        date: latest.date,
        recovery_score: latest.recovery_score,
        hrv: latest.hrv,
        restingHR: latest.restingHR,
        status: latest.status,
      },
      baseline: Math.round(hrvBaseline),
      interpretation: this.interpretRecovery(latest.recovery_score),
    };
  }

  /**
   * Interpret recovery score
   */
  private interpretRecovery(score: number): string {
    if (score >= 75) return 'Excellent recovery - ready for hard training';
    if (score >= 60) return 'Good recovery - normal training OK';
    if (score >= 40) return 'Moderate recovery - consider easier session';
    return 'Low recovery - prioritize rest';
  }

  /**
   * Get activity streams (time-series data)
   * Note: intervals.icu may not expose streams via API - they might require FIT file download
   */
  async getActivityStreams(activityId: string, userApiKey?: string, userAthleteId?: string) {
    const { apiKey } = this.resolveCredentials(userApiKey, userAthleteId);
    if (!apiKey) throw new Error('No intervals.icu credentials configured.');
    try {
      // Fetch activity to see available stream types
      const activity = await this.makeRequest<IntervalsActivity>(`/activity/${activityId}`, apiKey);
      
      if (!activity.stream_types || activity.stream_types.length === 0) {
        return {
          activity_id: activityId,
          activity_name: activity.name,
          activity_type: activity.type,
          available_streams: [],
          streams: null,
          message: 'No stream types available for this activity',
        };
      }

      // Try to fetch streams (this may 404 - intervals.icu doesn't always expose streams via API)
      try {
        const streamTypes = activity.stream_types.join(',');
        const streams = await this.makeRequest<Record<string, number[]>>(
          `/activity/${activityId}/streams/${streamTypes}`,
          apiKey,
        );

        return {
          activity_id: activityId,
          activity_name: activity.name,
          activity_type: activity.type,
          available_streams: activity.stream_types,
          streams,
          data_points: streams.time ? streams.time.length : 0,
        };
      } catch (streamError) {
        // Streams not available via API - would need to download FIT file
        this.logger.warn(`Streams not accessible via API for ${activityId}, would need FIT file download`);
        
        return {
          activity_id: activityId,
          activity_name: activity.name,
          activity_type: activity.type,
          available_streams: activity.stream_types,
          streams: null,
          fit_path: activity.fit_path,
          message: 'Streams available but not accessible via API. Download FIT file to access raw data.',
          download_url: activity.fit_path ? `https://intervals.icu${activity.fit_path}` : null,
        };
      }
    } catch (error) {
      this.logger.error(`Failed to fetch activity ${activityId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get power curve for a single activity
   */
  async getActivityPowerCurve(activityId: string, userApiKey?: string, userAthleteId?: string) {
    const { apiKey } = this.resolveCredentials(userApiKey, userAthleteId);
    if (!apiKey) throw new Error('No intervals.icu credentials configured.');
    try {
      const activity = await this.makeRequest<IntervalsActivity>(`/activity/${activityId}`, apiKey);
      
      return {
        activity_id: activityId,
        activity_name: activity.name,
        activity_type: activity.type,
        power_curve: activity.power_curve || null,
        message: activity.power_curve ? 'Power curve data available' : 'No power data for this activity',
      };
    } catch (error) {
      this.logger.error(`Failed to fetch power curve for ${activityId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get aggregate power curve (best efforts across all activities)
   */
  async getAggregatePowerCurve(startDate?: string, endDate?: string, userApiKey?: string, userAthleteId?: string) {
    const activities = await this.getActivities(startDate, endDate, userApiKey, userAthleteId);
    
    // Standard power curve durations (in seconds)
    const durations = [1, 5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200];
    
    const powerCurve: Record<number, { watts: number; activity: string; date: string }> = {};
    
    // Find best power for each duration across all activities
    activities.forEach((activity) => {
      if (!activity.power_curve) return;
      
      // intervals.icu power curve format is typically an array of watts at different durations
      // We'll extract what we can from the activity data
      durations.forEach((duration) => {
        // Check if we have power data for this duration
        const watts = this.extractPowerForDuration(activity, duration);
        if (watts && (!powerCurve[duration] || watts > powerCurve[duration].watts)) {
          powerCurve[duration] = {
            watts: parseFloat(watts.toFixed(1)),
            activity: activity.name || activity.type,
            date: activity.start_date_local.split('T')[0],
          };
        }
      });
    });

    // Format for output
    const curve = durations.map((duration) => ({
      duration_seconds: duration,
      duration_label: this.formatDuration(duration),
      best_watts: powerCurve[duration]?.watts || null,
      watts_per_kg: null, // Weight can vary across activities
      activity: powerCurve[duration]?.activity || null,
      date: powerCurve[duration]?.date || null,
    }));

    return {
      date_range: {
        start: startDate || 'all',
        end: endDate || 'all',
      },
      total_activities: activities.length,
      activities_with_power: activities.filter(a => a.power_curve).length,
      power_curve: curve,
    };
  }

  /**
   * Extract power for a specific duration from activity
   */
  private extractPowerForDuration(activity: IntervalsActivity, duration: number): number | null {
    // This is a simplified version - intervals.icu stores power curve data differently
    // For now, we'll use available power metrics
    if (duration === 1200 && activity.icu_ftp) {
      return activity.icu_ftp; // 20min power ≈ FTP
    }
    
    if (duration === 3600 && activity.average_watts) {
      return activity.average_watts; // 1 hour average
    }

    return null;
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  }
}
