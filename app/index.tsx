import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { useOnboardingStatus } from '@/hooks/use-onboarding-status';

export default function Index() {
  const { loading, session, backendReady } = useAuth();
  const { loading: onboardingLoading, completed: onboardingCompleted } = useOnboardingStatus();

  if (loading || onboardingLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  if (!backendReady) {
    return <Redirect href={onboardingCompleted ? '/(tabs)' : '/onboarding'} />;
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  if (!onboardingCompleted) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#F7F5EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
