'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { GoogleSignInButton } from '@/components/google-sign-in-button';

function googleErrorMessage(code: string): string {
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in was cancelled';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked. Allow popups for this site and try again.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized in Firebase. Add corpus.kurasika.tech under Authentication → Settings → Authorized domains.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is not enabled. Enable it in Firebase Authentication → Sign-in method.';
  }
  return 'Google sign-in failed. Please try again.';
}

export default function SignUpPage() {
  const { signUp, signInWithGoogle, user, loading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      await signUp(email, password, name);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
      if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists');
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak');
      } else if (code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else {
        setError('Sign up failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      router.replace('/dashboard');
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
      setError(googleErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #f8fafc 0%, #e2e8f0 100%)',
      padding: '1.5rem',
    }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '2rem 1.75rem',
          boxShadow: '0 8px 30px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Corpus</div>
          <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Create your account</div>
        </div>

        <GoogleSignInButton onClick={onGoogle} disabled={submitting} />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '1.1rem 0',
          color: '#94a3b8',
          fontSize: 12,
        }}>
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          or
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        </div>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
          Name
        </label>
        <input
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: '100%',
            padding: '0.7rem 0.8rem',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            marginBottom: '1rem',
            fontSize: 14,
          }}
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
          Email
        </label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: '0.7rem 0.8rem',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            marginBottom: '1rem',
            fontSize: 14,
          }}
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
          Password
        </label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%',
            padding: '0.7rem 0.8rem',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            marginBottom: '1rem',
            fontSize: 14,
          }}
        />

        {error && (
          <div style={{ color: '#dc2626', fontSize: 13, marginBottom: '0.85rem' }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: 8,
            border: 'none',
            background: '#0f172a',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>

        <div style={{ marginTop: '1.1rem', fontSize: 13, color: '#64748b', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link href="/sign-in" style={{ color: '#0f172a', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
