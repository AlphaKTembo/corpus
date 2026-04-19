'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import { ActivitiesLoading } from '@/components/loading';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

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

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'analysis'>('list');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadActivities = async () => {
      try {
        const response = await apiClient.getActivities({ limit: 1000 });
        setActivities(response.data.activities || []);
      } catch (error: any) {
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
  }, []);

  const chartData = useMemo(() => {
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

  if (loading) {
    return <ActivitiesLoading />;
  }

  return (
    <div>
      <h1 style={{ 
        marginBottom: '2rem', 
        fontSize: '28px', 
        fontWeight: '600',
        color: '#1a1a1a',
        letterSpacing: '-0.5px',
      }}>Activities</h1>
      
      <div style={{ marginBottom: '2rem', display: 'flex', gap: '0', borderBottom: '1px solid #e0e0e0' }}>
        {(['list', 'analysis'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid #1a1a1a' : '2px solid transparent',
              marginBottom: '-1px',
              textTransform: 'capitalize',
              fontWeight: activeTab === tab ? '500' : '400',
              color: activeTab === tab ? '#1a1a1a' : '#666',
              fontSize: '14px',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'analysis' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {chartData.byType.length > 0 && (
            <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0', borderRadius: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>Activities by Type</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                  <Pie data={chartData.byType} cx="50%" cy="50%" outerRadius={90} fill="#8884d8" dataKey="value">
                    {chartData.byType.map((entry: any, index: number) => (
                      <Cell key={`cell-type-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartData.byDistance.length > 0 && (
            <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0', borderRadius: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>Activities by Distance</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                  <Pie data={chartData.byDistance} cx="50%" cy="50%" outerRadius={90} fill="#8884d8" dataKey="value">
                    {chartData.byDistance.map((entry: any, index: number) => (
                      <Cell key={`cell-distance-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartData.byTime.length > 0 && (
            <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0', borderRadius: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1rem' }}>Activities by Time</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                  <Pie data={chartData.byTime} cx="50%" cy="50%" outerRadius={90} fill="#8884d8" dataKey="value">
                    {chartData.byTime.map((entry: any, index: number) => (
                      <Cell key={`cell-time-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeTab === 'list' && (
        activities.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activities.slice(0, 50).map((activity) => (
            <Link
              key={activity.activity_id}
              href={`/activities/${activity.activity_id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{
                background: '#ffffff',
                padding: '1.5rem',
                border: '1px solid #e0e0e0',
                transition: 'border-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#1a1a1a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e0e0e0';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '20px' }}>{getSportEmoji(activity.sport)}</span>
                    <span style={{ fontSize: '16px', fontWeight: '500' }}>{activity.sport}</span>
                  </div>
                  <span style={{ color: '#999', fontSize: '13px' }}>
                    {new Date(activity.start_time_utc).toLocaleDateString()} {new Date(activity.start_time_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                  gap: '1rem',
                }}>
                  <div>
                    <div style={{ color: '#999', fontSize: '12px', marginBottom: '0.25rem' }}>Duration</div>
                    <div style={{ fontSize: '18px', fontWeight: '500', color: '#1a1a1a' }}>
                      {Math.floor(activity.duration_s / 3600) > 0 
                        ? `${Math.floor(activity.duration_s / 3600)}:${String(Math.floor((activity.duration_s % 3600) / 60)).padStart(2, '0')}`
                        : `${Math.floor(activity.duration_s / 60)}:${String(Math.floor(activity.duration_s % 60)).padStart(2, '0')}`
                      }
                    </div>
                  </div>

                  {activity.distance_m && (
                    <div>
                      <div style={{ color: '#999', fontSize: '12px', marginBottom: '0.25rem' }}>Distance</div>
                      <div style={{ fontSize: '18px', fontWeight: '500', color: '#1a1a1a' }}>
                        {(activity.distance_m / 1000).toFixed(1)} km
                      </div>
                    </div>
                  )}

                  {activity.distance_m && activity.duration_s > 0 && (
                    <div>
                      <div style={{ color: '#999', fontSize: '12px', marginBottom: '0.25rem' }}>Pace</div>
                      <div style={{ fontSize: '18px', fontWeight: '500', color: '#1a1a1a' }}>
                        {(() => {
                          const paceSecondsPerKm = (activity.duration_s / (activity.distance_m / 1000));
                          const minutes = Math.floor(paceSecondsPerKm / 60);
                          const seconds = Math.floor(paceSecondsPerKm % 60);
                          return `${minutes}:${String(seconds).padStart(2, '0')}`;
                        })()}
                      </div>
                    </div>
                  )}

                  {activity.distance_m && activity.duration_s > 0 && (
                    <div>
                      <div style={{ color: '#999', fontSize: '12px', marginBottom: '0.25rem' }}>Avg Speed</div>
                      <div style={{ fontSize: '18px', fontWeight: '500', color: '#1a1a1a' }}>
                        {((activity.distance_m / 1000) / (activity.duration_s / 3600)).toFixed(1)} km/h
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
          <div style={{
            background: '#ffffff',
            padding: '3rem',
            border: '1px solid #e0e0e0',
            textAlign: 'center',
          }}>
            <p style={{ color: '#666', fontSize: '15px' }}>
            No activities found. Run ingestion to populate data.
            </p>
          </div>
        )
      )}

      {activeTab === 'analysis' && activities.length === 0 && (
        <div style={{
          background: '#ffffff',
          padding: '3rem',
          border: '1px solid #e0e0e0',
          textAlign: 'center',
        }}>
          <p style={{ color: '#666', fontSize: '15px' }}>
          No activities found. Run ingestion to populate data.
          </p>
        </div>
      )}
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(remaining)}`;
}
