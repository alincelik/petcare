import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const ONBOARDING_KEY = 'petOnboardingV1';

type OnboardingPayload = {
  completedAt?: string;
};

const parseOnboardingPayload = (raw: string | null): boolean => {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as OnboardingPayload;
    return typeof parsed.completedAt === 'string' && parsed.completedAt.length > 0;
  } catch {
    return false;
  }
};

export function useOnboardingStatus() {
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(ONBOARDING_KEY);
      setCompleted(parseOnboardingPayload(raw));
    } catch (error) {
      console.log('Onboarding durumu okunamadi:', error);
      setCompleted(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markCompleted = useCallback(async () => {
    try {
      await AsyncStorage.setItem(
        ONBOARDING_KEY,
        JSON.stringify({
          completedAt: new Date().toISOString(),
        })
      );
      setCompleted(true);
    } catch (error) {
      console.log('Onboarding tamamlandi bilgisi yazilamadi:', error);
      throw error;
    }
  }, []);

  return {
    loading,
    completed,
    refresh,
    markCompleted,
  };
}
