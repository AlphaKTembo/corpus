'use client';

// ── Shared primitive ──────────────────────────────────────────────────────────

function Bone({ w = '100%', h = 20, r = 10, mb = 0, mt = 0 }: {
  w?: string | number; h?: number; r?: number; mb?: number; mt?: number;
}) {
  return (
    <div className="skeleton" style={{
      width: w, height: h, borderRadius: r,
      marginBottom: mb, marginTop: mt, flexShrink: 0,
    }} />
  );
}

// ── Dashboard skeleton ────────────────────────────────────────────────────────

export function DashboardLoading() {
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: '18px',
    border: '1px solid #e5e7eb', padding: '1.25rem 1.5rem',
    boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Form metric row — 3 coloured tiles */}
      <div style={card}>
        <Bone h={14} w={80} r={6} mb={14} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {[0,1,2].map(i => <Bone key={i} h={72} r={10} />)}
        </div>
      </div>

      {/* Two-column charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div style={card}><Bone h={14} w={100} r={6} mb={16} /><Bone h={160} r={10} /></div>
        <div style={card}><Bone h={14} w={120} r={6} mb={16} /><Bone h={160} r={10} /></div>
      </div>

      {/* Full-width chart */}
      <div style={card}><Bone h={14} w={140} r={6} mb={16} /><Bone h={200} r={10} /></div>

      {/* Activity list */}
      <div style={card}>
        <Bone h={14} w={100} r={6} mb={16} />
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <Bone w={36} h={36} r={8} />
            <div style={{ flex: 1 }}>
              <Bone h={12} w="60%" r={6} mb={6} />
              <Bone h={10} w="35%" r={5} />
            </div>
            <Bone w={50} h={12} r={5} />
          </div>
        ))}
      </div>

      {/* Recovery + Sleep two-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div style={card}><Bone h={14} w={90} r={6} mb={16} /><Bone h={120} r={10} /></div>
        <div style={card}><Bone h={14} w={90} r={6} mb={16} /><Bone h={120} r={10} /></div>
      </div>
    </div>
  );
}

// ── Activities skeleton ───────────────────────────────────────────────────────

export function ActivitiesLoading() {
  return (
    <div>
      {/* Page title */}
      <Bone h={28} w={140} r={8} mb={32} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
        {[80,60,70,90].map((w, i) => <Bone key={i} h={32} w={w} r={6} mb={0} />)}
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '20px' }}>
        <Bone h={36} w={140} r={8} />
        <Bone h={36} w={120} r={8} />
        <Bone h={36} w={100} r={8} />
      </div>

      {/* Activity rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '42px 1fr 90px',
          alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem',
          background: '#fff', borderRadius: '12px', padding: '0.85rem 1rem',
          border: '1px solid #e5e7eb',
        }}>
          <Bone w={42} h={42} r={10} />
          <div>
            <Bone h={13} w="55%" r={6} mb={7} />
            <Bone h={11} w="40%" r={5} />
          </div>
          <Bone h={11} w={70} r={5} />
        </div>
      ))}
    </div>
  );
}

// ── Metrics skeleton ──────────────────────────────────────────────────────────

export function MetricsLoading() {
  return (
    <div>
      <Bone h={28} w={110} r={8} mb={32} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: '32px' }}>
        {[70,60,55,55,75,50].map((w, i) => <Bone key={i} h={36} w={w} r={0} mb={0} />)}
      </div>

      {/* Chart card */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <Bone h={14} w={160} r={6} mb={20} />
        <Bone h={240} r={6} />
      </div>

      {/* Data table header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {[0,1,2,3,4].map(i => <Bone key={i} h={12} r={4} />)}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {[0,1,2,3,4].map(j => <Bone key={j} h={14} r={4} />)}
        </div>
      ))}
    </div>
  );
}

// ── Medicals skeleton ─────────────────────────────────────────────────────────

export function MedicalsLoading() {
  return (
    <div>
      <Bone h={28} w={130} r={8} mb={8} />
      <Bone h={14} w={260} r={6} mb={32} />

      {/* New folder input area */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <Bone h={14} w={140} r={6} mb={12} />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Bone h={40} r={10} />
          <Bone h={40} w={90} r={10} />
        </div>
      </div>

      {/* Folder cards */}
      {[0,1,2].map(i => (
        <div key={i} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <Bone w={40} h={40} r={10} />
            <div style={{ flex: 1 }}>
              <Bone h={14} w="40%" r={6} mb={6} />
              <Bone h={11} w="20%" r={4} />
            </div>
            <Bone h={11} w={60} r={5} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Chat skeleton ─────────────────────────────────────────────────────────────

export function ChatLoading() {
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', gap: '1.5rem' }}>
      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Welcome bubble */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Bone w={36} h={36} r={18} />
          <div style={{ flex: 1, maxWidth: '70%' }}>
            <Bone h={80} r={14} />
          </div>
        </div>
        {/* User bubble (right) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Bone h={44} w="50%" r={14} />
        </div>
        {/* Assistant reply */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Bone w={36} h={36} r={18} />
          <div style={{ flex: 1, maxWidth: '75%' }}>
            <Bone h={120} r={14} />
          </div>
        </div>
        {/* Input bar at bottom */}
        <div style={{ marginTop: 'auto', background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem' }}>
          <Bone r={8} h={36} />
          <Bone w={44} h={36} r={8} />
        </div>
      </div>
      {/* History sidebar */}
      <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Bone h={36} r={10} />
        {[0,1,2,3,4].map(i => <Bone key={i} h={52} r={10} />)}
      </div>
    </div>
  );
}

// ── Connections skeleton ──────────────────────────────────────────────────────

export function ConnectionsLoading() {
  return (
    <div>
      <Bone h={28} w={160} r={8} mb={8} />
      <Bone h={14} w={280} r={6} mb={32} />
      {[0,1].map(i => (
        <div key={i} style={{ background: '#fff', borderRadius: '18px', border: '1px solid #e5e7eb', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <Bone w={48} h={48} r={12} />
            <div style={{ flex: 1 }}>
              <Bone h={16} w="45%" r={6} mb={8} />
              <Bone h={11} w="60%" r={5} />
            </div>
            <Bone h={36} w={100} r={10} />
          </div>
          <Bone h={1} w="100%" r={0} mb={16} />
          <Bone h={13} w="80%" r={5} mb={10} />
          <Bone h={13} w="65%" r={5} />
        </div>
      ))}
    </div>
  );
}

// ── Activity detail skeleton ──────────────────────────────────────────────────

export function ActivityDetailLoading() {
  return (
    <div>
      <Bone h={13} w={160} r={6} mb={24} />
      {/* Header card */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <Bone w={52} h={52} r={12} />
          <div style={{ flex: 1 }}>
            <Bone h={20} w="55%" r={7} mb={8} />
            <Bone h={12} w="35%" r={5} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.75rem' }}>
              <Bone h={10} w="60%" r={4} mb={8} />
              <Bone h={20} w="80%" r={5} />
            </div>
          ))}
        </div>
      </div>
      {/* Chart */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <Bone h={13} w={120} r={6} mb={16} />
        <Bone h={220} r={8} />
      </div>
      {/* Second chart */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '1.5rem' }}>
        <Bone h={13} w={100} r={6} mb={16} />
        <Bone h={180} r={8} />
      </div>
    </div>
  );
}

// ── Generic fallback (kept for pages without a specific skeleton) ──────────────

export function Loading({ message = '' }: { message?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '50vh' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="skeleton" style={{ height: '160px', borderRadius: '16px' }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: '18px', width: '220px', borderRadius: '9px' }} />
      {message && <div style={{ color: '#94a3b8', fontSize: '13px' }}>{message}</div>}
    </div>
  );
}
