'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Link from 'next/link';
import { ActivityDetailLoading } from '@/components/loading';

// Emoji mapping for different sports
const getSportEmoji = (sport: string): string => {
  const sportLower = sport.toLowerCase();
  const emojiMap: Record<string, string> = {
    'run': '🏃',
    'running': '🏃',
    'swim': '🏊',
    'swimming': '🏊',
    'bike': '🚴',
    'cycling': '🚴',
    'ride': '🚴',
    'walk': '🚶',
    'walking': '🚶',
    'hike': '🥾',
    'hiking': '🥾',
    'yoga': '🧘',
    'strength': '💪',
    'weight': '💪',
    'gym': '💪',
    'crossfit': '💪',
    'climb': '🧗',
    'climbing': '🧗',
    'ski': '⛷️',
    'skiing': '⛷️',
    'snowboard': '🏂',
    'snowboarding': '🏂',
    'surf': '🏄',
    'surfing': '🏄',
    'row': '🚣',
    'rowing': '🚣',
    'triathlon': '🏊‍♂️',
    'other': '🏃',
  };
  
  return emojiMap[sportLower] || '🏃';
};

export default function ActivityDetailPage() {
  const params = useParams();
  const [activity, setActivity] = useState<any>(null);
  const [streams, setStreams] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [streamsLoading, setStreamsLoading] = useState(false);

  useEffect(() => {
    const loadActivity = async () => {
      try {
        const response = await apiClient.getActivity(params.id as string);
        setActivity(response.data);
        
        // Load streams
        setStreamsLoading(true);
        try {
          const streamsResponse = await apiClient.getActivityStreams(
            params.id as string,
            ['hr_bpm', 'power_w', 'cadence_rpm', 'speed_mps'],
            '60s'
          );
          setStreams(streamsResponse.data);
        } catch (streamError) {
          console.error('Failed to load streams:', streamError);
        } finally {
          setStreamsLoading(false);
        }
      } catch (error: any) {
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      loadActivity();
    }
  }, [params.id]);

  const streamPoints = useMemo(() => {
    if (!streams) return [];
    if (Array.isArray(streams)) return streams;
    if (Array.isArray(streams?.data)) return streams.data;
    return [];
  }, [streams]);

  const getHrValue = (point: any) => point?.hr_bpm ?? point?.heart_rate ?? null;
  const getPowerValue = (point: any) => point?.power_w ?? point?.power ?? null;
  const getCadenceValue = (point: any) => point?.cadence_rpm ?? point?.cadence ?? null;
  const getSpeedValue = (point: any) => point?.speed_mps ?? point?.speed ?? null;

  const chartData = streamPoints.map((point: any, index: number) => ({
    time: index,
    heartRate: getHrValue(point) ?? null,
    power: getPowerValue(point) ?? null,
    cadence: getCadenceValue(point) ?? null,
    speed: getSpeedValue(point) ? (getSpeedValue(point) * 3.6) : null, // Convert m/s to km/h
  }));

  const hrZones = useMemo(() => {
    const lthr = (activity as any)?.lthr ? Number((activity as any).lthr) : undefined;
    const maxHr = activity?.max_hr_bpm ? Number(activity.max_hr_bpm) : undefined;
    
    // Get zone definitions from intervals.icu first
    let zoneDefs: Array<{ label: string; min: number; max: number }> = [];
    try {
      const icuHrZones = (activity as any)?.icu_hr_zones;
      if (icuHrZones) {
        let zones: number[] | undefined;
        if (typeof icuHrZones === 'string') {
          zones = JSON.parse(icuHrZones);
        } else if (Array.isArray(icuHrZones)) {
          zones = icuHrZones;
        }
        
        if (zones && Array.isArray(zones) && zones.length >= 5) {
          // Use actual zone boundaries from intervals.icu
          // Support both 5-zone and 7-zone systems dynamically
          zoneDefs = zones.map((maxBpm, index) => ({
            label: `Z${index + 1}`,
            min: index === 0 ? 0 : zones[index - 1],
            max: index === zones.length - 1 ? 9999 : maxBpm,
          }));
        }
      }
    } catch (err) {
      console.warn('Failed to parse icu_hr_zones');
    }
    
    // Fallback: use Max HR-based 5-zone system (Garmin standard) if no zone definitions from intervals.icu
    if (zoneDefs.length === 0) {
      const hrReference = maxHr; // Use max HR for Garmin-style zones
      if (!hrReference) return null;
      
      zoneDefs = [
        { label: 'Z1', min: 0, max: hrReference * 0.6 },
        { label: 'Z2', min: hrReference * 0.6, max: hrReference * 0.7 },
        { label: 'Z3', min: hrReference * 0.7, max: hrReference * 0.8 },
        { label: 'Z4', min: hrReference * 0.8, max: hrReference * 0.9 },
        { label: 'Z5', min: hrReference * 0.9, max: 9999 },
      ];
    }

    const buckets = zoneDefs.map(def => ({ ...def, seconds: 0 }));
    let total = 0;

    // Try to use intervals.icu zone data first
    try {
      const icuZoneTimes = (activity as any)?.icu_hr_zone_times;
      if (icuZoneTimes) {
        // Handle both string (needs parsing) and array (already parsed) formats
        let zoneTimes: number[];
        if (typeof icuZoneTimes === 'string' && icuZoneTimes.trim() !== '') {
          zoneTimes = JSON.parse(icuZoneTimes);
        } else if (Array.isArray(icuZoneTimes)) {
          zoneTimes = icuZoneTimes;
        } else {
          throw new Error('Invalid format');
        }
        
        if (Array.isArray(zoneTimes) && zoneTimes.length >= 5) {
          // intervals.icu provides times in seconds for each zone
          total = zoneTimes.reduce((sum: number, time: number) => sum + (time || 0), 0);
          if (total > 0) {
            // Dynamically match zone times to buckets
            for (let i = 0; i < Math.min(zoneTimes.length, buckets.length); i++) {
              buckets[i].seconds = zoneTimes[i] || 0;
            }
            
            return {
              lthr,
              maxHr,
              zones: buckets.map(b => ({
                label: b.label,
                pct: (b.seconds / total) * 100,
                range: `${Math.round(b.min)}-${b.max >= 9999 ? `${Math.round(b.min)}+` : Math.round(b.max)} bpm`,
              })),
            };
          }
        }
      }
    } catch (err) {
      console.warn('Failed to parse icu_hr_zone_times:', err);
    }

    // Fallback to stream data or averages
    if (streamPoints.length > 0) {
      for (const point of streamPoints) {
        const hr = Number(getHrValue(point));
        if (!Number.isFinite(hr) || hr <= 0) continue;
        total += 1;
        const bucket = buckets.find(z => hr >= z.min && hr < z.max) || buckets[buckets.length - 1];
        bucket.seconds += 1;
      }
    } else if (activity?.avg_hr_bpm) {
      total = 1;
      const avgHr = Number(activity.avg_hr_bpm);
      const bucket = buckets.find(z => avgHr >= z.min && avgHr < z.max) || buckets[buckets.length - 1];
      bucket.seconds += 1;
    }

    if (total === 0) return null;

    return {
      lthr,
      maxHr,
      zones: buckets.map(b => ({
        label: b.label,
        pct: (b.seconds / total) * 100,
        range: `${Math.round(b.min)}-${b.max >= 9999 ? `${Math.round(b.min)}+` : Math.round(b.max)} bpm`,
      })),
    };
  }, [(activity as any)?.icu_hr_zones, (activity as any)?.lthr, activity?.max_hr_bpm, activity, streamPoints]);

  const powerZones = useMemo(() => {
    const np = activity?.np_watts ? Number(activity.np_watts) : undefined;
    const ifValue = activity?.if ? Number(activity.if) : undefined;
    let ftp = np && ifValue ? np / ifValue : undefined;
    if (!ftp && activity?.avg_power_w) {
      ftp = Number(activity.avg_power_w);
    }
    // Try to get FTP from intervals.icu
    if (!ftp && (activity as any)?.icu_ftp) {
      ftp = Number((activity as any).icu_ftp);
    }
    if (!ftp) return null;

    const zoneDefs = [
      { label: 'Z1', min: 0.0, max: 0.55 },
      { label: 'Z2', min: 0.55, max: 0.75 },
      { label: 'Z3', min: 0.75, max: 0.9 },
      { label: 'Z4', min: 0.9, max: 1.05 },
      { label: 'Z5', min: 1.05, max: 1.2 },
      { label: 'Z6', min: 1.2, max: 1.5 },
      { label: 'Z7', min: 1.5, max: 10 },
    ];

    const buckets = zoneDefs.map(def => ({ ...def, seconds: 0 }));
    let total = 0;

    // Try to use intervals.icu zone data first
    try {
      const icuZoneTimes = (activity as any)?.icu_zone_times;
      if (icuZoneTimes) {
        // Handle both string (needs parsing) and array (already parsed) formats
        let zoneTimes: any[];
        if (typeof icuZoneTimes === 'string' && icuZoneTimes.trim() !== '') {
          zoneTimes = JSON.parse(icuZoneTimes);
        } else if (Array.isArray(icuZoneTimes)) {
          zoneTimes = icuZoneTimes;
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
          const zoneTimes = timeValues;
          // intervals.icu provides times in seconds for each zone
          total = zoneTimes.reduce((sum: number, time: number) => sum + (time || 0), 0);
          if (total > 0) {
            // Dynamically match zone times to buckets
            for (let i = 0; i < Math.min(zoneTimes.length, buckets.length); i++) {
              buckets[i].seconds = zoneTimes[i] || 0;
            }
            
            return {
              ftp: Math.round(ftp),
              zones: buckets.map(b => ({
                label: b.label,
                pct: (b.seconds / total) * 100,
                range: `${Math.round(b.min * ftp)}-${b.max >= 10 ? `${Math.round(ftp)}+` : Math.round(b.max * ftp)}`,
              })),
            };
          }
        }
      }
    } catch (err) {
      console.warn('Failed to parse icu_zone_times:', err);
    }

    // Fallback to stream data or averages
    if (streamPoints.length > 0) {
      for (const point of streamPoints) {
        const power = Number(getPowerValue(point));
        if (!Number.isFinite(power) || power <= 0) continue;
        total += 1;
        const ratio = power / ftp;
        const bucket = buckets.find(z => ratio >= z.min && ratio < z.max) || buckets[buckets.length - 1];
        bucket.seconds += 1;
      }
    } else if (activity?.avg_power_w) {
      total = 1;
      const ratio = Number(activity.avg_power_w) / ftp;
      const bucket = buckets.find(z => ratio >= z.min && ratio < z.max) || buckets[buckets.length - 1];
      bucket.seconds += 1;
    }

    if (total === 0) return null;

    return {
      ftp: Math.round(ftp),
      zones: buckets.map(b => ({
        label: b.label,
        pct: (b.seconds / total) * 100,
        range: `${Math.round(b.min * ftp)}-${b.max >= 10 ? `${Math.round(ftp)}+` : Math.round(b.max * ftp)}`,
      })),
    };
  }, [activity?.np_watts, activity?.if, activity, streamPoints]);

  if (loading) {
    return <ActivityDetailLoading />;
  }

  if (!activity) {
    return (
      <div>
        <div style={{ marginBottom: '1rem' }}>
          <Link href="/activities" style={{ color: '#000000', textDecoration: 'none', fontWeight: '600' }}>← Back to Activities</Link>
        </div>
        <div>Activity not found</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/activities" style={{ color: '#2196F3', textDecoration: 'none' }}>← Back to Activities</Link>
      </div>
      <h1 style={{ 
        marginBottom: '2.5rem', 
        fontSize: '3rem', 
        fontWeight: '700',
        color: '#000000',
        letterSpacing: '-1px',
      }}>Activity Details</h1>
      
      {/* Activity Header */}
      <div style={{
        background: '#ffffff',
        padding: '1.5rem 2rem',
        borderRadius: '24px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>{getSportEmoji(activity.sport)}</span>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{activity.sport}</div>
            <div style={{ color: '#666', fontSize: '0.875rem' }}>
              {new Date(activity.start_time_utc).toLocaleDateString()} {new Date(activity.start_time_utc).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Main Metrics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {/* Duration Card */}
        <div style={{
          background: '#ffffff',
          padding: '1.5rem',
          borderRadius: '16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        }}>
          <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Duration</div>
          <div style={{ fontSize: '2rem', fontWeight: '600', color: '#000000', marginBottom: '0.25rem' }}>
            {Math.floor(activity.duration_s / 3600) > 0 
              ? `${Math.floor(activity.duration_s / 3600)}:${String(Math.floor((activity.duration_s % 3600) / 60)).padStart(2, '0')}`
              : `${Math.floor(activity.duration_s / 60)}:${String(Math.floor(activity.duration_s % 60)).padStart(2, '0')}`
            }
          </div>
          <div style={{ color: '#666', fontSize: '0.75rem' }}>
            {Math.floor(activity.duration_s / 3600) > 0 ? 'Hours' : 'Minutes'}
          </div>
        </div>

        {/* Distance Card */}
        {activity.distance_m && (
          <div style={{
            background: '#ffffff',
            padding: '1.5rem',
            borderRadius: '16px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
          }}>
            <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Distance</div>
            <div style={{ fontSize: '2rem', fontWeight: '600', color: '#000000', marginBottom: '0.25rem' }}>
              {(activity.distance_m / 1000).toFixed(1)}
            </div>
            <div style={{ color: '#666', fontSize: '0.75rem' }}>Kilometers</div>
          </div>
        )}

        {/* Pace Card */}
        {activity.distance_m && activity.duration_s > 0 && (
          <div style={{
            background: '#ffffff',
            padding: '1.5rem',
            borderRadius: '16px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
          }}>
            <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Pace</div>
            <div style={{ fontSize: '2rem', fontWeight: '600', color: '#000000', marginBottom: '0.25rem' }}>
              {(() => {
                const paceSecondsPerKm = (activity.duration_s / (activity.distance_m / 1000));
                const minutes = Math.floor(paceSecondsPerKm / 60);
                const seconds = Math.floor(paceSecondsPerKm % 60);
                return `${minutes}:${String(seconds).padStart(2, '0')}`;
              })()}
            </div>
            <div style={{ color: '#666', fontSize: '0.75rem' }}>Kilometer</div>
          </div>
        )}

        {/* Avg Speed Card */}
        {activity.distance_m && activity.duration_s > 0 && (
          <div style={{
            background: '#ffffff',
            padding: '1.5rem',
            borderRadius: '16px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
          }}>
            <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Avg Speed</div>
            <div style={{ fontSize: '2rem', fontWeight: '600', color: '#000000', marginBottom: '0.25rem' }}>
              {((activity.distance_m / 1000) / (activity.duration_s / 3600)).toFixed(1)}
            </div>
            <div style={{ color: '#666', fontSize: '0.75rem' }}>Kilometers per Hour</div>
          </div>
        )}
      </div>

      {/* Additional Metrics */}
      {(activity.tss || activity.avg_hr_bpm || activity.max_hr_bpm || activity.avg_power_w || activity.np_watts || activity.if) && (
        <div style={{
          background: '#ffffff',
          padding: '2rem',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          marginBottom: '2rem',
        }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: '600' }}>Additional Metrics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
            {activity.tss && (
              <div>
                <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>TSS</div>
                <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{activity.tss}</div>
              </div>
            )}
            {activity.avg_hr_bpm && (
              <div>
                <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Avg HR</div>
                <div style={{ fontWeight: '500', fontSize: '1.25rem' }}>{activity.avg_hr_bpm} bpm</div>
              </div>
            )}
            {activity.max_hr_bpm && (
              <div>
                <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Max HR</div>
                <div style={{ fontWeight: '500', fontSize: '1.25rem' }}>{activity.max_hr_bpm} bpm</div>
              </div>
            )}
            {activity.avg_power_w && (
              <div>
                <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Avg Power</div>
                <div style={{ fontWeight: '500', fontSize: '1.25rem' }}>{activity.avg_power_w}W</div>
              </div>
            )}
            {activity.np_watts && (
              <div>
                <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>NP</div>
                <div style={{ fontWeight: '500', fontSize: '1.25rem' }}>{activity.np_watts}W</div>
              </div>
            )}
            {activity.if && (
              <div>
                <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>IF</div>
                <div style={{ fontWeight: '500', fontSize: '1.25rem' }}>{activity.if}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {(hrZones || powerZones) && (
        <div style={{
          background: '#ffffff',
          padding: '2rem',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          marginBottom: '2rem',
        }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: '600' }}>Zones</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
            {hrZones ? (
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.25rem' }}>Heart Rate Zones</div>
                <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  {hrZones.lthr ? `Based on LTHR ${hrZones.lthr} bpm` : `Based on max HR ${hrZones.maxHr} bpm`}
                </div>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {hrZones.zones.map(zone => (
                    <div key={zone.label} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600 }}>{zone.label}</div>
                      <div style={{ background: '#f3f4f6', borderRadius: '999px', height: '10px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ width: `${zone.pct.toFixed(1)}%`, background: '#ef4444', height: '100%' }} />
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>{zone.pct.toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: '#666', fontSize: '0.9rem' }}>No heart rate zone data available for this activity.</div>
            )}

            {powerZones ? (
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.25rem' }}>Power Zones</div>
                <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Based on FTP {powerZones.ftp} W (NP / IF)
                </div>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {powerZones.zones.map(zone => (
                    <div key={zone.label} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600 }}>{zone.label}</div>
                      <div style={{ background: '#f3f4f6', borderRadius: '999px', height: '10px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ width: `${zone.pct.toFixed(1)}%`, background: '#8b5cf6', height: '100%' }} />
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>{zone.pct.toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: '#666', fontSize: '0.9rem' }}>No power zone data available for this activity.</div>
            )}
          </div>
        </div>
      )}

      {streamsLoading ? (
        <div style={{
          background: '#ffffff',
          padding: '2rem',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
        }}>
          Loading streams...
        </div>
      ) : chartData.length > 0 ? (
        <div style={{
          background: '#ffffff',
          padding: '2rem',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
        }}>
          <h2 style={{ marginBottom: '1.5rem' }}>Activity Streams</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                label={{ value: 'Time (samples)', position: 'insideBottom', offset: -5 }}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              {chartData.some((d: any) => d.heartRate !== null) && (
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="heartRate" 
                  stroke="#f44336" 
                  name="Heart Rate (bpm)"
                  dot={false}
                />
              )}
              {chartData.some((d: any) => d.power !== null) && (
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="power" 
                  stroke="#2196F3" 
                  name="Power (W)"
                  dot={false}
                />
              )}
              {chartData.some((d: any) => d.cadence !== null) && (
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="cadence" 
                  stroke="#4CAF50" 
                  name="Cadence (rpm)"
                  dot={false}
                />
              )}
              {chartData.some((d: any) => d.speed !== null) && (
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="speed" 
                  stroke="#FF9800" 
                  name="Speed (km/h)"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{
          background: '#ffffff',
          padding: '2rem',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
          color: '#666',
        }}>
          No stream data available for this activity
        </div>
      )}
    </div>
  );
}

