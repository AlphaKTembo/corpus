'use client';

import { ErrorBoundaryWrapper } from './error-boundary-wrapper';
import Layout from './layout';
import { ClerkTokenProvider } from './clerk-token-provider';

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryWrapper>
      <ClerkTokenProvider />
      <Layout>{children}</Layout>
    </ErrorBoundaryWrapper>
  );
}

