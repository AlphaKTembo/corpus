'use client';

import {
  User,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { firebaseAuth } from '@/lib/firebase';

const googleProvider = new GoogleAuthProvider();

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, (next) => {
      setUser(next);
      setLoading(false);
      if (next) {
        document.cookie = 'corpus_auth=1; path=/; max-age=604800; SameSite=Lax';
      } else {
        document.cookie = 'corpus_auth=; path=/; max-age=0; SameSite=Lax';
      }
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
    if (displayName?.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(firebaseAuth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(firebaseAuth);
    document.cookie = 'corpus_auth=; path=/; max-age=0; SameSite=Lax';
  }, []);

  const getIdToken = useCallback(async () => {
    const current = firebaseAuth.currentUser;
    if (!current) return null;
    return current.getIdToken();
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signInWithGoogle, signOut, getIdToken }),
    [user, loading, signIn, signUp, signInWithGoogle, signOut, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
