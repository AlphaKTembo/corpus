'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ConnectionsLoading } from '@/components/loading';


export default function ConnectionsPage() {
  const [intervalsConnected, setIntervalsConnected] = useState(false);
  const [intervalsAthleteId, setIntervalsAthleteId] = useState<string | null>(null);
  const [intervalsApiKey, setIntervalsApiKey] = useState('');
  const [intervalsManualId, setIntervalsManualId] = useState('');
  const [showManualId, setShowManualId] = useState(true);
  const [intervalsSaving, setIntervalsSaving] = useState(false);
  const [intervalsSyncing, setIntervalsSyncing] = useState(false);
  const [intervalsMsg, setIntervalsMsg] = useState('');
  const [intervalsLastSync, setIntervalsLastSync] = useState<string | null>(null);
  // GPT API key state
  const [gptApiKey, setGptApiKey] = useState<string | null>(null);
  // Keys are stored hashed server-side: the full key is only available right
  // after generating it. Otherwise we only know that one exists and its last 4 chars.
  const [hasGptKey, setHasGptKey] = useState(false);
  const [gptKeyHint, setGptKeyHint] = useState<string | null>(null);
  const [gptKeyGenerating, setGptKeyGenerating] = useState(false);
  const [gptKeyCopied, setGptKeyCopied] = useState(false);
  const [gptKeyVisible, setGptKeyVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  useEffect(() => {
    loadStatus();
    setIntervalsLastSync(localStorage.getItem('intervals_last_sync'));
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getMyCredentials();
      setIntervalsConnected(res.data?.intervalsConnected ?? false);
      setIntervalsAthleteId(res.data?.intervalsAthleteId ?? null);
      setGptApiKey(res.data?.apiKey ?? null);
      setHasGptKey(!!res.data?.hasApiKey);
      setGptKeyHint(res.data?.apiKeyHint ?? null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateApiKey = async (isRegen = false) => {
    if (isRegen && !confirm('This will invalidate your current key. Any GPT using the old key will stop working. Continue?')) return;
    setGptKeyGenerating(true);
    try {
      const res = await apiClient.generateApiKey();
      setGptApiKey(res.data.apiKey);
      setHasGptKey(true);
      setGptKeyHint(res.data.apiKey.slice(-4));
      setGptKeyVisible(true);
    } finally {
      setGptKeyGenerating(false);
    }
  };

  const handleCopyKey = async () => {
    if (!gptApiKey) return;
    await navigator.clipboard.writeText(gptApiKey);
    setGptKeyCopied(true);
    setTimeout(() => setGptKeyCopied(false), 2000);
  };

  const handleSaveIntervals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intervalsApiKey.trim()) { setIntervalsMsg('Please enter your API key.'); return; }
    setIntervalsSaving(true);
    setIntervalsMsg('Verifying credentials...');
    try {
      const res = await apiClient.saveIntervalsCredentials(
        intervalsApiKey.trim(),
        showManualId ? intervalsManualId.trim() || undefined : undefined,
      );
      if (res.data?.success) {
        setIntervalsConnected(true);
        setIntervalsAthleteId(res.data.athleteId);
        setIntervalsApiKey('');
        setIntervalsManualId('');
        setIntervalsMsg('Connected! Athlete ID: ' + res.data.athleteId);
        setTimeout(() => setIntervalsMsg(''), 6000);
      } else {
        setIntervalsMsg(res.data?.error || 'Failed to connect. Check your API key.');
      }
    } catch (err: any) {
      setIntervalsMsg(err.response?.data?.error || err.message || 'Failed to connect.');
    } finally {
      setIntervalsSaving(false);
    }
  };

  const handleDisconnectIntervals = () => {
    setShowDisconnectModal(true);
  };

  const confirmDisconnect = async (clearData: boolean) => {
    setShowDisconnectModal(false);
    try {
      await apiClient.disconnectIntervals(clearData);
      setIntervalsConnected(false);
      setIntervalsAthleteId(null);
      setIntervalsMsg(clearData ? 'Disconnected and synced data cleared.' : 'Disconnected. Your synced data is still stored.');
      setTimeout(() => setIntervalsMsg(''), 6000);
    } catch {
      setIntervalsMsg('Failed to disconnect.');
    }
  };

  const handleSyncIntervals = async () => {
    setIntervalsSyncing(true);
    setIntervalsMsg('Syncing last 90 days...');
    try {
      const res = await apiClient.syncIntervalsIcu(90);
      const d = res.data;
      const now = new Date().toISOString();
      localStorage.setItem('intervals_last_sync', now);
      setIntervalsLastSync(now);
      setIntervalsMsg(`Sync complete: ${d?.activities ?? 0} activities, ${d?.wellness ?? 0} wellness entries.`);
    } catch (err: any) {
      setIntervalsMsg(err.response?.data?.message || err.message || 'Sync failed.');
    } finally {
      setIntervalsSyncing(false);
    }
  };

  const card: React.CSSProperties = {
    background: '#fff', padding: '2rem', borderRadius: '20px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb', marginBottom: '1.5rem',
  };
  const badge = (connected: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
    background: connected ? '#dcfce7' : '#f3f4f6',
    color: connected ? '#15803d' : '#6b7280', whiteSpace: 'nowrap',
  });
  const btn = (variant: 'primary' | 'danger' | 'ghost', disabled = false): React.CSSProperties => ({
    padding: '0.65rem 1.4rem', borderRadius: '12px', border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem',
    transition: 'opacity 0.15s', opacity: disabled ? 0.5 : 1,
    background: variant === 'primary' ? '#111' : variant === 'danger' ? '#fee2e2' : '#f3f4f6',
    color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#dc2626' : '#374151',
    boxShadow: variant === 'primary' && !disabled ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
  });
  const msgStyle = (msg: string): React.CSSProperties => ({
    marginTop: '0.75rem', padding: '0.7rem 1rem', borderRadius: '10px', fontSize: '0.875rem',
    background: msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') || msg.toLowerCase().includes('invalid')
      ? '#fef2f2' : '#f0fdf4',
    color: msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') || msg.toLowerCase().includes('invalid')
      ? '#dc2626' : '#15803d',
    border: '1px solid transparent',
  });

  if (loading) {
    return <ConnectionsLoading />;
  }

  return (
    <div>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', marginBottom: '0.5rem' }}>
        Connections
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.95rem' }}>
        Connect your fitness data sources to sync your training data.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '1rem' }}>
          <div>
            <h2 style={{ fontWeight: 700, fontSize: '1.2rem', margin: 0, marginBottom: '0.25rem' }}>intervals.icu</h2>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
              Sync your training load, zones, power, HR and wellness data.
            </p>
          </div>
          <span style={badge(intervalsConnected)}>
            {intervalsConnected ? '✓ Connected' : 'Not connected'}
            {intervalsConnected && intervalsAthleteId ? ` · ${intervalsAthleteId}` : ''}
          </span>
        </div>

        {intervalsConnected ? (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={btn('primary', intervalsSyncing)} onClick={handleSyncIntervals} disabled={intervalsSyncing}>
                {intervalsSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button style={btn('danger')} onClick={handleDisconnectIntervals}>
                Disconnect
              </button>
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
              {intervalsLastSync
                ? `Last synced ${new Date(intervalsLastSync).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                : 'Never synced'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSaveIntervals}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.4rem', color: '#374151' }}>
                API Key
              </label>
              <input
                type="password"
                value={intervalsApiKey}
                onChange={e => setIntervalsApiKey(e.target.value)}
                placeholder="Paste your intervals.icu API key"
                style={{
                  width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px',
                  border: '1.5px solid #d1d5db', fontSize: '0.9rem', outline: 'none',
                  fontFamily: 'monospace', boxSizing: 'border-box',
                }}
                autoComplete="off"
              />
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.4rem' }}>
                Find it at intervals.icu → Settings → API Access. Your athlete ID will be auto-detected.
              </p>
            </div>

            <button type="button" onClick={() => setShowManualId(!showManualId)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.8rem', padding: 0, marginBottom: '1rem' }}>
              {showManualId ? '▾ Hide athlete ID field' : '▸ My athlete ID is different'}
            </button>

            {showManualId && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.4rem', color: '#374151' }}>
                  Athlete ID
                </label>
                <input
                  type="text"
                  value={intervalsManualId}
                  onChange={e => setIntervalsManualId(e.target.value)}
                  placeholder="e.g. i503907"
                  style={{
                    width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px',
                    border: '1.5px solid #d1d5db', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.4rem' }}>
                  Found in your profile URL: intervals.icu/athletes/<strong>i503907</strong>
                </p>
              </div>
            )}

            <button type="submit" style={btn('primary', intervalsSaving)} disabled={intervalsSaving}>
              {intervalsSaving ? 'Connecting...' : 'Connect intervals.icu'}
            </button>
          </form>
        )}

        {intervalsMsg && <div style={msgStyle(intervalsMsg)}>{intervalsMsg}</div>}
      </div>

      <div style={{ ...card, background: '#f8fafc' }}>
        <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem', color: '#0f172a' }}>
          How to get your intervals.icu API key
        </h3>
        <ol style={{ paddingLeft: '1.25rem', color: '#6b7280', fontSize: '0.875rem', lineHeight: '2' }}>
          <li>Log in to <a href="https://intervals.icu" target="_blank" rel="noreferrer" style={{ color: '#111', fontWeight: 600 }}>intervals.icu</a></li>
          <li>Click your avatar → <strong>Settings</strong></li>
          <li>Scroll to <strong>API Access</strong></li>
          <li>Click <strong>Show API Key</strong> and copy it</li>
          <li>Paste it above — your athlete ID will be detected automatically</li>
        </ol>
      </div>

      {/* ── GPT Access Key ───────────────────────────────────────── */}
      <div style={card}>
        <h2 style={{ fontWeight: 700, fontSize: '1.2rem', margin: '0 0 0.35rem' }}>Corpus GPT Key</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
          When the Corpus GPT asks for your key, paste this.
        </p>

        {gptApiKey ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: '#f8fafc', border: '1.5px solid #e2e8f0',
              borderRadius: '12px', padding: '0.75rem 1rem',
            }}>
              <code style={{ flex: 1, fontSize: '14px', fontFamily: 'monospace', letterSpacing: '0.06em', color: '#0f172a' }}>
                {gptKeyVisible ? gptApiKey : gptApiKey.slice(0, 3) + '•'.repeat(gptApiKey.length - 7) + gptApiKey.slice(-4)}
              </code>
              <button type="button" onClick={() => setGptKeyVisible(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.2rem', flexShrink: 0 }}>
                {gptKeyVisible
                  ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" fill="none"/><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" fill="none"/></svg>
                }
              </button>
            </div>
            <button type="button" onClick={handleCopyKey} style={{
              background: gptKeyCopied ? '#dcfce7' : '#0f172a', border: 'none', cursor: 'pointer',
              color: gptKeyCopied ? '#16a34a' : '#fff', padding: '0.75rem 1.1rem',
              fontWeight: 600, fontSize: '13px', borderRadius: '12px', flexShrink: 0, transition: 'all 0.15s',
            }}>
              {gptKeyCopied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ) : hasGptKey ? (
          <div style={{
            background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px',
            padding: '0.75rem 1rem', fontSize: '14px', color: '#334155',
          }}>
            Key active{gptKeyHint ? <> · ending in <code style={{ fontFamily: 'monospace' }}>…{gptKeyHint}</code></> : null}
            <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '0.35rem' }}>
              For security, keys are only shown once. Regenerate to get a new key.
            </div>
          </div>
        ) : (
          <button style={btn('primary', gptKeyGenerating)} disabled={gptKeyGenerating} onClick={() => handleGenerateApiKey(false)}>
            {gptKeyGenerating ? 'Generating…' : 'Generate My Key'}
          </button>
        )}

        {gptApiKey && (
          <p style={{ color: '#b45309', fontSize: '12px', margin: '0.6rem 0 0' }}>
            Copy this key now. It won&apos;t be shown again.
          </p>
        )}

        {(gptApiKey || hasGptKey) && (
          <button type="button" onClick={() => handleGenerateApiKey(true)} disabled={gptKeyGenerating}
            style={{ marginTop: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', padding: 0 }}>
            {gptKeyGenerating ? 'Regenerating…' : '↺ Regenerate key'}
          </button>
        )}
      </div>

      {/* Disconnect confirmation modal */}
      {showDisconnectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '2rem', maxWidth: '440px', width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Disconnect Intervals.icu
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              What would you like to do with your previously synced data — activities, sleep, vitals, and fitness history?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button onClick={() => confirmDisconnect(false)} style={{
                padding: '0.9rem 1.25rem', borderRadius: '14px', border: '2px solid #e5e7eb',
                background: '#f9fafb', cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>Keep my data</div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                  Your synced history stays in Corpus. Good if you plan to reconnect the same account later.
                </div>
              </button>
              <button onClick={() => confirmDisconnect(true)} style={{
                padding: '0.9rem 1.25rem', borderRadius: '14px', border: '2px solid #fecaca',
                background: '#fff5f5', cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ fontWeight: 600, color: '#dc2626', fontSize: '0.9rem' }}>Clear synced data</div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                  Removes all Intervals.icu activities, sleep, and fitness data. Use this if switching to a different account.
                </div>
              </button>
            </div>
            <button onClick={() => setShowDisconnectModal(false)} style={{
              width: '100%', padding: '0.65rem', borderRadius: '12px', border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', color: '#6b7280', fontSize: '0.875rem', fontWeight: 500,
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
