'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import { apiClient } from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FitnessDay {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

type Range = '30' | '60' | '90' | '180' | 'all';

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d: Record<string, number> = {};
  payload.forEach((p: any) => { d[p.dataKey] = p.value; });
  return (
    <div style={{
      background: '#0f172a', color: '#fff', borderRadius: '10px',
      padding: '0.7rem 1rem', fontSize: '13px', lineHeight: 1.8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#94a3b8' }}>{label}</div>
      {d.ctl !== undefined && <div><span style={{ color: '#3b82f6' }}>■</span> Fitness (CTL): <strong>{d.ctl.toFixed(1)}</strong></div>}
      {d.atl !== undefined && <div><span style={{ color: '#f43f5e' }}>■</span> Fatigue (ATL): <strong>{d.atl.toFixed(1)}</strong></div>}
      {d.tsb !== undefined && (
        <div>
          <span style={{ color: d.tsb >= 0 ? '#22c55e' : '#f97316' }}>■</span> Form (TSB):{' '}
          <strong style={{ color: d.tsb >= 0 ? '#22c55e' : '#f97316' }}>
            {d.tsb > 0 ? '+' : ''}{d.tsb.toFixed(1)}
          </strong>
        </div>
      )}
    </div>
  );
}

// ── Zone badge ─────────────────────────────────────────────────────────────────

function FormZone({ tsb }: { tsb: number }) {
  let label: string, bg: string, color: string;
  if (tsb > 25)        { label = 'Freshness'; bg = '#dcfce7'; color = '#15803d'; }
  else if (tsb > 5)    { label = 'Optimal';   bg = '#d1fae5'; color = '#065f46'; }
  else if (tsb >= -10) { label = 'Training';  bg = '#fef9c3'; color = '#854d0e'; }
  else if (tsb >= -25) { label = 'Overload';  bg = '#fed7aa'; color = '#9a3412'; }
  else                 { label = 'Danger';    bg = '#fee2e2'; color = '#991b1b'; }
  return (
    <span style={{
      background: bg, color, fontWeight: 600, fontSize: '12px',
      padding: '0.25rem 0.6rem', borderRadius: '999px',
    }}>{label}</span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FitnessPage() {
  const [data, setData] = useState<FitnessDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('90');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const start = new Date();
    start.setDate(start.getDate() - 180);
    const start_date = start.toISOString().split('T')[0];
    const end_date = new Date().toISOString().split('T')[0];

    apiClient.getIntervalsFitness({ start_date, end_date })
      .then((r: any) => {
        const raw = r.data?.data ?? [];
        const days: FitnessDay[] = raw
          .filter((d: any) => d.ctl != null && d.atl != null && d.tsb != null)
          .map((d: any) => ({
            date: d.date,
            ctl: parseFloat(d.ctl.toFixed(1)),
            atl: parseFloat(d.atl.toFixed(1)),
            tsb: parseFloat(d.tsb.toFixed(1)),
          }))
          .sort((a: FitnessDay, b: FitnessDay) => a.date.localeCompare(b.date));
        setData(days);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    if (!data.length) return [];
    const cutoff = range === 'all' ? null : (() => {
      const d = new Date(); d.setDate(d.getDate() - parseInt(range)); return d.toISOString().split('T')[0];
    })();
    const filtered = cutoff ? data.filter(d => d.date >= cutoff) : data;
    return filtered.map(d => ({
      ...d,
      label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    }));
  }, [data, range]);

  const latest = data[data.length - 1];
  const peak = data.reduce((best, d) => d.ctl > (best?.ctl ?? 0) ? d : best, data[0] ?? null);

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: '18px', border: '1px solid #e5e7eb',
    padding: '1.25rem 1.5rem', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
  };

  const statBox = (value: string | number, label: string, color: string): React.CSSProperties => ({});

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/dashboard" style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}>← Dashboard</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {[200, 400, 120].map((h, i) => (
            <div key={i} className="skeleton" style={{ height: h, borderRadius: '18px' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Back link + title */}
      <div>
        <Link href="/dashboard" style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}>← Dashboard</Link>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0.5rem 0 0.25rem', letterSpacing: '-0.5px' }}>
          Fitness & Form
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
          CTL (Chronic Training Load) = fitness built over 42 days. &nbsp;
          ATL (Acute Training Load) = fatigue over 7 days. &nbsp;
          TSB (Training Stress Balance) = form = CTL − ATL.
        </p>
      </div>

      {/* Stat cards */}
      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'FITNESS (CTL)', value: latest.ctl.toFixed(1), bg: '#1e40af', sub: peak ? `Peak ${peak.ctl.toFixed(1)} on ${peak.date}` : '' },
            { label: 'FATIGUE (ATL)', value: latest.atl.toFixed(1), bg: '#be123c', sub: 'Acute load — last 7 days' },
            { label: 'FORM (TSB)',    value: (latest.tsb > 0 ? '+' : '') + latest.tsb.toFixed(1), bg: latest.tsb >= 0 ? '#15803d' : '#ea580c', sub: '' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, color: '#fff', borderRadius: '16px',
              padding: '1.1rem 1.25rem', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}>
              <div style={{ fontSize: '11px', letterSpacing: '1px', opacity: 0.75, marginBottom: '0.4rem' }}>{s.label}</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
              {s.label === 'FORM (TSB)' && (
                <div style={{ marginTop: '0.5rem' }}><FormZone tsb={latest.tsb} /></div>
              )}
              {s.sub && <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '0.4rem' }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Range picker + chart */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>CTL / ATL / TSB over time</div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {(['30','60','90','180','all'] as Range[]).map(r => (
              <button key={r} onClick={() => setRange(r)} style={{
                padding: '0.35rem 0.75rem', borderRadius: '8px', border: 'none',
                background: range === r ? '#0f172a' : '#f1f5f9',
                color: range === r ? '#fff' : '#475569',
                fontWeight: 600, fontSize: '12px', cursor: 'pointer',
              }}>
                {r === 'all' ? 'All' : `${r}d`}
              </button>
            ))}
          </div>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                interval={Math.floor(chartData.length / 8)}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(val) => val === 'ctl' ? 'Fitness (CTL)' : val === 'atl' ? 'Fatigue (ATL)' : 'Form (TSB)'}
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />
              <Line type="monotone" dataKey="ctl" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="atl" stroke="#f43f5e" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="tsb" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            No fitness data available. Connect Intervals.icu in Connections.
          </div>
        )}
      </div>

      {/* Zone guide */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', marginBottom: '1rem' }}>Form (TSB) zones</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          {[
            { range: 'TSB > 25',       label: 'Freshness',  color: '#15803d', bg: '#dcfce7', desc: 'Very fresh — ideal for peak performance or racing.' },
            { range: '5 < TSB ≤ 25',   label: 'Optimal',    color: '#065f46', bg: '#d1fae5', desc: 'Well-rested with good fitness. Best training zone.' },
            { range: '-10 ≤ TSB ≤ 5',  label: 'Training',   color: '#854d0e', bg: '#fef9c3', desc: 'Accumulating load. Normal during a training block.' },
            { range: '-25 ≤ TSB < -10', label: 'Overload',   color: '#9a3412', bg: '#fed7aa', desc: 'High fatigue. Monitor recovery closely.' },
            { range: 'TSB < -25',       label: 'Danger',     color: '#991b1b', bg: '#fee2e2', desc: 'Overreaching risk. Prioritise rest.' },
          ].map(z => (
            <div key={z.label} style={{ background: z.bg, borderRadius: '12px', padding: '0.9rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: 700, color: z.color, fontSize: '13px' }}>{z.label}</span>
                <span style={{ fontSize: '11px', color: z.color, opacity: 0.75 }}>{z.range}</span>
              </div>
              <div style={{ fontSize: '12px', color: z.color, opacity: 0.85 }}>{z.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Data table toggle */}
      <div style={card}>
        <button
          onClick={() => setShowTable(t => !t)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '0.95rem', color: '#0f172a',
            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0,
          }}
        >
          <span>{showTable ? '▾' : '▸'}</span> Raw data ({chartData.length} days)
        </button>
        {showTable && (
          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['Date', 'Fitness (CTL)', 'Fatigue (ATL)', 'Form (TSB)', 'Zone'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...chartData].reverse().map((row, i) => (
                  <tr key={row.date} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{row.date}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#3b82f6', fontWeight: 600 }}>{row.ctl}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#f43f5e', fontWeight: 600 }}>{row.atl}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: row.tsb >= 0 ? '#15803d' : '#ea580c', fontWeight: 600 }}>
                      {row.tsb > 0 ? '+' : ''}{row.tsb}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}><FormZone tsb={row.tsb} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
