'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { Loading } from '@/components/loading';

export default function FitnessSyncerPage() {
  const router = useRouter();
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [showManualCode, setShowManualCode] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    // Check URL params for callback result
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    
    if (connected === 'true') {
      setIsConnected(true);
      setSyncStatus('Successfully connected to FitnessSyncer!');
      setTimeout(() => setSyncStatus(''), 5000);
      // Clean URL
      window.history.replaceState({}, '', '/fitnesssyncer');
    } else if (error) {
      setSyncStatus(`Connection failed: ${error}`);
      setTimeout(() => setSyncStatus(''), 5000);
      window.history.replaceState({}, '', '/fitnesssyncer');
    }
    
    checkConnection();
    getAuthUrl();
  }, []);

  const checkConnection = async () => {
    try {
      const response = await apiClient.getFitnessSyncerStatus();
      setIsConnected(response.data?.connected || false);
    } catch (error) {
      console.error('Error checking connection:', error);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const getAuthUrl = async () => {
    try {
      const response = await apiClient.getFitnessSyncerAuthUrl();
      // API client returns AxiosResponse, so access data property
      if (response.data?.authUrl) {
        setAuthUrl(response.data.authUrl);
      } else if (response.data?.error) {
        console.error('Error getting auth URL:', response.data.error);
        // Show the actual error from API instead of generic message
        setSyncStatus(`Error: ${response.data.error}`);
        setAuthUrl(null);
      } else {
        // No authUrl and no error - might be a configuration issue
        console.warn('No authUrl returned from API:', response.data);
        setAuthUrl(null);
      }
    } catch (error: any) {
      console.error('Error getting auth URL:', error);
      // Show the actual error message if available
      const errorMsg = error.response?.data?.error || error.message || 'Failed to get authorization URL';
      setSyncStatus(`Error: ${errorMsg}`);
      setAuthUrl(null);
    }
  };

  const handleConnect = () => {
    if (authUrl) {
      // Open FitnessSyncer authorization in a new window/tab
      // After authorization, user will be redirected to FitnessSyncer's page
      // They can then copy the URL and use /fitnesssyncer/redirect-handler for automatic connection
      const popup = window.open(
        authUrl,
        'fitnesssyncer-auth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      
      // Show helpful message
      setSyncStatus('After authorizing, copy the redirect URL and go to /fitnesssyncer/redirect-handler for automatic connection');
      setTimeout(() => setSyncStatus(''), 10000);
      
      // Optional: Check if popup was blocked
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Popup was blocked, fallback to same window redirect
        window.location.href = authUrl;
      }
    }
  };

  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      setSyncStatus('Please enter a code');
      return;
    }

    setLoading(true);
    setSyncStatus('Connecting...');
    try {
      // Exchange code for token via API - use relative URL to avoid local network permission
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
      const token = await (await import('@/lib/api-client')).apiClient.getToken?.() ?? '';
      const response = await fetch(`${apiBaseUrl}/v1/fitnesssyncer/callback`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: manualCode.trim() }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData?.error_description || errorData?.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();

      if (data?.success) {
        setIsConnected(true);
        setSyncStatus('Successfully connected!');
        setShowManualCode(false);
        setManualCode('');
        setTimeout(() => setSyncStatus(''), 5000);
        // Refresh connection status
        await checkConnection();
      } else {
        // Provide more helpful error messages
        let errorMsg = data?.error_description || data?.error || 'Invalid code';
        
        // Add helpful hints for common errors
        if (errorMsg.toLowerCase().includes('invalid') || errorMsg.toLowerCase().includes('expired')) {
          errorMsg += '. Note: Authorization codes expire quickly. Please get a fresh code from FitnessSyncer.';
        }
        
        setSyncStatus('Connection failed: ' + errorMsg);
      }
    } catch (error: any) {
      console.error('Error connecting:', error);
      const errorMsg = error.message || 'Connection failed';
      setSyncStatus('Connection failed: ' + errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus('Syncing...');
    try {
      await apiClient.triggerFitnessSyncerSync();
      setSyncStatus('Sync triggered successfully! Check ingestion status page for progress.');
      setTimeout(() => setSyncStatus(''), 5000);
    } catch (error: any) {
      setSyncStatus('Sync failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div>
      <h1 style={{ 
        marginBottom: '2.5rem', 
        fontSize: '3rem', 
        fontWeight: '700',
        color: '#000000',
        letterSpacing: '-1px',
      }}>FitnessSyncer Integration</h1>

      <div style={{
        background: '#ffffff',
        padding: '2rem',
        borderRadius: '24px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        marginBottom: '2rem',
      }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '600' }}>
          Connect Your FitnessSyncer Account
        </h2>
        <p style={{ marginBottom: '1.5rem', color: '#666', lineHeight: '1.6' }}>
          FitnessSyncer aggregates data from 100+ fitness apps and devices. Connect your account to automatically sync activities, vitals, sleep, and body metrics into Corpus.
        </p>

        {!isConnected ? (
          <div>
            <button
              onClick={handleConnect}
              disabled={!authUrl}
              style={{
                padding: '1rem 2rem',
                backgroundColor: authUrl ? '#000000' : '#cccccc',
                color: '#ffffff',
                border: 'none',
                borderRadius: '16px',
                cursor: authUrl ? 'pointer' : 'not-allowed',
                fontWeight: '600',
                fontSize: '1rem',
                boxShadow: authUrl ? '0 4px 12px rgba(0, 0, 0, 0.15)' : 'none',
              }}
            >
              Connect FitnessSyncer Account
            </button>
            {authUrl && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.1)' }}>
                <p style={{ marginBottom: '0.75rem', color: '#000', fontSize: '0.875rem', fontWeight: '600' }}>
                  ✅ Automatic Connection:
                </p>
                <ol style={{ marginLeft: '1.25rem', color: '#666', fontSize: '0.875rem', lineHeight: '1.8' }}>
                  <li>Click the button above to authorize with FitnessSyncer</li>
                  <li>After authorization, FitnessSyncer will redirect you to their page</li>
                  <li><strong>Copy the entire URL</strong> from your browser's address bar</li>
                  <li>Go to <a href="/fitnesssyncer/redirect-handler" style={{ color: '#000', textDecoration: 'underline', fontWeight: '600' }}>/fitnesssyncer/redirect-handler</a></li>
                  <li>Paste the URL - the code will be extracted and processed automatically! ✓</li>
                </ol>
                <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.8rem', fontStyle: 'italic' }}>
                  No need to manually extract the code - just paste the URL and it's done!
                </p>
              </div>
            )}
            {!authUrl && !loading && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '12px', border: '1px solid #ffc107' }}>
                <p style={{ color: '#856404', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  ⚠️ Unable to get authorization URL
                </p>
                <p style={{ color: '#856404', fontSize: '0.8rem' }}>
                  {syncStatus || 'Please check that FitnessSyncer credentials are configured in the server environment variables.'}
                </p>
                <button
                  onClick={() => {
                    setSyncStatus('');
                    getAuthUrl();
                  }}
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {syncStatus && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: syncStatus.includes('failed') ? '#ffebee' : '#e8f5e9', borderRadius: '8px', border: `1px solid ${syncStatus.includes('failed') ? '#f44336' : '#4CAF50'}` }}>
                <p style={{ color: syncStatus.includes('failed') ? '#c62828' : '#2e7d32', fontSize: '0.875rem', margin: 0 }}>
                  {syncStatus}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{
              padding: '1rem',
              backgroundColor: '#f0f9ff',
              borderRadius: '12px',
              marginBottom: '1rem',
              border: '1px solid rgba(0, 0, 0, 0.1)',
            }}>
              <span style={{ color: '#000000', fontWeight: '600' }}>✓ Connected</span>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                padding: '1rem 2rem',
                backgroundColor: syncing ? '#cccccc' : '#000000',
                color: '#ffffff',
                border: 'none',
                borderRadius: '16px',
                cursor: syncing ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '1rem',
                boxShadow: syncing ? 'none' : '0 4px 12px rgba(0, 0, 0, 0.15)',
              }}
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            {syncStatus && (
              <p style={{ marginTop: '1rem', color: syncStatus.includes('failed') ? '#f44336' : '#4CAF50', fontSize: '0.875rem' }}>
                {syncStatus}
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{
        background: '#ffffff',
        padding: '2rem',
        borderRadius: '24px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
      }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>
          How It Works
        </h2>
        <ol style={{ paddingLeft: '1.5rem', color: '#666', lineHeight: '1.8' }}>
          <li>Click "Connect FitnessSyncer Account" to authorize Corpus</li>
          <li>You'll be redirected to FitnessSyncer to log in and grant permissions</li>
          <li>After authorization, you'll be redirected back to Corpus</li>
          <li>Data will sync automatically on a schedule, or you can trigger manual syncs</li>
          <li>Synced data appears in your Activities, Metrics, and Dashboard pages</li>
        </ol>
      </div>

      <div style={{
        background: '#ffffff',
        padding: '2rem',
        borderRadius: '24px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        marginTop: '2rem',
      }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>
          What Gets Synced
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', color: '#666' }}>
          <div>
            <strong style={{ color: '#000000' }}>Activities</strong>
            <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Workouts, runs, rides, etc.</div>
          </div>
          <div>
            <strong style={{ color: '#000000' }}>Vitals</strong>
            <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>HRV, resting heart rate</div>
          </div>
          <div>
            <strong style={{ color: '#000000' }}>Sleep</strong>
            <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Sleep duration, REM, deep sleep</div>
          </div>
          <div>
            <strong style={{ color: '#000000' }}>Body Metrics</strong>
            <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Weight, body fat percentage</div>
          </div>
        </div>
      </div>
    </div>
  );
}

