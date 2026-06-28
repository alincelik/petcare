import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { supabase, supabaseEnabled } from '@/lib/supabase';

type AuthResult = {
  ok: boolean;
  message: string;
};

type SignUpOptions = {
  accountType?: 'pet_owner';
};

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  backendReady: boolean;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string, options?: SignUpOptions) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const missingBackendMessage = 'Servis şu an hazır değil. Lütfen daha sonra tekrar dene.';
const missingBackendDebugMessage =
  'Supabase ayarı eksik. /Users/emrealin/Documents/Codex/2026-05-16/selam/.env dosyasına EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veya EXPO_PUBLIC_SUPABASE_ANON_KEY) ekle.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    if (!supabaseEnabled) {
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      backendReady: supabaseEnabled,
      signInWithEmail: async (email: string, password: string) => {
        if (!supabaseEnabled) {
          if (__DEV__) console.warn(missingBackendDebugMessage);
          return { ok: false, message: missingBackendMessage };
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) return { ok: false, message: error.message };
        return { ok: true, message: 'Giriş başarılı.' };
      },
      signUpWithEmail: async (email: string, password: string, options?: SignUpOptions) => {
        if (!supabaseEnabled) {
          if (__DEV__) console.warn(missingBackendDebugMessage);
          return { ok: false, message: missingBackendMessage };
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              account_type: options?.accountType || 'pet_owner',
            },
          },
        });
        if (error) return { ok: false, message: error.message };

        if (data.session) {
          await supabase.auth.signOut();
          return {
            ok: true,
            message:
              'Hesap oluşturuldu. Güvenlik için e-posta doğrulaması önerilir. Supabase panelinde Confirm email açık olmalı.',
          };
        }

        return {
          ok: true,
          message: 'Hesap oluşturuldu. E-postana doğrulama linki gönderildi. Linke tıklayıp giriş yap.',
        };
      },
      signOut: async () => {
        if (!supabaseEnabled) return;
        await supabase.auth.signOut();
      },
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
