'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import { DashboardLoading } from '@/components/loading';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

export default function DashboardPage() {
  const [brief, setBrief] = useState<any>(null);
  const [rolling, setRolling] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [sleep, setSleep] = useState<any[]>([]);
  const [vitals, setVitals] = useState<any[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<any[]>([]);
  const [formScores, setFormScores] = useState<any[]>([]);
  const [zoneSummary, setZoneSummary] = useState<any>(null);
  const [ingestStatus, setIngestStatus] = useState<any>(null);
  const [fitnessMetrics, setFitnessMetrics] = useState<any>(null);
  const [recoveryMetrics, setRecoveryMetrics] = useState<any>(null);
  const [activeFlags, setActiveFlags] = useState<Array<{ code: string; reason: string }>>([]);
  const [showFlagToasts, setShowFlagToasts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLetter, setHasLetter] = useState(true); // assume true until loaded

  const getLatestRecordTime = (items: any[], keys: string[]) => {
    if (!items || items.length === 0) return 'Not synced yet';
    let latest = 0;
    for (const item of items) {
      for (const key of keys) {
        const value = item?.[key];
        if (!value) continue;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) continue;
        latest = Math.max(latest, parsed.getTime());
        break;
      }
    }
    return latest ? new Date(latest).toLocaleString() : 'Not synced yet';
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const from = sevenDaysAgo.toISOString().split('T')[0];

        const formWindowStart = new Date();
        formWindowStart.setDate(formWindowStart.getDate() - 90);
        const formFrom = formWindowStart.toISOString().split('T')[0];

        const fitnessWindowEnd = new Date().toISOString().split('T')[0];
        const fitnessWindowStart = new Date();
        fitnessWindowStart.setDate(fitnessWindowStart.getDate() - 90);
        const fitnessFrom = fitnessWindowStart.toISOString().split('T')[0];

        const [
          briefRes,
          rollingRes,
          activitiesRes,
          sleepRes,
          vitalsRes,
          bodyRes,
          formScoresRes,
          zoneSummaryRes,
          ingestStatusRes,
          fitnessMetricsRes,
          recoveryMetricsRes,
        ] = await Promise.all([
          apiClient.getTodayBrief(),
          apiClient.getRollingSummary(90),
          apiClient.getActivities({ limit: 1000 }),
          apiClient.getSleep(from),
          apiClient.getVitals(from),
          apiClient.getBodyMetrics(from),
          apiClient.getFormScores(formFrom),
          apiClient.getLatestActivityZoneSummary(),
          apiClient.getIngestStatus(),
          apiClient.getIntervalsFitness({ start_date: fitnessFrom, end_date: fitnessWindowEnd }),
          apiClient.getIntervalsRecovery({ start_date: from }),
        ]);
        setBrief(briefRes.data);
        setRolling(rollingRes.data || []);
        setActivities(activitiesRes.data?.activities || []);
        // Convert sleep data from minutes to hours
        const sleepData = (sleepRes.data || []).map((s: any) => ({
          ...s,
          sleep_total_hr: s.sleep_total_min ? s.sleep_total_min / 60 : undefined,
          rem_hr: s.rem_min ? s.rem_min / 60 : undefined,
          deep_hr: s.deep_min ? s.deep_min / 60 : undefined,
        }));
        setSleep(sleepData);
        setVitals(vitalsRes.data || []);
        setBodyMetrics(bodyRes.data || []);
        setFormScores(formScoresRes.data || []);
        setZoneSummary(zoneSummaryRes.data || null);
        setIngestStatus(ingestStatusRes.data || null);
        setFitnessMetrics(fitnessMetricsRes.data?.data || null);
        setRecoveryMetrics(recoveryMetricsRes.data || null);
      } catch (error: any) {
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Check if user has written a letter to Corpus
    apiClient.getMedicalCoverLetter()
      .then((r: any) => setHasLetter(!!(r.data?.text?.trim())))
      .catch(() => setHasLetter(true));
  }, []);

  useEffect(() => {
    const flags = Array.isArray(brief?.flags) ? brief.flags : [];
    setActiveFlags(flags);
  }, [brief]);

  // Prepare chart data
  const chartData = React.useMemo(() => {
    if (activities.length === 0 && sleep.length === 0 && vitals.length === 0 && bodyMetrics.length === 0) {
      return null;
    }
    return prepareChartData(activities, rolling, sleep, vitals, bodyMetrics);
  }, [activities, rolling, sleep, vitals, bodyMetrics]);

  const activitiesLastSync = React.useMemo(
    () => getLatestRecordTime(activities, ['start_time_utc', 'start_time', 'date']),
    [activities],
  );
  const sleepLastSync = React.useMemo(
    () => getLatestRecordTime(sleep, ['date', 'start_time_utc', 'start_time']),
    [sleep],
  );
  const vitalsLastSync = React.useMemo(
    () => getLatestRecordTime(vitals, ['date', 'captured_at', 'start_time_utc']),
    [vitals],
  );
  const bodyMetricsLastSync = React.useMemo(
    () => getLatestRecordTime(bodyMetrics, ['date', 'measured_at']),
    [bodyMetrics],
  );
  const lastSyncDisplay = React.useMemo(() => {
    const candidate = ingestStatus?.finishedAtUtc || ingestStatus?.startedAtUtc || ingestStatus?.latestDataUpdatedAt;
    if (!candidate) return 'Not synced yet';
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) return 'Not synced yet';
    const relative = formatRelativeTime(parsed);
    return `${parsed.toLocaleString()}, ${relative}`;
  }, [ingestStatus]);

  const latestFormScore = React.useMemo(() => {
    if (!formScores || formScores.length === 0) return undefined;
    const sorted = [...formScores].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return sorted[sorted.length - 1];
  }, [formScores]);

  const formatOneDecimal = (value?: number) => {
    if (value === undefined || value === null || Number.isNaN(value)) return '0.0';
    return Number(value).toFixed(1);
  };


  const getRecoveryColor = (status?: string) => {
    switch (status) {
      case 'green': return '#4caf50';
      case 'yellow': return '#ff9800';
      case 'red': return '#d32f2f';
      default: return '#999';
    }
  };


  const latestRolling = React.useMemo(() => {
    if (!rolling || rolling.length === 0) return undefined;
    return [...rolling].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(-1)[0];
  }, [rolling]);

  const checklistMetrics = React.useMemo(() => {
    const readinessStatus = brief?.recovery?.status || 'unknown';
    const hrvDelta = brief?.recovery?.hrvDelta;
    const atl = latestRolling?.tss7d ? latestRolling.tss7d / 7 : undefined;
    const ctl = latestRolling?.tss28d ? latestRolling.tss28d / 28 : undefined;
    const tsb = atl !== undefined && ctl !== undefined ? Math.round((ctl - atl) * 10) / 10 : undefined;
    const fatigueGap = atl !== undefined && ctl !== undefined ? Math.round((atl - ctl) * 10) / 10 : undefined;

    const statusLabel = (status?: string) => {
      if (status === 'green') return 'Green';
      if (status === 'yellow') return 'Amber';
      if (status === 'red') return 'Red';
      return 'Unknown';
    };

    const hrvStatus = hrvDelta === undefined ? 'Unknown' : hrvDelta >= 0 ? 'Balanced' : hrvDelta <= -10 ? 'Unbalanced' : 'Trending Down';

    return {
      readinessStatus,
      readinessLabel: statusLabel(readinessStatus),
      hrvDelta,
      hrvStatus,
      tsb,
      atl,
      ctl,
      fatigueGap,
    };
  }, [brief, latestRolling]);

  const weeklyMix = React.useMemo(() => {
    if (!activities || activities.length === 0) return null;
    const latestActivityTs = Math.max(...activities.map((a: any) => new Date(a.start_time_utc).getTime()));
    if (!Number.isFinite(latestActivityTs)) return null;

    const latestDate = new Date(latestActivityTs);
    const windowStart = new Date(latestDate);
    windowStart.setDate(windowStart.getDate() - 6);

    const windowActivities = activities.filter((a: any) => {
      const ts = new Date(a.start_time_utc).getTime();
      return ts >= windowStart.getTime() && ts <= latestDate.getTime();
    });

    // Calculate time in each intensity zone from HR zone times
    const totalSeconds = { low: 0, high: 0, anaerobic: 0 };
    
    windowActivities.forEach((a: any) => {
      try {
        // Parse HR zone times (format: "[Z1, Z2, Z3, Z4, Z5, Z6, Z7]" in seconds)
        const zoneTimesData = a.icu_hr_zone_times;
        if (!zoneTimesData) return;
        
        // Handle both string (needs parsing) and array (already parsed) formats
        let zoneTimes: number[];
        if (typeof zoneTimesData === 'string') {
          zoneTimes = JSON.parse(zoneTimesData);
        } else if (Array.isArray(zoneTimesData)) {
          zoneTimes = zoneTimesData;
        } else {
          return;
        }
        
        if (!Array.isArray(zoneTimes) || zoneTimes.length < 7) return;
        
        // Polarized training model:
        // Low Aerobic (Z1-Z2): Recovery and easy aerobic
        totalSeconds.low += (zoneTimes[0] || 0) + (zoneTimes[1] || 0);
        
        // High Aerobic (Z3-Z4): Tempo and threshold
        totalSeconds.high += (zoneTimes[2] || 0) + (zoneTimes[3] || 0);
        
        // Anaerobic (Z5-Z7): VO2max and anaerobic
        totalSeconds.anaerobic += (zoneTimes[4] || 0) + (zoneTimes[5] || 0) + (zoneTimes[6] || 0);
      } catch (e) {
        // Skip activities with invalid zone data
      }
    });

    const totalTime = totalSeconds.low + totalSeconds.high + totalSeconds.anaerobic;
    if (totalTime === 0) return null;

    return {
      lowPct: Math.round((totalSeconds.low / totalTime) * 100),
      highPct: Math.round((totalSeconds.high / totalTime) * 100),
      anaerobicPct: Math.round((totalSeconds.anaerobic / totalTime) * 100),
    };
  }, [activities]);

  const activityPieData = React.useMemo(() => {
    const sportCounts: Record<string, number> = {};
    const sportStats: Record<string, { distanceKm: number; durationS: number; tss: number }> = {};
    activities.forEach((a) => {
      const sport = a.sport || 'Other';
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;
      if (!sportStats[sport]) {
        sportStats[sport] = { distanceKm: 0, durationS: 0, tss: 0 };
      }
      sportStats[sport].distanceKm += (a.distance_m || 0) / 1000;
      sportStats[sport].durationS += a.duration_s || 0;
      sportStats[sport].tss += a.tss || 0;
    });

    const colors: Record<string, string> = {
      'Run': '#2563eb',
      'Running': '#2563eb',
      'Swim': '#059669',
      'Swimming': '#059669',
      'Bike': '#7c3aed',
      'Cycling': '#7c3aed',
      'Ride': '#7c3aed',
      'Walk': '#0ea5e9',
      'Walking': '#0ea5e9',
      'Hike': '#16a34a',
      'Hiking': '#16a34a',
      'Yoga': '#f97316',
      'Strength': '#f59e0b',
      'Gym': '#f59e0b',
      'Other': '#6b7280',
    };

    const bucketTopN = (
      entries: Array<{ name: string; value: number; color: string; distanceKm?: number; durationS?: number; tss?: number }>,
      maxItems: number = 7,
    ) => {
      if (entries.length <= maxItems) return entries;
      const sorted = [...entries].sort((a, b) => b.value - a.value);
      const top = sorted.slice(0, maxItems);
      const remainder = sorted.slice(maxItems);
      const otherValue = remainder.reduce((sum, item) => sum + item.value, 0);
      const otherDistance = remainder.reduce((sum, item) => sum + (item.distanceKm || 0), 0);
      const otherDuration = remainder.reduce((sum, item) => sum + (item.durationS || 0), 0);
      const otherTss = remainder.reduce((sum, item) => sum + (item.tss || 0), 0);
      if (otherValue > 0) {
        top.push({
          name: 'Other',
          value: otherValue,
          color: '#9ca3af',
          distanceKm: otherDistance,
          durationS: otherDuration,
          tss: otherTss,
        });
      }
      return top;
    };

    const byType = bucketTopN(
      Object.entries(sportCounts).map(([sport, count]) => ({
        name: sport,
        value: count,
        color: colors[sport] || '#ccc',
        distanceKm: sportStats[sport]?.distanceKm || 0,
        durationS: sportStats[sport]?.durationS || 0,
        tss: sportStats[sport]?.tss || 0,
      })),
    );

    const byDistance = bucketTopN(
      Object.entries(sportStats).map(([sport, stats]) => ({
        name: sport,
        value: Number(stats.distanceKm.toFixed(1)),
        color: colors[sport] || '#ccc',
        distanceKm: stats.distanceKm,
        durationS: stats.durationS,
        tss: stats.tss,
      })),
    );

    const byTime = bucketTopN(
      Object.entries(sportStats).map(([sport, stats]) => ({
        name: sport,
        value: Number((stats.durationS / 3600).toFixed(1)),
        color: colors[sport] || '#ccc',
        distanceKm: stats.distanceKm,
        durationS: stats.durationS,
        tss: stats.tss,
      })),
    );

    return { byType, byDistance, byTime };
  }, [activities]);

  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const entry = payload[0];
    const data = entry?.payload || {};
    const percent = typeof entry?.percent === 'number' ? entry.percent : undefined;
    const distanceKm = Number(data.distanceKm);
    const durationS = Number(data.durationS);
    const tss = Number(data.tss);

    return (
      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', padding: '0.75rem 1rem', fontSize: '14px' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
          {data.name}{percent !== undefined ? `: ${(percent * 100).toFixed(1)}%` : ''}
        </div>
        <div>Completed Distance: {Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : 'n/a'}</div>
        <div>Completed Duration: {Number.isFinite(durationS) ? formatDuration(durationS) : 'n/a'}</div>
        <div>TSS: {Number.isFinite(tss) ? Math.round(tss) : 'n/a'}</div>
      </div>
    );
  };

  const readinessColor = getRecoveryColor(checklistMetrics.readinessStatus);
  const hrvColor =
    checklistMetrics.hrvDelta === undefined
      ? '#999'
      : checklistMetrics.hrvDelta >= 0
        ? '#4caf50'
        : checklistMetrics.hrvDelta <= -10
          ? '#d32f2f'
          : '#ff9800';

  const cardStyle = {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '20px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  } as const;
  const zoneBarBaseStyle = {
    height: '16px',
    background: '#f1f5f9',
    borderRadius: '999px',
    overflow: 'hidden',
    flex: 1,
  } as const;
  const zoneRowStyle = {
    display: 'grid',
    gridTemplateColumns: '42px 1fr 90px',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.6rem',
  } as const;

  const powerZoneColors: Record<string, string> = {
    Z1: '#e9d5ff',
    Z2: '#c4b5fd',
    Z3: '#a855f7',
    Z4: '#9333ea',
    Z5: '#7e22ce',
    Z6: '#6b21a8',
    Z7: '#4c1d95',
  };
  const hrZoneColors: Record<string, string> = {
    Z1: '#fecaca',
    Z2: '#fca5a5',
    Z3: '#f87171',
    Z4: '#ef4444',
    Z5: '#b91c1c',
  };
  const sectionTitleStyle = {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0f172a',
    letterSpacing: '-0.2px',
  } as const;

  const latestZoneActivity = React.useMemo(() => {
    const activity = zoneSummary?.activity;
    if (!activity?.startTimeUtc) return null;
    const dateLabel = new Date(activity.startTimeUtc).toLocaleString();
    const nameLabel = activity.name || activity.sport || 'Latest activity';
    return `${nameLabel} • ${dateLabel}`;
  }, [zoneSummary]);

  if (loading) {
    return <DashboardLoading />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* ── Profile setup nudge ─────────────────────────────────────── */}
      {!hasLetter && (
        <Link href="/profile-setup" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
            borderRadius: '18px', padding: '1.25rem 1.5rem',
            display: 'flex', alignItems: 'center', gap: '1.25rem',
            boxShadow: '0 4px 20px rgba(15,23,42,0.2)', cursor: 'pointer',
          }}>
            <div style={{ fontSize: '2rem', flexShrink: 0 }}>✍️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '0.2rem' }}>
                Build your Corpus profile
              </div>
              <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                Tell Corpus your goals and health context so every answer is tailored to you — takes 2 minutes.
              </div>
            </div>
            <div style={{ color: '#64748b', fontSize: '1.2rem', flexShrink: 0 }}>→</div>
          </div>
        </Link>
      )}

      {activeFlags.length > 0 && (
        <button
          type="button"
          onClick={() => setShowFlagToasts((prev) => !prev)}
          title="View flags"
          style={{
            position: 'fixed',
            top: '1.25rem',
            right: '1.25rem',
            zIndex: 210,
            width: '38px',
            height: '38px',
            borderRadius: '999px',
            border: '1px solid #fecaca',
            background: '#fee2e2',
            color: '#b91c1c',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 20px rgba(185, 28, 28, 0.18)',
          }}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>🚩</span>
        </button>
      )}

      {showFlagToasts && activeFlags.length > 0 && (
            <div style={{
          position: 'fixed',
          top: '4.5rem',
          right: '1.5rem',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          maxWidth: '320px',
            }}>
          {activeFlags.map((flag) => (
            <div
              key={flag.code}
              style={{
                background: '#0f172a',
                color: '#fff',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                boxShadow: '0 12px 24px rgba(15, 23, 42, 0.25)',
                fontSize: '13px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>{flag.code}</div>
              <div style={{ color: '#cbd5f5' }}>{flag.reason}</div>
              </div>
          ))}
                  </div>
      )}

        <div style={{
          ...cardStyle,
          marginTop: '1.25rem',
          padding: '1rem 1.25rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '15px', fontWeight: '600' }}>Form</div>
            <Link href="/fitness" style={{ fontSize: '12px', color: '#666', textDecoration: 'none' }}>View details</Link>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.5rem',
          }}>
            {fitnessMetrics?.latest ? (
              <>
                <div style={{
                  background: '#1e40ff',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '0.75rem',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '26px', fontWeight: '700' }}>{fitnessMetrics.latest.ctl.toFixed(1)}</div>
                  <div style={{ fontSize: '12px', letterSpacing: '0.6px' }}>FITNESS (CTL)</div>
                </div>
                <div style={{
                  background: '#ff6a00',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '0.75rem',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '26px', fontWeight: '700' }}>
                    {fitnessMetrics.latest.tsb > 0 ? '+' : ''}{fitnessMetrics.latest.tsb.toFixed(1)}
                  </div>
                  <div style={{ fontSize: '12px', letterSpacing: '0.6px' }}>FORM (TSB)</div>
                </div>
                <div style={{
                  background: '#e91e63',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '0.75rem',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '26px', fontWeight: '700' }}>{fitnessMetrics.latest.atl.toFixed(1)}</div>
                  <div style={{ fontSize: '12px', letterSpacing: '0.6px' }}>FATIGUE (ATL)</div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: '#999' }}>No form data available yet. Sync from intervals.icu to see your fitness metrics.</div>
            )}
          </div>
          {fitnessMetrics?.interpretation && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f0f0f0' }}>
              💡 {fitnessMetrics.interpretation}
            </div>
          )}
        </div>

      {brief ? (
        <>
          {zoneSummary !== null && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              <div style={{ ...cardStyle, padding: '1.5rem' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '0.35rem' }}>Power Zones</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '1.25rem' }}>
                  {latestZoneActivity ? `Latest activity: ${latestZoneActivity}` : 'Latest activity zones not available yet.'}
                  {zoneSummary?.power?.ftp ? ` (FTP ${zoneSummary.power.ftp} W)` : ''}
                </div>
                {zoneSummary?.power?.zones ? (
                  zoneSummary.power.zones.map((zone: any) => (
                    <div key={`power-${zone.label}`} style={zoneRowStyle}>
                      <div style={{ fontWeight: 600 }}>{zone.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={zoneBarBaseStyle}>
                          <div
                            style={{
                              width: `${Math.round(zone.pct)}%`,
                              height: '100%',
                              background: powerZoneColors[zone.label] || '#c4b5fd',
                              borderRadius: '999px',
                            }}
                          />
                        </div>
                        <div style={{ minWidth: '38px', fontWeight: 600 }}>{Math.round(zone.pct)}%</div>
                      </div>
                      <div style={{ textAlign: 'right', color: '#64748b', fontSize: '13px' }}>{zone.range}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '13px', color: '#999' }}>No power zone data yet.</div>
                )}
              </div>

              <div style={{ ...cardStyle, padding: '1.5rem' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '0.35rem' }}>Heart Rate Zones</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '1.25rem' }}>
                  {latestZoneActivity ? `Latest activity: ${latestZoneActivity}` : 'Latest activity zones not available yet.'}
                  {zoneSummary?.heartRate?.lthr ? ` (LTHR ${zoneSummary.heartRate.lthr} bpm)` : ''}
                </div>
                {zoneSummary?.heartRate?.zones ? (
                  zoneSummary.heartRate.zones.map((zone: any) => (
                    <div key={`hr-${zone.label}`} style={zoneRowStyle}>
                      <div style={{ fontWeight: 600 }}>{zone.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={zoneBarBaseStyle}>
                          <div
                            style={{
                              width: `${Math.round(zone.pct)}%`,
                              height: '100%',
                              background: hrZoneColors[zone.label] || '#f87171',
                              borderRadius: '999px',
                            }}
                          />
                        </div>
                        <div style={{ minWidth: '38px', fontWeight: 600 }}>{Math.round(zone.pct)}%</div>
                      </div>
                      <div style={{ textAlign: 'right', color: '#64748b', fontSize: '13px' }}>{zone.range}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '13px', color: '#999' }}>No heart rate zone data yet.</div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
            {/* Sleep Card */}
            <div style={{
              ...cardStyle,
              padding: '1.5rem',
            }}>
              <div style={{ fontSize: '12px', color: '#999', fontWeight: '400', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Sleep
                <span style={{ 
                  marginLeft: '0.5rem', 
                  fontSize: '10px', 
                  fontWeight: 'normal',
                  color: '#ccc',
                  cursor: 'help',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: '1px solid #e0e0e0',
                }} title="Your sleep patterns from intervals.icu">i</span>
              </div>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
                Last sync: {sleepLastSync}
              </div>
              {sleep.length > 0 ? (
                <>
                  {sleep[0]?.sleep_total_hr !== undefined ? (
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#1a1a1a', marginBottom: '0.5rem' }}>
                      {sleep[0].sleep_total_hr.toFixed(1)} hrs
                    </div>
                  ) : (
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#999', marginBottom: '0.5rem' }}>
                      No data
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '0.25rem', lineHeight: '1.4' }}>
                    Last night
                  </div>
                  {sleep.length > 1 && (
                    <>
                      <div style={{ fontSize: '13px', color: '#666', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f0f0f0' }}>
                        7d avg: {(
                          sleep.slice(0, 7).reduce((sum, s) => sum + (s.sleep_total_hr || 0), 0) / 
                          Math.min(7, sleep.filter(s => s.sleep_total_hr !== undefined).length)
                        ).toFixed(1)} hrs
                      </div>
                      {sleep[0]?.rem_hr !== undefined && (
                        <div style={{ fontSize: '13px', color: '#666', marginTop: '0.25rem' }}>
                          REM: {sleep[0].rem_hr.toFixed(1)} hrs
                        </div>
                      )}
                      {sleep[0]?.deep_hr !== undefined && (
                        <div style={{ fontSize: '13px', color: '#666', marginTop: '0.25rem' }}>
                          Deep: {sleep[0].deep_hr.toFixed(1)} hrs
                        </div>
                      )}
                      {sleep[0]?.efficiency_pct !== undefined && (
                        <div style={{ fontSize: '13px', color: '#666', marginTop: '0.25rem' }}>
                          Efficiency: {sleep[0].efficiency_pct.toFixed(0)}%
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#999', fontStyle: 'italic' }}>
                  No sleep data available
                </div>
              )}
            </div>

            <div style={{
              ...cardStyle,
              padding: '1.5rem',
            }}>
              <div style={{ fontSize: '12px', color: '#999', fontWeight: '400', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Recovery
                <span style={{ 
                  marginLeft: '0.5rem', 
                  fontSize: '10px', 
                  fontWeight: 'normal',
                  color: '#ccc',
                  cursor: 'help',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: '1px solid #e0e0e0',
                }} title="Your readiness to train based on HRV, resting heart rate, and sleep">i</span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.5rem',
              }}>
                <div 
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: getRecoveryColor(brief.recovery?.status),
                    flexShrink: 0,
                  }}
                  title={
                    brief.recovery?.status === 'green' 
                      ? 'Green: Fully recovered, ready for intense training'
                      : brief.recovery?.status === 'yellow'
                      ? 'Yellow: Partially recovered, moderate training recommended'
                      : brief.recovery?.status === 'red'
                      ? 'Red: Low recovery, rest or easy training recommended'
                      : 'Recovery status unknown'
                  }
                />
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#1a1a1a',
                  textTransform: 'capitalize',
            }}>
              {brief.recovery?.status || 'Unknown'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '0.25rem', lineHeight: '1.4' }}>
                {brief.recovery?.status === 'green' && (
                  <span>• Green: Fully recovered, ready for intense training</span>
                )}
                {brief.recovery?.status === 'yellow' && (
                  <span>• Yellow: Partially recovered, moderate training recommended</span>
                )}
                {brief.recovery?.status === 'red' && (
                  <span>• Red: Low recovery, rest or easy training recommended</span>
                )}
                {(!brief.recovery?.status || brief.recovery?.status === 'unknown') && (
                  <span>• Status based on training load, HRV, RHR, and sleep</span>
                )}
              </div>
              {brief.recovery?.hrvDelta !== undefined ? (
                <div style={{ fontSize: '13px', color: '#666', marginTop: '0.5rem' }}>
                  HRV Δ {brief.recovery.hrvDelta > 0 ? '+' : ''}{formatOneDecimal(brief.recovery.hrvDelta)}ms
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Heart Rate Variability change - positive is better">i</span>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#999', marginTop: '0.5rem', fontStyle: 'italic' }}>No HRV data</div>
              )}
              {brief.recovery?.rhrDelta !== undefined ? (
                <div style={{ fontSize: '13px', color: '#666' }}>
                  RHR Δ {brief.recovery.rhrDelta > 0 ? '+' : ''}{formatOneDecimal(brief.recovery.rhrDelta)} bpm
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Resting Heart Rate change - negative is better">i</span>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>No RHR data</div>
              )}
              {/* Intervals.icu Recovery Score Section */}
              {recoveryMetrics?.latest?.recovery_score !== undefined ? (
                <div style={{ 
                  fontSize: '13px', 
                  color: '#666',
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  background: recoveryMetrics.latest.recovery_score < 40 ? '#ffebee' : recoveryMetrics.latest.recovery_score < 60 ? '#fff8e1' : recoveryMetrics.latest.recovery_score >= 75 ? '#e8f5e9' : '#f5f5f5',
                  borderRadius: '4px',
                  border: `1px solid ${recoveryMetrics.latest.recovery_score < 40 ? '#ef5350' : recoveryMetrics.latest.recovery_score < 60 ? '#ffa726' : recoveryMetrics.latest.recovery_score >= 75 ? '#66bb6a' : '#e0e0e0'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      💚 Intervals.icu Recovery Score: <strong>{recoveryMetrics.latest.recovery_score}/100</strong>
                    </span>
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#ccc',
                      cursor: 'help',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: '1px solid #e0e0e0',
                      background: '#fff',
                    }} title={`HRV-based recovery score. Your HRV: ${recoveryMetrics.latest.hrv}ms (baseline: ${recoveryMetrics.baseline}ms)`}>i</span>
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '0.25rem', fontStyle: 'italic' }}>
                    {recoveryMetrics.interpretation || recoveryMetrics.latest.status}
                  </div>
                </div>
              ) : null}
              {/* Sleep Debt Section */}
              {brief.recovery?.sleepDebtMin !== undefined ? (
                <div style={{ fontSize: '13px', color: '#666', marginTop: '0.25rem' }}>
                  Sleep: {brief.recovery.sleepDebtMin >= 0 ? '+' : ''}{(brief.recovery.sleepDebtMin / 60).toFixed(1)}h
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Sleep surplus/deficit vs 8h target">i</span>
                </div>
              ) : null}
            </div>

          <div style={{
            background: '#ffffff',
              padding: '1.5rem',
              border: '1px solid #e0e0e0',
            }}>
              <div style={{ fontSize: '12px', color: '#999', fontWeight: '400', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Training Load
                <span style={{ 
                  marginLeft: '0.5rem', 
                  fontSize: '10px', 
                  fontWeight: 'normal',
                  color: '#ccc',
                  cursor: 'help',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: '1px solid #e0e0e0',
                }} title="Cumulative Training Stress Score - measures total training volume">i</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>7d <span style={{ 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    marginLeft: '0.25rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Last 7 days">i</span></span>
                  <span style={{ fontSize: '16px', fontWeight: '500' }}>{formatOneDecimal(brief.load?.tss7d ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>28d <span style={{ 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    marginLeft: '0.25rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Last 28 days">i</span></span>
                  <span style={{ fontSize: '16px', fontWeight: '500' }}>{formatOneDecimal(brief.load?.tss28d ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>90d <span style={{ 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    marginLeft: '0.25rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Last 90 days">i</span></span>
                  <span style={{ fontSize: '16px', fontWeight: '500' }}>{formatOneDecimal(brief.load?.tss90d ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>
                    Trend <span style={{ 
                      fontSize: '10px', 
                      color: '#ccc',
                      cursor: 'help',
                      marginLeft: '0.25rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      border: '1px solid #e0e0e0',
                    }} title="Whether your training load is increasing (up), decreasing (down), or stable (flat)">i</span>
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: '500', textTransform: 'uppercase' }}>
                    {brief.load?.trend || 'flat'}
                  </span>
                </div>
              </div>
              {(brief.load?.tss7d === 0 && brief.load?.tss28d === 0 && brief.load?.tss90d === 0) && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f0f0f0', fontSize: '11px', color: '#999', fontStyle: 'italic' }}>
                  No training data. Sync activities to see load.
                </div>
              )}
            </div>

            <div style={{
              ...cardStyle,
              padding: '1.5rem',
            }}>
              <div style={{ fontSize: '12px', color: '#999', fontWeight: '400', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Recommendation
                <span style={{ 
                  marginLeft: '0.5rem', 
                  fontSize: '10px', 
                  fontWeight: 'normal',
                  color: '#ccc',
                  cursor: 'help',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: '1px solid #e0e0e0',
                }} title="Suggested workout type based on your recovery and training load">i</span>
              </div>
              <div style={{
                fontSize: '20px',
                fontWeight: '500',
                color: '#1a1a1a',
                textTransform: 'capitalize',
                marginBottom: '0.5rem',
              }}>
                {brief.recommendation?.type || 'none'}
              </div>
              {brief.recommendation?.notes && brief.recommendation.notes.length > 0 ? (
                <div style={{ marginTop: '0.75rem', fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
                  {brief.recommendation.notes[0]}
                </div>
              ) : (
                <div style={{ marginTop: '0.75rem', fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                  No recommendation available
                </div>
              )}
            </div>
          </div>

          {brief?.flags && brief.flags.length > 0 && (
            <div style={{
              background: '#ffffff',
              padding: '1.5rem',
              border: '1px solid #e0e0e0',
              marginBottom: '3rem',
            }}>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>Flags</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {brief.flags.map((flag: any, i: number) => (
                  <div key={i} style={{
                    padding: '0.75rem',
                    fontSize: '13px',
                    borderLeft: `3px solid ${flag.severity === 'high' ? '#d32f2f' : flag.severity === 'medium' ? '#ff9800' : '#4caf50'}`,
                    background: '#fafafa',
                  }}>
                    <span style={{ fontWeight: '500', textTransform: 'uppercase', marginRight: '0.5rem' }}>
                      {flag.severity}:
                    </span>
                    <span>{flag.code} - {flag.reason}</span>
            </div>
                ))}
          </div>
        </div>
          )}
        </>
      ) : (
        <div style={{
          background: '#ffffff',
          padding: '3rem',
          border: '1px solid #e0e0e0',
          textAlign: 'center',
        }}>
          <p style={{ marginBottom: '1.5rem', fontSize: '15px', color: '#666' }}>
            No summary data available yet.
          </p>
          <Link href="/fitnesssyncer" style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: '#1a1a1a',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: '500',
          }}>
            Sync Data →
          </Link>
        </div>
      )}

      {chartData && (
        <div style={{ marginTop: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{ 
              fontSize: '20px', 
              fontWeight: '600',
              color: '#1a1a1a',
              margin: 0,
          }}>Activity Analytics</h2>
            <span style={{ 
              fontSize: '10px', 
              color: '#ccc',
              cursor: 'help',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: '1px solid #e0e0e0',
            }} title="Visual breakdown of your training activities over the last 10 days">i</span>
            </div>
            <span style={{ fontSize: '12px', color: '#999' }}>Last sync: {activitiesLastSync}</span>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
            gap: '1.5rem',
            marginBottom: '2rem',
          }}>
            {chartData.distanceData && chartData.distanceData.length > 0 && (
              <div style={{
              ...cardStyle,
                padding: '1.5rem',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>Distance (km)</div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData.distanceData}>
                    <defs>
                      <linearGradient id="colorDistance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                    <Tooltip
                      contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }}
                      formatter={(value: any) => [Math.round(Number(value)), 'km']}
                    />
                    <Area type="monotone" dataKey="km" stroke="#2563eb" fillOpacity={1} fill="url(#colorDistance)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.timeData && chartData.timeData.length > 0 && (
              <div style={{
                background: '#ffffff',
                padding: '1.5rem',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Time (hours)
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Total training time per day in hours">i</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData.timeData}>
                    <defs>
                      <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                    <Tooltip
                      contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }}
                      formatter={(value: any) => [Math.round(Number(value)), 'hours']}
                    />
                    <Area type="monotone" dataKey="hours" stroke="#059669" fillOpacity={1} fill="url(#colorTime)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.workoutsData && chartData.workoutsData.length > 0 && (
              <div style={{
                background: '#ffffff',
                padding: '1.5rem',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Workouts
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Number of activities per day">i</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData.workoutsData}>
                    <defs>
                      <linearGradient id="colorWorkouts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="workouts" stroke="#7c3aed" fillOpacity={1} fill="url(#colorWorkouts)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.sleepData && chartData.sleepData.some((s: any) => s.hours !== undefined) && (
              <div style={{
                background: '#ffffff',
                padding: '1.5rem',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Sleep
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Total sleep per night in hours">i</span>
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginBottom: '0.75rem' }}>
                  Last sync: {sleepLastSync}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData.sleepData}>
                    <defs>
                      <linearGradient id="colorSleep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                    <Tooltip 
                      contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }}
                      formatter={(value: any) => value !== undefined && value !== null ? `${value.toFixed(1)} hrs` : 'N/A'}
                    />
                    <Area type="monotone" dataKey="hours" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorSleep)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.vitalsData && chartData.vitalsData.length > 0 && (
              <div style={{
                background: '#ffffff',
                padding: '1.5rem',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Vitals
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Resting heart rate and HRV">i</span>
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginBottom: '0.75rem' }}>
                  Last sync: {vitalsLastSync}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData.vitalsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="resting_hr_bpm" stroke="#d32f2f" strokeWidth={1.5} dot={false} name="Resting HR (bpm)" />
                    <Line type="monotone" dataKey="hrv_ms" stroke="#1a1a1a" strokeWidth={1.5} dot={false} name="HRV (ms)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.vitalsData && chartData.vitalsData.filter((v: any) => v.systolic_bp || v.diastolic_bp).length > 0 && (
              <div style={{
                background: '#ffffff',
                padding: '1.5rem',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Blood Pressure
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Systolic and diastolic blood pressure">i</span>
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginBottom: '0.75rem' }}>
                  Last sync: {vitalsLastSync}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData.vitalsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#999' }} domain={[60, 160]} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="systolic_bp" stroke="#d32f2f" strokeWidth={1.5} dot={{ r: 2 }} name="Systolic (mmHg)" />
                    <Line type="monotone" dataKey="diastolic_bp" stroke="#1976d2" strokeWidth={1.5} dot={{ r: 2 }} name="Diastolic (mmHg)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.bodyMetricsData && chartData.bodyMetricsData.length > 0 && (
              <div style={{
                background: '#ffffff',
                padding: '1.5rem',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Body Metrics
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '10px', 
                    color: '#ccc',
                    cursor: 'help',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '1px solid #e0e0e0',
                  }} title="Weight and body fat percentage">i</span>
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginBottom: '0.75rem' }}>
                  Last sync: {bodyMetricsLastSync}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData.bodyMetricsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="weight_kg" stroke="#1a1a1a" strokeWidth={1.5} dot={false} name="Weight (kg)" />
                    <Line type="monotone" dataKey="body_fat_pct" stroke="#666" strokeWidth={1.5} dot={false} name="Body Fat (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {activityPieData.byType.length > 0 && (
              <div style={{
                ...cardStyle,
                padding: '1.5rem',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Activities by Type
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                    <Pie data={activityPieData.byType} cx="50%" cy="50%" outerRadius={90} fill="#8884d8" dataKey="value">
                      {activityPieData.byType.map((entry: any, index: number) => (
                        <Cell key={`cell-type-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {activityPieData.byDistance.length > 0 && (
              <div style={{
                ...cardStyle,
                padding: '1.5rem',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Activities by Distance
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                    <Pie data={activityPieData.byDistance} cx="50%" cy="50%" outerRadius={90} fill="#8884d8" dataKey="value">
                      {activityPieData.byDistance.map((entry: any, index: number) => (
                        <Cell key={`cell-distance-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {activityPieData.byTime.length > 0 && (
              <div style={{
                ...cardStyle,
                padding: '1.5rem',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>
                  Activities by Time
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                    <Pie data={activityPieData.byTime} cx="50%" cy="50%" outerRadius={90} fill="#8884d8" dataKey="value">
                      {activityPieData.byTime.map((entry: any, index: number) => (
                        <Cell key={`cell-time-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <Link href="/activities" style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#1a1a1a',
          color: '#ffffff',
          fontSize: '14px',
          fontWeight: '500',
        }}>
          View All Activities →
        </Link>
      </div>
    </div>
  );
}

function prepareChartData(activities: any[], rolling: any[], sleep: any[] = [], vitals: any[] = [], bodyMetrics: any[] = []) {
  // Don't return null if we have any data
  if ((!activities || activities.length === 0) && 
      (!sleep || sleep.length === 0) && 
      (!vitals || vitals.length === 0) && 
      (!bodyMetrics || bodyMetrics.length === 0)) {
    return null;
  }

  const activitiesByDate: Record<string, any[]> = {};
  if (activities && activities.length > 0) {
    activities.forEach(activity => {
      const date = new Date(activity.start_time_utc).toISOString().split('T')[0];
      if (!activitiesByDate[date]) {
        activitiesByDate[date] = [];
      }
      activitiesByDate[date].push(activity);
    });
  }

  const buildDateWindow = (anchorDate: string | null, days: number = 10) => {
  const dates: string[] = [];
    const base = anchorDate ? new Date(anchorDate) : new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(base);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
    return dates;
  };

  const latestActivityDate = activities && activities.length > 0
    ? new Date(Math.max(...activities.map((a: any) => new Date(a.start_time_utc).getTime()))).toISOString().split('T')[0]
    : null;
  const latestSleepDate = sleep && sleep.length > 0
    ? sleep.map((s: any) => s.date).filter(Boolean).sort().slice(-1)[0]
    : null;

  const activityDates = buildDateWindow(latestActivityDate, 10);
  const sleepDates = buildDateWindow(latestSleepDate, 10);

  const distanceData = activityDates.map(date => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    km: Math.round(
      (activitiesByDate[date] || []).reduce((sum, a) => sum + ((a.distance_m || 0) / 1000), 0),
    ),
  }));

  const timeData = activityDates.map(date => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    hours: Math.round(
      (activitiesByDate[date] || []).reduce((sum, a) => sum + ((a.duration_s || 0) / 60), 0) / 60,
    ),
  }));

  const workoutsData = activityDates.map(date => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    workouts: (activitiesByDate[date] || []).length,
  }));

  // Prepare sleep data
  const sleepByDate: Record<string, any> = {};
  if (sleep && sleep.length > 0) {
    sleep.forEach((s: any) => {
      sleepByDate[s.date] = s;
    });
  }
  
  const sleepData = sleepDates.map(date => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    hours: sleepByDate[date]?.sleep_total_hr || undefined,
  }));

  const sortedVitals = [...(vitals || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const sortedBodyMetrics = [...(bodyMetrics || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  return {
    distanceData,
    timeData,
    workoutsData,
    sleepData,
    vitalsData: sortedVitals,
    bodyMetricsData: sortedBodyMetrics,
  };
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(remaining)}`;
}

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return 'unknown';
  if (diffMs < 30 * 1000) return 'just now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hrs ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} months ago`;
  const years = Math.round(days / 365);
  return `${years} yrs ago`;
}
