'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';

const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/login', '/register', '/privacy'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname?.startsWith(`${p}/`),
  );

  useEffect(() => {
    if (loading || isPublic) return;
    if (!user) router.replace('/sign-in');
  }, [user, loading, isPublic, router]);

  if (isPublic) return <>{children}</>;

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
      }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
