import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';
import { useOnboardingStatus } from '@/hooks/use-onboarding-status';

const PROFILES_KEY = 'petProfilesV2';
const LEGACY_PROFILE_KEY = 'petProfile';
const OWNER_PROFILE_KEY = 'petOwnerProfileV1';
const USERNAME_REGISTRY_KEY = 'petUsernameRegistryV1';
const REMINDERS_KEY = 'petReminderSettingsV1';

type PetProfile = {
  id: string;
  name: string;
  photoUri: string;
  species: string;
  breed: string;
  gender: string;
  age: string;
  ageUnit: string;
  weight: string;
  neutered: string;
  microchipStatus: string;
  foodType: string;
  mealsPerDay: string;
  allergies: string;
  diseases: string;
  medicines: string;
  behaviorNotes: string;
  vetName: string;
  vetPhone: string;
  notes: string;
};

type ProfilesStore = {
  pets: PetProfile[];
  activePetId: string;
};

type OwnerProfile = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  city: string;
  bio: string;
};

type ReminderNotificationIds = {
  water?: string;
  food?: string[];
  puppyWeekly?: string;
  annual?: string;
};

type ReminderMode = 'auto' | 'manual' | 'skip';

type PetReminderSetting = {
  reminderMode: ReminderMode;
  waterTime: string;
  foodTimes: string[];
  puppyVaccineStartDate: string;
  annualVaccineLastDate: string;
  notificationIds: ReminderNotificationIds;
};

type ReminderSettingsStore = Record<string, PetReminderSetting>;

const normalizeUsername = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);
};

const clampMealCount = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 2;
  if (parsed < 1) return 1;
  if (parsed > 3) return 3;
  return parsed;
};

