'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

function FitnessSyncerCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authorization...');
  const [codeInput, setCodeInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(`Authorization failed: ${error}`);
      setTimeout(() => {
        router.push('/fitnesssyncer?error=' + encodeURIComponent(error));
      }, 2000);
      return;
    }

    if (code) {
      exchangeCode(code);
    } else {
      setShowInput(true);
      setStatus('processing');
      setMessage('Please paste the authorization code from the FitnessSyncer redirect URL');
    }
  }, [searchParams, router]);

  const exchangeCode = async (code: string) => {
    try {
      const response = await fetch('/api/v1/fitnesssyncer/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      
      const data = await response.json();
      
      if (data?.success) {
        setStatus('success');
        setMessage('Successfully connected to FitnessSyncer!');
        setTimeout(() => {
          router.push('/fitnesssyncer?connected=true');
        }, 2000);
      } else {
        throw new Error(data?.error || 'Failed to connect');
      }
    } catch (error: any) {
      console.error('Error exchanging code:', error);
      setStatus('error');
      const errorMsg = error.response?.data?.error_description || 
                      error.response?.data?.error || 
                      error.message || 
                      'Failed to exchange authorization code';
      setMessage(`Connection failed: ${errorMsg}`);
      setTimeout(() => {
        router.push(`/fitnesssyncer?error=${encodeURIComponent(errorMsg)}`);
      }, 3000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput.trim()) {
      setShowInput(false);
      setStatus('processing');
      setMessage('Connecting...');
      exchangeCode(codeInput.trim());
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '2rem',
    }}>
      <div style={{
        background: '#ffffff',
        padding: '3rem',
        borderRadius: '24px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        maxWidth: '500px',
        textAlign: 'center',
      }}>
        {showInput && status === 'processing' ? (
          <>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>
              Paste Authorization Code
            </h2>
            <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              After authorizing with FitnessSyncer, copy the <code>code</code> parameter from the redirect URL and paste it below:
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Paste code here"
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  fontSize: '1rem',
                }}
                autoFocus
              />
              <button
                type="submit"
                disabled={!codeInput.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: codeInput.trim() ? '#000000' : '#cccccc',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: codeInput.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: '600',
                  fontSize: '1rem',
                }}
              >
                Connect
              </button>
            </form>
            <button
              onClick={() => router.push('/fitnesssyncer')}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                color: '#666',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                textDecoration: 'underline',
              }}
            >
              Back to FitnessSyncer page
            </button>
          </>
        ) : status === 'processing' ? (
          <>
            <div className="loading-spinner" style={{ margin: '0 auto 1.5rem' }} />
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>
              Connecting to FitnessSyncer...
            </h2>
            <p style={{ color: '#666' }}>{message}</p>
          </>
        ) : status === 'success' ? (
          <>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#4CAF50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              fontSize: '2rem',
            }}>
              ✓
            </div>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600', color: '#4CAF50' }}>
              Success!
            </h2>
            <p style={{ color: '#666' }}>{message}</p>
            <p style={{ color: '#999', fontSize: '0.875rem', marginTop: '1rem' }}>
              Redirecting to FitnessSyncer page...
            </p>
          </>
        ) : (
          <>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#f44336',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              fontSize: '2rem',
              color: '#ffffff',
            }}>
              ✗
            </div>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600', color: '#f44336' }}>
              Connection Failed
            </h2>
            <p style={{ color: '#666' }}>{message}</p>
            <p style={{ color: '#999', fontSize: '0.875rem', marginTop: '1rem' }}>
              Redirecting back...
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function FitnessSyncerCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '2rem',
      }}>
        <div style={{
          background: '#ffffff',
          padding: '3rem',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          maxWidth: '500px',
          textAlign: 'center',
        }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>
            Loading...
          </h2>
        </div>
      </div>
    }>
      <FitnessSyncerCallbackContent />
    </Suspense>
  );
}
