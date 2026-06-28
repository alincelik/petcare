import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAccountRole } from '@/hooks/use-account-role';
import { useAuth } from '@/hooks/use-auth';
import { useOnboardingStatus } from '@/hooks/use-onboarding-status';

const ONBOARDING_KEY = 'petOnboardingV1';

export default function SignInScreen() {
  const { session, backendReady, signInWithEmail, signUpWithEmail } = useAuth();
  const { setRole } = useAccountRole();
  const { loading: onboardingLoading, completed: onboardingCompleted } = useOnboardingStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  if (onboardingLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#1D4ED8" />
        </View>
      </SafeAreaView>
    );
  }

  if (session) {
    if (!onboardingCompleted) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(tabs)" />;
  }

  if (!backendReady) {
    if (!onboardingCompleted) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(tabs)" />;
  }

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      setStatusMessage('E-posta ve şifre alanlarını doldur.');
      return;
    }
    if (password.trim().length < 6) {
      setStatusMessage('Şifre en az 6 karakter olmalı.');
      return;
    }

    setLoading(true);
    const result =
      mode === 'signin'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password, {
            accountType: 'pet_owner',
          });

    if (result.ok) {
      await setRole('pet_owner');

      if (mode === 'signup') {
        try {
          await AsyncStorage.removeItem(ONBOARDING_KEY);
        } catch (error) {
          console.log('Onboarding sifirlama hatasi:', error);
        }
      }
    }

    setStatusMessage(result.message);
    if (result.ok && mode === 'signup') {
      setMode('signin');
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View>
          <View style={styles.topArea}>
            <View style={styles.pawBadge}>
              <MaterialIcons name="pets" size={24} color="#1D4ED8" />
            </View>
            <Text style={styles.title}>Pet Giriş</Text>
            <Text style={styles.subtitle}>
              Sosyal keşfet, mesajlaşma, ilanlar ve pet rutin takibi için hesabınla devam et.
            </Text>
          </View>

        <View style={styles.card}>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeButton, mode === 'signin' ? styles.modeButtonActive : null]}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.modeButtonText, mode === 'signin' ? styles.modeButtonTextActive : null]}>
                Giriş Yap
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, mode === 'signup' ? styles.modeButtonActive : null]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.modeButtonText, mode === 'signup' ? styles.modeButtonTextActive : null]}>
                Kayıt Ol
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>E-posta</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="ornek@mail.com"
            placeholderTextColor="#64748B"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Şifre</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="******"
            placeholderTextColor="#64748B"
            secureTextEntry
          />

          <Pressable style={styles.submitButton} disabled={loading} onPress={() => void submit()}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>{mode === 'signin' ? 'Giriş Yap' : 'Hesap Oluştur'}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.demoButton}
            onPress={() => {
              setEmail('sahip.demo@petcare.app');
              setPassword('PetCare123!');
            }}
          >
            <MaterialIcons name="auto-fix-high" size={14} color="#1D4ED8" />
            <Text style={styles.demoButtonText}>Test için örnek e-posta/şifre doldur</Text>
          </Pressable>

          {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
          {!backendReady && __DEV__ ? (
            <Text style={styles.helpText}>
              Supabase ayarı eksik: proje kökündeki `.env` dosyasını oluştur, URL ve publishable key gir,
              sonra `npx expo start -c` ile yeniden başlat.
            </Text>
          ) : null}
        </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EAF3FF',
  },
  keyboardWrap: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
  },
  topArea: {
    alignItems: 'center',
    marginBottom: 18,
  },
  pawBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 6,
    color: '#334155',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 16,
    padding: 16,
  },
  roleRow: {
    flexDirection: 'row',
    backgroundColor: '#E0EEFF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  roleButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#1D4ED8',
  },
  roleButtonText: {
    marginLeft: 5,
    color: '#1E3A8A',
    fontWeight: '700',
    fontSize: 11,
  },
  roleButtonTextActive: {
    color: '#FFFFFF',
  },
  modeRow: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#1D4ED8',
  },
  modeButtonText: {
    color: '#1E3A8A',
    fontWeight: '700',
    fontSize: 13,
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  label: {
    color: '#0F172A',
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 2,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  submitButton: {
    marginTop: 4,
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  demoButton: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 9,
  },
  demoButtonText: {
    marginLeft: 6,
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 12,
  },
  statusText: {
    marginTop: 10,
    color: '#1E3A8A',
    fontSize: 13,
    lineHeight: 18,
  },
  helpText: {
    marginTop: 8,
    color: '#B45309',
    fontSize: 12,
    lineHeight: 17,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