const createPetId = (): string => `pet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getAgeYears = (age: string, ageUnit: string): number => {
  const parsed = Number(age);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return ageUnit === 'Ay' ? parsed / 12 : parsed;
};

const getDefaultFoodTimes = (mealCount: number): string[] => {
  if (mealCount <= 1) return ['19:00'];
  if (mealCount === 2) return ['09:00', '19:00'];
  return ['08:30', '13:30', '19:30'];
};

const getAutoWaterTime = (species: string, ageYears: number): string => {
  if (species === 'Kedi') return ageYears < 1 ? '08:00' : '09:00';
  if (species === 'Köpek') return ageYears < 1 ? '07:30' : '08:30';
  return '09:00';
};

const parseTime = (value: string): boolean => {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());
};

const stepTitles = ['Pet', 'Sağlık', 'Rutin', 'Sahip', 'Özet'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { backendReady, session } = useAuth();
  const { loading, completed, markCompleted } = useOnboardingStatus();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState('Köpek');
  const [gender, setGender] = useState('Dişi');
  const [age, setAge] = useState('');
  const [ageUnit, setAgeUnit] = useState('Yaş');
  const [breed, setBreed] = useState('');
  const [weight, setWeight] = useState('');

  const [allergies, setAllergies] = useState('');
  const [diseases, setDiseases] = useState('');
  const [medicines, setMedicines] = useState('');
  const [behaviorNotes, setBehaviorNotes] = useState('');
  const [notes, setNotes] = useState('');

  const [mealCount, setMealCount] = useState('2');
  const [foodType, setFoodType] = useState('');
  const [vetName, setVetName] = useState('');
  const [vetPhone, setVetPhone] = useState('');
  const [reminderMode, setReminderMode] = useState<ReminderMode>('auto');
  const [manualWaterTime, setManualWaterTime] = useState('');
  const [manualFoodTimes, setManualFoodTimes] = useState<string[]>([]);

  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerCity, setOwnerCity] = useState('');
  const [ownerBio, setOwnerBio] = useState('');

  const parsedMeals = clampMealCount(mealCount);
  const ageYears = getAgeYears(age, ageUnit);
  const autoFoodTimes = useMemo(() => getDefaultFoodTimes(parsedMeals), [parsedMeals]);
  const autoWaterTime = useMemo(() => getAutoWaterTime(species, ageYears), [ageYears, species]);

  useEffect(() => {
    setManualFoodTimes((current) => {
      const next = Array.from({ length: parsedMeals }, (_, index) => current[index]?.trim() || autoFoodTimes[index] || '');
      return next;
    });
  }, [autoFoodTimes, parsedMeals]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <Text style={styles.loadingText}>Kurulum hazırlanıyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (backendReady && !session) {
    return <Redirect href="/sign-in" />;
  }

  if (completed) {
    return <Redirect href="/(tabs)" />;
  }

  const goNext = () => {
    if (step < stepTitles.length - 1) setStep((current) => current + 1);
  };

  const goBack = () => {
    if (step > 0) setStep((current) => current - 1);
  };

  const setReminderPreset = (mode: ReminderMode) => {
    setReminderMode(mode);
    if (mode === 'manual') {
      setManualWaterTime((current) => current.trim() || autoWaterTime);
      setManualFoodTimes((current) =>
        Array.from({ length: parsedMeals }, (_, index) => current[index]?.trim() || autoFoodTimes[index] || '')
      );
    }
  };

  const saveOnboarding = async () => {
    if (!petName.trim()) {
      Alert.alert('Eksik bilgi', 'Pet adı zorunlu.');
      return;
    }
    if (!ownerFullName.trim()) {
      Alert.alert('Eksik bilgi', 'Sahip adı zorunlu.');
      return;
    }
    const normalizedUsername = normalizeUsername(ownerUsername);
    if (normalizedUsername.length < 3) {
      Alert.alert('Eksik bilgi', 'Kullanıcı adı en az 3 karakter olmalı.');
      return;
    }
    if (!ownerEmail.trim()) {
      Alert.alert('Eksik bilgi', 'E-posta zorunlu.');
      return;
    }
    if (reminderMode === 'manual') {
      if (!parseTime(manualWaterTime)) {
        Alert.alert('Eksik bilgi', 'Manuel su saati HH:MM formatında olmalı.');
        return;
      }
      const invalidFoodTime = manualFoodTimes.find((time) => !parseTime(time));
      if (invalidFoodTime !== undefined) {
        Alert.alert('Eksik bilgi', 'Manuel mama saatleri HH:MM formatında olmalı.');
        return;
      }
    }

    const nextPetId = createPetId();
    const nextPet: PetProfile = {
      id: nextPetId,
      name: petName.trim(),
      photoUri: '',
      species,
      breed: breed.trim(),
      gender,
      age: age.trim(),
      ageUnit,
      weight: weight.trim(),
      neutered: 'Bilinmiyor',
      microchipStatus: 'Bilinmiyor',
      foodType: foodType.trim(),
      mealsPerDay: String(parsedMeals),
      allergies: allergies.trim(),
      diseases: diseases.trim(),
      medicines: medicines.trim(),
      behaviorNotes: behaviorNotes.trim(),
      vetName: vetName.trim(),
      vetPhone: vetPhone.trim(),
      notes: notes.trim(),
    };

    const profileStore: ProfilesStore = {
      pets: [nextPet],
      activePetId: nextPetId,
    };

    const ownerProfile: OwnerProfile = {
      fullName: ownerFullName.trim(),
      username: normalizedUsername,
      email: ownerEmail.trim(),
      phone: ownerPhone.trim(),
      city: ownerCity.trim(),
      bio: ownerBio.trim(),
    };

    const todayKey = getLocalDateKey(new Date());
    const routineMode = reminderMode === 'skip' ? 'skip' : reminderMode;
    const reminderStore: ReminderSettingsStore = {
      [nextPetId]: {
        reminderMode: routineMode,
        waterTime:
          routineMode === 'manual'
            ? manualWaterTime.trim()
            : routineMode === 'skip'
            ? ''
            : autoWaterTime,
        foodTimes: routineMode === 'manual' ? manualFoodTimes.map((time) => time.trim()) : routineMode === 'skip' ? [] : autoFoodTimes,
        puppyVaccineStartDate: ageYears < 1 ? todayKey : '',
        annualVaccineLastDate: '',
        notificationIds: {},
      },
    };

    try {
      setSaving(true);
      await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profileStore));
      await AsyncStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(nextPet));
      await AsyncStorage.setItem(OWNER_PROFILE_KEY, JSON.stringify(ownerProfile));
      await AsyncStorage.setItem(USERNAME_REGISTRY_KEY, JSON.stringify([normalizedUsername]));
      await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminderStore));
      await markCompleted();
      router.replace('/(tabs)');
    } catch (error) {
      console.log('Onboarding kaydetme hatasi:', error);
      Alert.alert('Hata', 'Kurulum kaydedilirken bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.safeArea}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Hızlı Kurulum</Text>
          <Text style={styles.subtitle}>5 adımda kişiselleştirilmiş bakım planını oluşturalım.</Text>

          <View style={styles.stepRow}>
            {stepTitles.map((title, index) => {
              const active = index === step;
              const done = index < step;
              return (
                <View key={title} style={[styles.stepChip, active ? styles.stepChipActive : null, done ? styles.stepChipDone : null]}>
                  <Text style={[styles.stepChipText, active ? styles.stepChipTextActive : null, done ? styles.stepChipTextDone : null]}>
                    {title}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            {step === 0 ? (
              <>
                <FormInput label="Pet adı" value={petName} onChangeText={setPetName} placeholder="Örn: Odin" />
                <Text style={styles.fieldLabel}>Tür</Text>
                <ChipRow
                  options={['Köpek', 'Kedi', 'Kuş', 'Diğer']}
                  value={species}
                  onChange={setSpecies}
                />
                <Text style={styles.fieldLabel}>Cinsiyet</Text>
                <ChipRow
                  options={['Dişi', 'Erkek', 'Bilinmiyor']}
                  value={gender}
                  onChange={setGender}
                />
                <FormInput label="Yaş" value={age} onChangeText={setAge} placeholder="Örn: 2" keyboardType="numeric" />
                <Text style={styles.fieldLabel}>Yaş birimi</Text>
                <ChipRow options={['Ay', 'Yaş']} value={ageUnit} onChange={setAgeUnit} />
                <FormInput label="Irk (opsiyonel)" value={breed} onChangeText={setBreed} placeholder="Örn: Golden" />
                <FormInput label="Kilo (opsiyonel)" value={weight} onChangeText={setWeight} placeholder="Örn: 22" keyboardType="numeric" />
              </>
            ) : null}

            {step === 1 ? (
              <>
                <FormInput
                  label="Alerjiler"
                  value={allergies}
                  onChangeText={setAllergies}
                  placeholder="Varsa alerji bilgilerini yaz"
                  multiline
                />
                <FormInput
                  label="Hastalıklar"
                  value={diseases}
                  onChangeText={setDiseases}
                  placeholder="Varsa tanı bilgilerini yaz"
                  multiline
                />
                <FormInput
                  label="Kullanılan ilaçlar"
                  value={medicines}
                  onChangeText={setMedicines}
                  placeholder="Düzenli ilaç varsa yaz"
                  multiline
                />
                <FormInput
                  label="Davranış notu"
                  value={behaviorNotes}
                  onChangeText={setBehaviorNotes}
                  placeholder="Örn: Yalnız kalınca huzursuz"
                  multiline
                />
                <FormInput
                  label="Ek not"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Özel bakım notları"
                  multiline
                />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.fieldLabel}>Günlük mama öğünü</Text>
                <ChipRow options={['1', '2', '3']} value={String(parsedMeals)} onChange={setMealCount} />
                <FormInput
                  label="Beslenme tipi"
                  value={foodType}
                  onChangeText={setFoodType}
                  placeholder="Örn: Kuru mama + yaş mama"
                />
                <FormInput
                  label="Veteriner / klinik"
                  value={vetName}
                  onChangeText={setVetName}
                  placeholder="Örn: Can Dostum Kliniği"
                />
                <FormInput
                  label="Veteriner telefonu"
                  value={vetPhone}
                  onChangeText={setVetPhone}
                  placeholder="05xx xxx xx xx"
                  keyboardType="phone-pad"
                />
                <View style={styles.tipBox}>
                  <Text style={styles.tipTitle}>Otomatik plan önerisi</Text>
                  <Text style={styles.tipText}>Su: {autoWaterTime}</Text>
                  <Text style={styles.tipText}>Mama: {autoFoodTimes.join(' • ')}</Text>
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Hatırlatıcı tercihi</Text>
                <ChipRow
                  options={['Otomatik', 'Manuel', 'Şimdilik istemiyorum']}
                  value={
                    reminderMode === 'manual'
                      ? 'Manuel'
                      : reminderMode === 'skip'
                      ? 'Şimdilik istemiyorum'
                      : 'Otomatik'
                  }
                  onChange={(value) =>
                    setReminderPreset(
                      value === 'Manuel' ? 'manual' : value === 'Şimdilik istemiyorum' ? 'skip' : 'auto'
                    )
                  }
                />

                {reminderMode === 'manual' ? (
                  <View style={styles.manualReminderBox}>
                    <FormInput
                      label="Su saati"
                      value={manualWaterTime}
                      onChangeText={setManualWaterTime}
                      placeholder="09:00"
                    />
                    {manualFoodTimes.map((time, index) => (
                      <FormInput
                        key={`manual-food-${index}`}
                        label={`${index + 1}. mama saati`}
                        value={time}
                        onChangeText={(value) =>
                          setManualFoodTimes((current) => current.map((item, i) => (i === index ? value : item)))
                        }
                        placeholder={autoFoodTimes[index] || '19:00'}
                      />
                    ))}
                  </View>
                ) : null}

                {reminderMode === 'skip' ? (
                  <Text style={styles.skipNote}>
                    Şimdilik istemiyorsan kaydedelim. Sonradan ayarlardan bu kısmı açabilirsin.
                  </Text>
                ) : null}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <FormInput
                  label="Ad Soyad"
                  value={ownerFullName}
                  onChangeText={setOwnerFullName}
                  placeholder="Örn: Elif Y."
                />
                <FormInput
                  label="Kullanıcı adı"
                  value={ownerUsername}
                  onChangeText={(value) => setOwnerUsername(normalizeUsername(value))}
                  placeholder="Örn: elifpati34"
                />
                <FormInput
                  label="E-posta"
                  value={ownerEmail}
                  onChangeText={setOwnerEmail}
                  placeholder="ornek@mail.com"
                />
                <FormInput
                  label="Telefon (opsiyonel)"
                  value={ownerPhone}
                  onChangeText={setOwnerPhone}
                  placeholder="05xx xxx xx xx"
                  keyboardType="phone-pad"
                />
                <FormInput
                  label="Şehir (opsiyonel)"
                  value={ownerCity}
                  onChangeText={setOwnerCity}
                  placeholder="İstanbul"
                />
                <FormInput
                  label="Profil açıklaması"
                  value={ownerBio}
                  onChangeText={setOwnerBio}
                  placeholder="Pet sever, yardımlaşmaya açık."
                  multiline
                />
              </>
            ) : null}

            {step === 4 ? (
              <>
                <Text style={styles.summaryTitle}>Özet</Text>
                <Text style={styles.summaryText}>Pet: {petName || '-'}</Text>
                <Text style={styles.summaryText}>Tür: {species}</Text>
                <Text style={styles.summaryText}>Yaş: {age ? `${age} ${ageUnit}` : '-'}</Text>
                <Text style={styles.summaryText}>Sahip: {ownerFullName || '-'}</Text>
                <Text style={styles.summaryText}>Kullanıcı adı: @{normalizeUsername(ownerUsername) || '-'}</Text>
                <Text style={styles.summaryText}>Su hatırlatma: {autoWaterTime}</Text>
                <Text style={styles.summaryText}>Mama hatırlatma: {autoFoodTimes.join(' • ')}</Text>
                {ageYears < 1 ? (
                  <Text style={styles.summaryBadge}>Yavru modu aktif: haftalık aşı takibi önerildi.</Text>
                ) : null}
              </>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            {step > 0 ? (
              <Pressable style={styles.secondaryButton} onPress={goBack} disabled={saving}>
                <Text style={styles.secondaryButtonText}>Geri</Text>
              </Pressable>
            ) : null}
            {step < stepTitles.length - 1 ? (
              <Pressable
                style={[styles.primaryButton, step === 0 ? styles.primaryButtonSingle : null]}
                onPress={goNext}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>{step === 0 ? 'Başla' : 'Devam'}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.primaryButton, step === 0 ? styles.primaryButtonSingle : null]}
                onPress={() => void saveOnboarding()}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kurulumu Tamamla'}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

type FormInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  multiline?: boolean;
};

function FormInput(props: FormInputProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline ? styles.multilineInput : null]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#6B7280"
        keyboardType={props.keyboardType || 'default'}
        multiline={props.multiline}
      />
    </View>
  );
}

type ChipRowProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
};

function ChipRow(props: ChipRowProps) {
  return (
    <View style={styles.chipRow}>
      {props.options.map((option) => {
        const selected = props.value === option;
        return (
          <Pressable
            key={option}
            style={[styles.chip, selected ? styles.chipActive : null]}
            onPress={() => props.onChange(option)}
          >
            <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F7FF',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '600',
  },
  container: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 36,
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
    lineHeight: 20,
  },
  stepRow: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stepChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  stepChipActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE',
  },
  stepChipDone: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  stepChipText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12,
  },
  stepChipTextActive: {
    color: '#1E3A8A',
  },
  stepChipTextDone: {
    color: '#1D4ED8',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 14,
  },
  inputGroup: {
    marginBottom: 8,
  },
  fieldLabel: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#1D4ED8',
  },
  chipText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  tipBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    padding: 10,
    marginTop: 6,
  },
  tipTitle: {
    color: '#1E3A8A',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 4,
  },
  tipText: {
    color: '#1E3A8A',
    fontSize: 12,
    lineHeight: 18,
  },
  manualReminderBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FBFF',
  },
  skipNote: {
    marginTop: 10,
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  summaryTitle: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 17,
    marginBottom: 8,
  },
  summaryText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
  },
  summaryBadge: {
    marginTop: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    color: '#1E3A8A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
  },
  actionRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonSingle: {
    flex: 1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
