'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { apiClient } from '@/lib/api-client';

/**
 * Wires Clerk's getToken into the api-client singleton so all requests get a fresh Clerk JWT.
 */
export function ClerkTokenProvider() {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    apiClient.setTokenGetter(() => getToken());
  }, [getToken, isLoaded]);

  return null;
}
