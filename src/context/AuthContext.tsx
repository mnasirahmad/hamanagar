import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

export type UserRole = 'admin' | 'accounts' | 'sales' | 'recovery' | 'viewer';

export interface ErpUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export interface CompanySettings {
  id: number;
  companyName: string;
  subtitle: string;
  address: string;
  phone: string;
  logoUrl: string;
  financialYearStart: string;
  financialYearEnd: string;
  currency: string;
  invoicePrefix: string;
  crvPrefix: string;
  cpvPrefix: string;
  jvPrefix: string;
  defaultInstallmentMonths: number;
  lateFeePercent: string;
  gracePeriodDays: number;
  receiptTerms: string;
  printFooter: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  erpUser: ErpUser | null;
  settings: CompanySettings | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [erpUser, setErpUser] = useState<ErpUser | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const apiFetch = useCallback(
    async <T = any,>(url: string, options: RequestInit = {}): Promise<T> => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Authentication required');
      }
      const idToken = await currentUser.getIdToken();
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${idToken}`);
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data as T;
    },
    []
  );

  const loadProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setErpUser(null);
      setSettings(null);
      setLoading(false);
      return;
    }
    try {
      setAuthError(null);
      const idToken = await user.getIdToken();
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify user access');
      }
      setErpUser(data.user);
      setSettings(data.settings);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      loadProfile(user);
    });
    return () => unsub();
  }, [loadProfile]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      setAuthError(err.message || 'Sign-in cancelled or failed');
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setErpUser(null);
    setSettings(null);
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await loadProfile(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        erpUser,
        settings,
        loading,
        authError,
        signInWithGoogle,
        signOut,
        refreshProfile,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
