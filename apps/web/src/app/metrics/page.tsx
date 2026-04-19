'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { MetricsLoading } from '@/components/loading';

type Tab = 'vitals' | 'sleep' | 'body' | 'form' | 'lactate' | 'ftp';

const sortByDate = (items: any[], key = 'date') =>
  [...items].sort((a, b) => String(a?.[key] || '').localeCompare(String(b?.[key] || '')));

// ── Reusable manual-entry section ────────────────────────────────────────────
function ManualEntrySection({
  title,
  unit,
  unitLabel,
  records,
  onAdd,
  onDelete,
  chartColor = '#7c3aed',
  yLabel,
}: {
  title: string;
  unit: string;
  unitLabel: string;
  records: any[];
  onAdd: (entry: { value: string; unit: string; date: string; notes: string }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  chartColor?: string;
  yLabel: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ value: '', unit, date: new Date().toISOString().split('T')[0], notes: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.value) { setError('Value is required.'); return; }
    setError('');
    setSaving(true);
    try {
      await onAdd(form);
      setForm({ value: '', unit, date: new Date().toISOString().split('T')[0], notes: '' });
      setShowForm(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const sorted = sortByDate(records);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '16px', fontWeight: '500' }}>{title}</span>
        <button
          onClick={() => { setShowForm(v => !v); setError(''); }}
          style={{
            padding: '0.45rem 1rem', fontSize: '13px', fontWeight: '500',
            background: showForm ? '#f1f5f9' : '#0f172a', color: showForm ? '#0f172a' : '#fff',
            border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ Add Entry'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
          padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>
                {unitLabel} *
              </label>
              <input
                type="number"
                step="any"
                required
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder={`e.g. ${unit === 'W' ? '280' : '3.8'}`}
                style={{
                  width: '100%', padding: '0.5rem 0.6rem', border: '1px solid #e2e8f0',
                  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>Unit</label>
              <input
                type="text"
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                style={{
                  width: '100%', padding: '0.5rem 0.6rem', border: '1px solid #e2e8f0',
                  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{
                  width: '100%', padding: '0.5rem 0.6rem', border: '1px solid #e2e8f0',
                  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. after ramp test"
              style={{
                width: '100%', padding: '0.5rem 0.6rem', border: '1px solid #e2e8f0',
                borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          {error && <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.55rem 1.4rem', background: '#0f172a', color: '#fff',
                border: 'none', borderRadius: '8px', fontSize: '14px',
                fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      )}

      {/* Chart */}
      <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
        {sorted.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sorted}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#999' }}
                label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }}
                formatter={(value: any) =>
                  value !== undefined && value !== null
                    ? [`${Number(value).toFixed(2)} ${records[0]?.unit || unit}`, title]
                    : ['N/A', title]
                }
              />
              <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} dot={{ r: 4 }} name={title} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: '#999', textAlign: 'center', padding: '3rem 0', fontSize: '14px' }}>No data yet — add your first entry above</p>
        )}
      </div>

      {/* History table */}
      {sorted.length > 0 && (
        <div style={{ background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: '500', color: '#64748b' }}>
            History ({sorted.length} {sorted.length === 1 ? 'entry' : 'entries'})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Date', 'Value', 'Unit', 'Notes'].map(h => (
                  <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sorted].reverse().map((row: any, i: number) => (
                <tr key={row.id || i} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.65rem 1rem', fontSize: '13px' }}>{row.date || '—'}</td>
                  <td style={{ padding: '0.65rem 1rem', fontSize: '13px', fontWeight: '600', color: chartColor }}>
                    {Number.isFinite(Number(row.value)) ? Number(row.value).toFixed(2) : '—'}
                  </td>
                  <td style={{ padding: '0.65rem 1rem', fontSize: '13px', color: '#64748b' }}>{row.unit || unit}</td>
                  <td style={{ padding: '0.65rem 1rem', fontSize: '13px', color: '#64748b' }}>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MetricsPage() {
  const [vitals, setVitals] = useState<any[]>([]);
  const [sleep, setSleep] = useState<any[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<any[]>([]);
  const [formScores, setFormScores] = useState<any[]>([]);
  const [lactateThresholds, setLactateThresholds] = useState<any[]>([]);
  const [ftpRecords, setFtpRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('vitals');

  const loadManual = async () => {
    const [lactateRes, ftpRes] = await Promise.all([
      apiClient.getLactateThresholds(),
      apiClient.getFtpRecords(),
    ]);
    const normRows = (rows: any[]) => rows.map((row: any) => {
      const rawDate = row?.date || row?.created_at;
      const date = rawDate ? String(rawDate).split('T')[0] : undefined;
      const value = Number(row?.value);
      return { ...row, date, value: Number.isFinite(value) ? value : undefined };
    }).filter((row: any) => row?.date && Number.isFinite(row?.value));
    setLactateThresholds(sortByDate(normRows(lactateRes.data?.records || [])));
    setFtpRecords(sortByDate(normRows(ftpRes.data?.records || [])));
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const from = ninetyDaysAgo.toISOString().split('T')[0];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const from30 = thirtyDaysAgo.toISOString().split('T')[0];

        const [vitalsRes, sleepRes, bodyRes, rollingRes] = await Promise.all([
          apiClient.getVitals(from),
          apiClient.getSleep(from30),
          apiClient.getBodyMetrics(from30),
          apiClient.getRollingSummary(90),
        ]);

        setVitals(sortByDate(vitalsRes.data || []));
        const sleepData = (sleepRes.data || []).map((s: any) => {
          const sleepTotalHr = s.sleep_total_min ? s.sleep_total_min / 60 : undefined;
          return {
            ...s,
            sleep_total_hr: sleepTotalHr,
            rem_hr: s.rem_min ? s.rem_min / 60 : undefined,
            deep_hr: s.deep_min ? s.deep_min / 60 : undefined,
            wake_hr: s.wake_min ? s.wake_min / 60 : undefined,
            sleep_debt_hr: sleepTotalHr !== undefined ? sleepTotalHr - 8 : undefined,
          };
        });
        setSleep(sortByDate(sleepData));
        setBodyMetrics(sortByDate(bodyRes.data || []));
        const rollingData = (rollingRes.data || []).map((row: any) => {
          const tss7d = Number(row?.tss7d);
          const tss28d = Number(row?.tss28d);
          if (!Number.isFinite(tss7d) || !Number.isFinite(tss28d)) return null;
          const atl = tss7d / 7;
          const ctl = tss28d / 28;
          return { date: row?.date, atl, ctl, tsb: ctl - atl };
        }).filter(Boolean);
        setFormScores(sortByDate(rollingData));
        await loadManual();
      } catch {
      } finally {
        setLoading(false);
      }
    };
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <MetricsLoading />;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'vitals', label: 'Vitals' },
    { id: 'sleep', label: 'Sleep' },
    { id: 'body', label: 'Body' },
    { id: 'form', label: 'Form' },
    { id: 'lactate', label: 'Lactate' },
    { id: 'ftp', label: 'FTP' },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', fontSize: '28px', fontWeight: '600', color: '#1a1a1a', letterSpacing: '-0.5px' }}>
        Metrics
      </h1>

      {/* Tabs */}
      <div style={{ marginBottom: '2rem', display: 'flex', gap: '0', borderBottom: '1px solid #e0e0e0' }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: '0.75rem 1.5rem', border: 'none', backgroundColor: 'transparent',
              cursor: 'pointer',
              borderBottom: activeTab === id ? '2px solid #1a1a1a' : '2px solid transparent',
              marginBottom: '-1px', fontWeight: activeTab === id ? '500' : '400',
              color: activeTab === id ? '#1a1a1a' : '#666', fontSize: '14px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── VITALS ── */}
      {activeTab === 'vitals' && (
        <>
          <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>Heart Rate & HRV</div>
            {vitals.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={vitals}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="resting_hr_bpm" stroke="#d32f2f" strokeWidth={1.5} dot={false} name="Resting HR (bpm)" />
                  <Line type="monotone" dataKey="hrv_ms" stroke="#1a1a1a" strokeWidth={1.5} dot={false} name="HRV (ms)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#999', textAlign: 'center', padding: '3rem', fontSize: '14px' }}>No vitals data available</p>
            )}
          </div>
          <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>Blood Pressure</div>
            {vitals.filter(v => v.systolic_bp || v.diastolic_bp).length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={vitals}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#999' }} domain={[60, 160]} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="systolic_bp" stroke="#d32f2f" strokeWidth={2} dot={{ r: 3 }} name="Systolic (mmHg)" />
                  <Line type="monotone" dataKey="diastolic_bp" stroke="#1976d2" strokeWidth={2} dot={{ r: 3 }} name="Diastolic (mmHg)" />
                  <ReferenceLine y={120} stroke="#ff9800" strokeDasharray="3 3" label={{ value: 'Normal Systolic', fontSize: 10, fill: '#ff9800' }} />
                  <ReferenceLine y={80} stroke="#4caf50" strokeDasharray="3 3" label={{ value: 'Normal Diastolic', fontSize: 10, fill: '#4caf50' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#999', textAlign: 'center', padding: '3rem', fontSize: '14px' }}>No blood pressure data available</p>
            )}
          </div>
        </>
      )}

      {/* ── SLEEP ── */}
      {activeTab === 'sleep' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>Sleeping Minutes</div>
            {sleep.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sleep}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#999' }} label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} formatter={(v: any) => v != null ? `${Math.round(v)} min` : 'N/A'} />
                  <Line type="monotone" dataKey="sleep_total_min" stroke="#1a1a1a" strokeWidth={2} dot={{ r: 4 }} name="Sleeping Minutes" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#999', textAlign: 'center', padding: '3rem', fontSize: '14px' }}>No sleep data available</p>
            )}
          </div>
          <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>Awakenings</div>
            {sleep.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sleep}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#999' }} label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} formatter={(v: any) => v != null ? `${Math.round(v)}` : 'N/A'} />
                  <Line type="monotone" dataKey="awakenings" stroke="#d32f2f" strokeWidth={2} dot={{ r: 4 }} name="Awakenings" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#999', textAlign: 'center', padding: '3rem', fontSize: '14px' }}>No awakenings data available</p>
            )}
          </div>
          <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>Sleep Debt</div>
            {sleep.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sleep}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#999' }} label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} formatter={(v: any) => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)} hrs` : 'N/A'} />
                  <ReferenceLine y={0} stroke="#999" strokeDasharray="5 5" strokeWidth={1} />
                  <Line type="monotone" dataKey="sleep_debt_hr" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} name="Sleep Debt" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#999', textAlign: 'center', padding: '3rem', fontSize: '14px' }}>No sleep debt data available</p>
            )}
          </div>
        </div>
      )}

      {/* ── BODY ── */}
      {activeTab === 'body' && (
        <>
          <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>Weight & Body Fat</div>
            {bodyMetrics.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={bodyMetrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#999' }} label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#999' }} label={{ value: 'Body Fat (%)', angle: 90, position: 'insideRight' }} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="weight_kg" stroke="#1a1a1a" strokeWidth={2} dot={{ r: 3 }} name="Weight (kg)" />
                  <Line yAxisId="right" type="monotone" dataKey="body_fat_pct" stroke="#ff9800" strokeWidth={2} dot={{ r: 3 }} name="Body Fat (%)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#999', textAlign: 'center', padding: '3rem', fontSize: '14px' }}>No body metrics data available</p>
            )}
          </div>
          {bodyMetrics.filter(b => b.muscle_mass_kg || b.fat_free_mass_kg).length > 0 && (
            <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>Body Composition</div>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={bodyMetrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#999' }} label={{ value: 'Mass (kg)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="muscle_mass_kg" stroke="#4caf50" strokeWidth={2} dot={{ r: 3 }} name="Muscle Mass (kg)" />
                  <Line type="monotone" dataKey="fat_free_mass_kg" stroke="#2196f3" strokeWidth={2} dot={{ r: 3 }} name="Fat-Free Mass (kg)" />
                  <Line type="monotone" dataKey="body_water_kg" stroke="#00bcd4" strokeWidth={2} dot={{ r: 3 }} name="Body Water (kg)" />
                  <Line type="monotone" dataKey="bone_mass_kg" stroke="#9e9e9e" strokeWidth={2} dot={{ r: 3 }} name="Bone Mass (kg)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ── FORM ── */}
      {activeTab === 'form' && (
        <div style={{ background: '#ffffff', padding: '1.5rem', border: '1px solid #e0e0e0' }}>
          <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>Form Scores (CTL / ATL / TSB)</div>
          {formScores.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={formScores}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
                <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e0e0e0', fontSize: '12px' }}
                  formatter={(value: any, name: string) =>
                    typeof value === 'number' ? [value.toFixed(1), name.toUpperCase()] : ['N/A', name.toUpperCase()]
                  }
                />
                <ReferenceLine y={0} stroke="#999" strokeDasharray="5 5" strokeWidth={1} />
                <Line type="monotone" dataKey="ctl" stroke="#1a1a1a" strokeWidth={2} dot={false} name="CTL" />
                <Line type="monotone" dataKey="atl" stroke="#d32f2f" strokeWidth={2} dot={false} name="ATL" />
                <Line type="monotone" dataKey="tsb" stroke="#1976d2" strokeWidth={2} dot={false} name="TSB" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#999', textAlign: 'center', padding: '3rem', fontSize: '14px' }}>No form score data available</p>
          )}
        </div>
      )}

      {/* ── LACTATE ── */}
      {activeTab === 'lactate' && (
        <ManualEntrySection
          title="Lactate Threshold"
          unit="mmol/L"
          unitLabel="Value (mmol/L)"
          records={lactateThresholds}
          chartColor="#7c3aed"
          yLabel="Lactate (mmol/L)"
          onAdd={async (entry) => {
            await apiClient.addLactateThreshold(entry);
            await loadManual();
          }}
        />
      )}

      {/* ── FTP ── */}
      {activeTab === 'ftp' && (
        <ManualEntrySection
          title="FTP (Functional Threshold Power)"
          unit="W"
          unitLabel="FTP (watts)"
          records={ftpRecords}
          chartColor="#0369a1"
          yLabel="Power (W)"
          onAdd={async (entry) => {
            await apiClient.addFtp(entry);
            await loadManual();
          }}
        />
      )}
    </div>
  );
}
