'use client';

import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import logo from '../public/logo.png';
import { apiClient } from '@/lib/api-client';
import { useAuth } from './auth-provider';

const toMillis = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const latestSyncTimestamp = (...values: Array<string | null | undefined>): string | null => {
  let latestValue: string | null = null;
  let latestMs = 0;
  for (const value of values) {
    const ms = toMillis(value);
    if (ms > latestMs) {
      latestMs = ms;
      latestValue = value || null;
    }
  }
  return latestValue;
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const syncLastSyncFromServer = useCallback(async () => {
    const localSync = localStorage.getItem('corpus_last_sync');
    try {
      const statusRes = await apiClient.getIngestStatus();
      const serverSync = latestSyncTimestamp(
        statusRes.data?.finishedAtUtc,
        statusRes.data?.startedAtUtc,
        statusRes.data?.latestDataUpdatedAt,
      );
      const latest = latestSyncTimestamp(serverSync, localSync);
      if (latest) {
        localStorage.setItem('corpus_last_sync', latest);
      } else {
        localStorage.removeItem('corpus_last_sync');
      }
      setLastSync(latest);
    } catch {
      setLastSync(localSync);
    }
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 767);
    };
    
    checkMobile();
    void syncLastSyncFromServer();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('focus', syncLastSyncFromServer);
    const syncPollId = window.setInterval(() => {
      void syncLastSyncFromServer();
    }, 60_000);

    // Onboarding redirect: send new users to profile-setup on first visit
    const onboarded = localStorage.getItem('corpus_onboarded');
    if (!onboarded && pathname !== '/profile-setup') {
      apiClient.getMedicalCoverLetter()
        .then((r: any) => {
          if (!r.data?.text?.trim()) {
            router.replace('/profile-setup');
          } else {
            localStorage.setItem('corpus_onboarded', '1');
          }
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('focus', syncLastSyncFromServer);
      window.clearInterval(syncPollId);
    };
  }, [pathname, router, syncLastSyncFromServer]);

  useEffect(() => {
    if (isMobile) setMobileDrawerOpen(false);
  }, [pathname, isMobile]);

  const handleQuickSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      // Phase 1: pull data from all sources in parallel (writes CSVs).
      // FitnessSyncer/Drive/Local failures are swallowed so one missing service can't block the rest.
      await Promise.allSettled([
        apiClient.syncIntervalsIcu(90),
        apiClient.triggerFitnessSyncerSync().catch(() => {}),
        (async () => {
          try { await apiClient.syncMedicalDrive(); } catch { /* not connected */ }
          try { await apiClient.syncMedicalLocal(); } catch { /* no local folder */ }
          try { await apiClient.rebuildMedicalCsvs(); } catch { /* nothing to rebuild */ }
        })(),
      ]);

      // Phase 2: generate AI summary AFTER all data is written to disk.
      // Running this in parallel with the sync caused a race condition (empty activities in payload).
      try {
        const summary = await apiClient.generateMedicalSummary();
        const summaryDate = summary.data?.date as string | undefined;
        await apiClient.getMedicalSummaryPayload({ date: summaryDate, refresh: true });
      } catch { /* summary generation optional */ }
      const now = new Date().toISOString();
      localStorage.setItem('corpus_last_sync', now);
      setLastSync(now);
      void syncLastSyncFromServer();
      setSyncMessage(null);
    } catch (error) {
      console.error('Quick sync failed', error);
      setSyncMessage('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };


  if (pathname === '/login' || pathname === '/register' || pathname?.startsWith('/sign-in') || pathname?.startsWith('/sign-up')) {
    return <>{children}</>;
  }

  const navItems = [
    { 
      href: '/dashboard', 
      label: 'Dashboard',
      icon: (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <rect x="9" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <rect x="2" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <rect x="9" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        </svg>
      )
    },
    { 
      href: '/activities', 
      label: 'Activities',
      icon: (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="2" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    { 
      href: '/metrics', 
      label: 'Metrics',
      icon: (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polyline points="2,12 5,8 8,10 11,6 14,9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="2" y1="14" x2="2" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      href: '/medicals',
      label: 'Medicals',
      icon: (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        </svg>
      ),
    },
    {
      href: '/chat',
      label: 'Chat',
      icon: (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3.5C2 2.67 2.67 2 3.5 2h9C13.33 2 14 2.67 14 3.5v6C14 10.33 13.33 11 12.5 11H9l-3 3v-3H3.5C2.67 11 2 10.33 2 9.5v-6z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
          <line x1="5" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      href: '/ai-context',
      label: 'AI Context',
      icon: (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.5 3C5.5 2.17 6.17 1.5 7 1.5h2c.83 0 1.5.67 1.5 1.5v.5a2.5 2.5 0 0 1 0 5H5a2.5 2.5 0 0 1 0-5V3z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
          <path d="M6 8.5v2M8 8.5v3M10 8.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="12.5" cy="3" r="1" fill="currentColor"/>
        </svg>
      )
    },
    {
      href: '/profile-setup',
      label: 'My Profile',
      icon: (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" fill="none"/>
          <path d="M3 13.5c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
        </svg>
      )
    },
    { 
      href: '/connections', 
      label: 'Connections',
      icon: (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="4" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" fill="none"/>
          <circle cx="12" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.3" fill="none"/>
          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.3" fill="none"/>
          <line x1="6.5" y1="7" x2="9.5" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="6.5" y1="9" x2="9.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )
    },
  ];

  const mobilePrimaryItems = navItems.filter((i) =>
    ['/dashboard', '/activities', '/chat'].includes(i.href),
  );

  const isChatPage = pathname === '/chat';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', paddingBottom: isMobile ? (isChatPage ? '0' : '76px') : '0' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
      <nav style={{
        background: '#f8fafc',
        borderRight: '1px solid #e5e7eb',
        padding: collapsed ? '1.5rem 0.6rem' : '1.5rem 1.25rem',
        width: collapsed ? '64px' : '240px',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        transition: 'width 0.22s ease, padding 0.22s ease',
        overflow: 'hidden',
      }}>
          {/* Logo row + collapse button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', minWidth: 0 }}>
            <Link href="/dashboard" style={{
              color: '#0f172a', textDecoration: 'none',
              padding: '0 0.25rem',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              overflow: 'hidden', minWidth: 0, flex: 1,
            }}>
              <Image src={logo} alt="Corpus" width={36} height={36}
                style={{ objectFit: 'contain', flexShrink: 0 }} priority />
              {!collapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>Corpus</span>
                  <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>Health & Training</span>
                </div>
              )}
            </Link>
            <button
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', padding: '4px', borderRadius: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#0f172a')}
              onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                {collapsed
                  ? <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  : <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                }
              </svg>
            </button>
          </div>

          {!collapsed && user && (
            <div style={{ padding: '0 0.5rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.displayName || user.email?.split('@')[0] || 'Welcome'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email || ''}
              </div>
            </div>
          )}

          {!collapsed && (
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
              Navigation
            </div>
          )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                style={{
                  color: pathname === item.href ? '#0f172a' : '#475569',
                  textDecoration: 'none',
                  padding: collapsed ? '0.7rem 0' : '0.7rem 0.75rem',
                  fontSize: '14px',
                  fontWeight: pathname === item.href ? '600' : '500',
                  backgroundColor: pathname === item.href ? '#e2e8f0' : 'transparent',
                  borderRadius: '10px',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: '0.75rem',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (pathname !== item.href) {
                    e.currentTarget.style.color = '#0f172a';
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                  }
                }}
                onMouseLeave={(e) => {
                  if (pathname !== item.href) {
                    e.currentTarget.style.color = '#475569';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', flexShrink: 0 }}>
                  {item.icon}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
        </div>

        <div style={{ padding: collapsed ? '1rem 0' : '1rem 0.5rem', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <button
              type="button"
              onClick={() => void signOut().then(() => router.replace('/sign-in'))}
              title="Sign out"
              style={{
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                borderRadius: 8,
                padding: collapsed ? '0.45rem' : '0.45rem 0.7rem',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {collapsed ? '⎋' : 'Sign out'}
            </button>
          </div>
          {!collapsed && (
            <>
              <button
                type="button"
                onClick={handleQuickSync}
                disabled={isSyncing}
                style={{
                  width: '100%', padding: '0.65rem 0.75rem', borderRadius: '8px',
                  border: '1px solid #0f172a',
                  background: isSyncing ? '#e2e8f0' : '#0f172a',
                  color: isSyncing ? '#64748b' : '#fff',
                  fontSize: '13px', fontWeight: 500,
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                }}
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <div style={{ marginTop: '0.4rem', fontSize: '11px', color: syncMessage === 'Sync failed' ? '#ef4444' : '#94a3b8', lineHeight: 1.4 }}>
                {syncMessage === 'Sync failed'
                  ? 'Sync failed'
                  : lastSync
                    ? `Last synced ${new Date(lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'Never synced'}
              </div>
            </>
          )}
          {collapsed && (
            <button
              type="button"
              onClick={handleQuickSync}
              disabled={isSyncing}
              title="Sync Now"
              style={{
                width: '100%', padding: '0.55rem 0', borderRadius: '8px',
                border: '1px solid #0f172a',
                background: isSyncing ? '#e2e8f0' : '#0f172a',
                color: isSyncing ? '#64748b' : '#fff',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L8 6M8 10L8 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M6 4L8 2L10 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M6 12L8 14L10 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </button>
          )}
        </div>
      </nav>
      )}

      {/* Main Content */}
      <main style={{
        flex: 1,
        padding: isMobile ? '1rem' : '2.5rem 2.5rem',
        maxWidth: '1200px',
        marginLeft: isMobile ? '0' : collapsed ? '64px' : '240px',
        width: isMobile ? '100%' : collapsed ? 'calc(100% - 64px)' : 'calc(100% - 240px)',
        background: '#f8fafc',
        minHeight: isMobile && isChatPage ? 'auto' : '100vh',
        transition: 'margin-left 0.22s ease, width 0.22s ease',
      }}>
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#ffffff',
        borderTop: '1px solid #e0e0e0',
        padding: '6px 0',
        zIndex: 100,
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
      }}>
          {mobilePrimaryItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 12px',
                  textDecoration: 'none',
                  color: isActive ? '#1a1a1a' : '#666',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '4px',
                  color: isActive ? '#1a1a1a' : '#666',
                }}>
                  {item.icon}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: isActive ? '600' : '400',
                  color: isActive ? '#1a1a1a' : '#666',
                }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={handleQuickSync}
            disabled={isSyncing}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              color: isSyncing ? '#bbb' : '#1a1a1a',
              flex: 1,
              minWidth: 0,
              cursor: isSyncing ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '4px',
              color: isSyncing ? '#bbb' : '#1a1a1a',
            }}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2 L8 6 M8 10 L8 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M6 4 L8 2 L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M6 12 L8 14 L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: isSyncing ? '400' : '600',
              color: isSyncing ? '#bbb' : '#1a1a1a',
            }}>
              {isSyncing ? 'Syncing' : 'Sync'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              color: '#1a1a1a',
              flex: 1,
              minWidth: 0,
              cursor: 'pointer',
            }}
          >
            <span style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '4px',
            }}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
            <span style={{ fontSize: '11px', fontWeight: 500 }}>Menu</span>
          </button>
      </nav>
      )}

      {/* Mobile Drawer */}
      {isMobile && mobileDrawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 140 }}>
          <button
            aria-label="Close menu"
            onClick={() => setMobileDrawerOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(15, 23, 42, 0.35)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          />
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '75vh',
            background: '#fff',
            borderTopLeftRadius: '18px',
            borderTopRightRadius: '18px',
            borderTop: '1px solid #e2e8f0',
            boxShadow: '0 -16px 48px rgba(15,23,42,0.2)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Menu</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  {lastSync
                    ? `Last synced ${new Date(lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'Never synced'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '0.5rem' }}>
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileDrawerOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      textDecoration: 'none',
                      color: isActive ? '#0f172a' : '#475569',
                      background: isActive ? '#f1f5f9' : 'transparent',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '14px',
                      padding: '0.72rem 0.8rem',
                      borderRadius: '10px',
                    }}
                  >
                    <span style={{ width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

