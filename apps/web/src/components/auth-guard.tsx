'use client';

/**
 * Auth is now handled by Clerk's clerkMiddleware in middleware.ts.
 * This component is kept for compatibility but simply renders children.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
