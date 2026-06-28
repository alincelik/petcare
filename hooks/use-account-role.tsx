import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AccountRole = 'pet_owner';

export const ACCOUNT_ROLE_KEY = 'petAccountRoleV1';

type AccountRoleContextValue = {
  role: AccountRole;
  loading: boolean;
  setRole: (nextRole: AccountRole) => Promise<void>;
};

const AccountRoleContext = createContext<AccountRoleContextValue | undefined>(undefined);

export function AccountRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<AccountRole>('pet_owner');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadRole = async () => {
      try {
        await AsyncStorage.getItem(ACCOUNT_ROLE_KEY);
        if (!mounted) return;
        setRoleState('pet_owner');
      } catch (error) {
        console.log('Hesap rolü okunamadı:', error);
        if (mounted) setRoleState('pet_owner');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadRole();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AccountRoleContextValue>(
    () => ({
      role,
      loading,
      setRole: async () => {
        const nextRole: AccountRole = 'pet_owner';
        setRoleState(nextRole);
        try {
          await AsyncStorage.setItem(ACCOUNT_ROLE_KEY, nextRole);
        } catch (error) {
          console.log('Hesap rolü kaydedilemedi:', error);
        }
      },
    }),
    [loading, role]
  );

  return <AccountRoleContext.Provider value={value}>{children}</AccountRoleContext.Provider>;
}

export function useAccountRole() {
  const context = useContext(AccountRoleContext);
  if (!context) {
    throw new Error('useAccountRole must be used within AccountRoleProvider');
  }
  return context;
}
