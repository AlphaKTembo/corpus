'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loading } from '@/components/loading';

export default function IngestionPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to FitnessSyncer page since ingestion is now handled there
    router.replace('/fitnesssyncer');
  }, [router]);

  return <Loading message="Redirecting to FitnessSyncer..." />;
}

