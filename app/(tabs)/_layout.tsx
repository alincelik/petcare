import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { useOnboardingStatus } from '@/hooks/use-onboarding-status';

type RouteName = 'index' | 'explore' | 'messages' | 'profile';

const routeMeta: Record<RouteName, { label: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  index: { label: 'Ana Sayfa', icon: 'home' },
  explore: { label: 'Keşfet', icon: 'pets' },
  messages: { label: 'Mesajlar', icon: 'chat-bubble-outline' },
  profile: { label: 'Profil', icon: 'person' },
};

const ownerRoutes: RouteName[] = ['index', 'explore', 'messages', 'profile'];
const visibleTabOptions = (routeName: RouteName) => ({
  title: routeMeta[routeName].label,
  tabBarLabel: routeMeta[routeName].label,
  tabBarIcon: ({ color, size }: { color: string; size: number }) => (
    <MaterialIcons name={routeMeta[routeName].icon} size={size} color={color} />
  ),
});

export default function TabLayout() {
  const { loading, session, backendReady } = useAuth();
  const { loading: onboardingLoading, completed: onboardingCompleted } = useOnboardingStatus();

  if (loading || onboardingLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F5EF' }}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (backendReady && !session) {
    return <Redirect href="/sign-in" />;
  }

  if (!onboardingCompleted) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      tabBar={({ state, navigation }) => {
        return (
          <View style={styles.tabBar}>
            {ownerRoutes.map((routeName) => {
              const routeIndex = state.routes.findIndex((route) => route.name === routeName);
              const focused = state.index === routeIndex;
              const meta = routeMeta[routeName];
              const color = focused ? '#F97316' : '#64748B';

              return (
                <Pressable
                  key={routeName}
                  accessibilityRole="tab"
                  accessibilityLabel={meta.label}
                  accessibilityState={focused ? { selected: true } : {}}
                  style={[styles.tabItem, focused ? styles.tabItemActive : null]}
                  onPress={() => {
                    if (!focused) navigation.navigate(routeName);
                  }}
                >
                  <MaterialIcons name={meta.icon} size={22} color={color} />
                  <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : null]}>{meta.label}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      }}
      screenOptions={{
        tabBarActiveTintColor: '#F97316',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarStyle: {
          borderTopColor: '#E2E8F0',
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={visibleTabOptions('index')} />
      <Tabs.Screen name="explore" options={visibleTabOptions('explore')} />
      <Tabs.Screen name="messages" options={visibleTabOptions('messages')} />
      <Tabs.Screen name="profile" options={visibleTabOptions('profile')} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFDF8',
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginHorizontal: 2,
  },
  tabItemActive: {
    backgroundColor: '#FFF1E6',
  },
  tabLabel: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#F97316',
  },
});
