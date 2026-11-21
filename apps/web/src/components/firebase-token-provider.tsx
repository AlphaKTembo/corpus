'use client';

import { useEffect } from 'react';
import { useAuth } from './auth-provider';
import { apiClient } from '@/lib/api-client';

/** Wires Firebase getIdToken into the api-client singleton. */
export function FirebaseTokenProvider() {
  const { getIdToken, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    apiClient.setTokenGetter(() => getIdToken());
  }, [getIdToken, loading]);

  return null;
}
