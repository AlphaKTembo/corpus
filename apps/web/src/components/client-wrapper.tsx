'use client';

import { ErrorBoundaryWrapper } from './error-boundary-wrapper';
import Layout from './layout';
import { AuthProvider } from './auth-provider';
import { AuthGuard } from './auth-guard';
import { FirebaseTokenProvider } from './firebase-token-provider';

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryWrapper>
      <AuthProvider>
        <FirebaseTokenProvider />
        <AuthGuard>
          <Layout>{children}</Layout>
        </AuthGuard>
      </AuthProvider>
    </ErrorBoundaryWrapper>
  );
}
