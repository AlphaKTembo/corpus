'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectHandlerPage() {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState('');
  const [status, setStatus] = useState<'ready' | 'processing' | 'success' | 'error'>('ready');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Check if we have a code in the URL (in case user navigates here directly)
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    
    if (code) {
      // Automatically process the code
      handleCode(code);
    }
  }, []);

  const extractCodeFromUrl = (url: string): string | null => {
    try {
      // Handle both full URLs and partial URLs
      let urlToParse = url.trim();
      
      // If it doesn't start with http, try to parse it as a relative URL or add protocol
      if (!urlToParse.startsWith('http')) {
        // If it starts with /, it's a path - try to construct full URL
        if (urlToParse.startsWith('/')) {
          urlToParse = window.location.origin + urlToParse;
        } else if (urlToParse.startsWith('?')) {
          // It's just query params
          urlToParse = window.location.origin + window.location.pathname + urlToParse;
        } else {
          // Try adding https://
          urlToParse = 'https://' + urlToParse;
        }
      }
      
      const urlObj = new URL(urlToParse);
      const code = urlObj.searchParams.get('code');
      
      // Decode the code in case it's URL encoded
      return code ? decodeURIComponent(code) : null;
    } catch (error) {
      console.error('Error parsing URL:', error);
      // Fallback: try regex extraction
      const match = url.match(/[?&]code=([^&]+)/);
      if (match) {
        try {
          return decodeURIComponent(match[1]);
        } catch {
          return match[1];
        }
      }
      return null;
    }
  };

  const handleCode = async (code: string) => {
    setStatus('processing');
    setMessage('Connecting...');
    
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
      const token = await (await import('@/lib/api-client')).apiClient.getToken?.() ?? '';
      const response = await fetch(`${apiBaseUrl}/v1/fitnesssyncer/callback`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: code.trim() }),
      });
      
      const data = await response.json();
      
      if (data?.success) {
        setStatus('success');
        setMessage('Successfully connected! Redirecting...');
        setTimeout(() => {
          router.push('/fitnesssyncer?connected=true');
        }, 1500);
      } else {
        throw new Error(data?.error_description || data?.error || 'Connection failed');
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'Connection failed');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    const code = extractCodeFromUrl(urlInput);
    if (!code) {
      setStatus('error');
      setMessage('No code found in URL. Please paste the full FitnessSyncer redirect URL.');
      return;
    }

    handleCode(code);
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
        maxWidth: '600px',
        width: '100%',
      }}>
        {status === 'ready' && (
          <>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>
              Paste FitnessSyncer Redirect URL
            </h2>
            <p style={{ marginBottom: '1.5rem', color: '#666', fontSize: '0.875rem', lineHeight: '1.6' }}>
              After authorizing with FitnessSyncer, copy the entire URL from your browser's address bar 
              and paste it below. The code will be extracted automatically.
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://personal.fitnesssyncer.com/?code=..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
                autoFocus
              />
              <button
                type="submit"
                disabled={!urlInput.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: urlInput.trim() ? '#000000' : '#cccccc',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: urlInput.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: '600',
                  fontSize: '1rem',
                }}
              >
                Connect Automatically
              </button>
            </form>
          </>
        )}
        
        {status === 'processing' && (
          <>
            <div className="loading-spinner" style={{ margin: '0 auto 1.5rem' }} />
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>
              Connecting...
            </h2>
            <p style={{ color: '#666' }}>{message}</p>
          </>
        )}
        
        {status === 'success' && (
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
          </>
        )}
        
        {status === 'error' && (
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
            <p style={{ color: '#666', marginBottom: '1rem' }}>{message}</p>
            <button
              onClick={() => {
                setStatus('ready');
                setUrlInput('');
                setMessage('');
              }}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#000000',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

