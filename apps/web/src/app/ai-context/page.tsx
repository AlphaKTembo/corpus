'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

const S = {
  card: {
    background: '#fff', borderRadius: '20px', border: '1px solid #e5e7eb',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '1.5rem', marginBottom: '1.25rem',
  } as React.CSSProperties,
  btn: (v: 'primary' | 'ghost' | 'outline', disabled = false): React.CSSProperties => ({
    padding: v === 'primary' ? '0.65rem 1.4rem' : '0.5rem 1rem',
    borderRadius: '10px', border: v === 'outline' ? '1.5px solid #d1d5db' : 'none',
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
    fontSize: '0.875rem', opacity: disabled ? 0.5 : 1, transition: 'opacity .15s',
    background: v === 'primary' ? '#111' : v === 'outline' ? '#fff' : '#f3f4f6',
    color: v === 'primary' ? '#fff' : '#374151',
    boxShadow: v === 'primary' && !disabled ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
  }),
};

function CoverLetterCard() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  useEffect(() => {
    apiClient.getMedicalCoverLetter()
      .then(r => { setText(r.data?.text ?? ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.updateMedicalCoverLetter(text);
      flash('Saved');
    } catch { flash('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.card}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a', margin: '0 0 0.3rem' }}>
          Letter to Corpus
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
          Personal health context sent to the AI with every question — allergies, conditions, medications, goals, notes.
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Loading…</div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
            placeholder="E.g. I have Type 1 diabetes, I'm training for a marathon, I'm allergic to NSAIDs, currently on metformin…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.85rem 1rem', borderRadius: '12px',
              border: '1.5px solid #e2e8f0', fontSize: '0.875rem',
              lineHeight: 1.7, resize: 'vertical', fontFamily: 'inherit',
              outline: 'none', color: '#0f172a', background: '#fafafa',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#94a3b8')}
            onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
            <span style={{ fontSize: '0.78rem', color: msg ? '#15803d' : 'transparent' }}>{msg || '.'}</span>
            <button style={S.btn('primary', saving)} disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save letter'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PayloadCard() {
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.getMedicalSummaryPayload({ refresh: true });
      setPayload(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load payload');
    } finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corpus-payload-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggle = () => {
    if (!open && !payload) load();
    setOpen(o => !o);
  };

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: open ? '1rem' : 0 }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a', margin: '0 0 0.3rem' }}>
            Corpus Payload
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
            The full JSON context sent to the AI — view or download for debugging.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: '1rem' }}>
          {payload && (
            <button style={S.btn('outline')} onClick={handleDownload}>↓ Download JSON</button>
          )}
          <button style={S.btn('outline')} onClick={handleToggle}>
            {open ? 'Hide' : 'View Payload'}
          </button>
        </div>
      </div>

      {open && (
        loading ? (
          <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Loading payload…</div>
        ) : error ? (
          <div style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</div>
        ) : payload ? (
          <pre style={{
            background: '#0f172a', color: '#e2e8f0', borderRadius: '12px',
            padding: '1rem', fontSize: '11.5px', lineHeight: 1.6, margin: 0,
            overflowX: 'auto', maxHeight: '480px', overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
          }}>
            {JSON.stringify(payload, null, 2)}
          </pre>
        ) : (
          <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No payload loaded.</div>
        )
      )}
    </div>
  );
}

export default function AiContextPage() {
  return (
    <div>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', marginBottom: '0.35rem' }}>
        AI Context
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: '2rem' }}>
        Control what Corpus knows about you and inspect the data it uses when answering.
      </p>

      <CoverLetterCard />
      <PayloadCard />
    </div>
  );
}
