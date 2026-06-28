import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';
import { supabase, supabaseEnabled } from '@/lib/supabase';

const PROFILES_KEY = 'petProfilesV2';
const LEGACY_PROFILE_KEY = 'petProfile';
const OWNER_PROFILE_KEY = 'petOwnerProfileV1';
const USERNAME_REGISTRY_KEY = 'petUsernameRegistryV1';
const APP_SETTINGS_KEY = 'petAppSettingsV1';
const PET_RELATIONS_KEY = 'petRelationsV1';
const RESET_KEYS = [
  PROFILES_KEY,
  LEGACY_PROFILE_KEY,
  OWNER_PROFILE_KEY,
  USERNAME_REGISTRY_KEY,
  APP_SETTINGS_KEY,
  PET_RELATIONS_KEY,
  'petDailyLogsV1',
  'petVetEventsV1',
  'petReminderSettingsV1',
  'petInactivityNudgeV1',
  'petCommunityListingsV1',
  'petCommunityMessagesV1',
  'petCommunityFollowsV1',
  'petSocialPostsV1',
  'petMessageReadsV1',
  'petBlockedUsersV1',
];

type ProfileTab = 'profile' | 'pets' | 'settings';

type PetProfile = {
  id: string;
  name: string;
  photoUri: string;
  coverPhotoUri: string;
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

type RelationType = 'Arkadaşı' | 'Sevgilisi' | 'Kardeşi';

type PetRelation = {
  id: string;
  sourcePetId: string;
  targetPetId: string;
  relationType: RelationType;
};

type OwnerProfile = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  city: string;
  bio: string;
  photoUri: string;
  hobbies: string;
  withPetSince: string;
};

type AppSettings = {
  privateProfile: boolean;
  messageRequests: boolean;
  showContactInListings: boolean;
  showPetAgeOnProfile: boolean;
};

type StoredData = {
  pets: PetProfile[];
  activePetId: string;
};

const createEmptyPet = (index: number): PetProfile => {
  return {
    id: `pet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Pet ${index}`,
    photoUri: '',
    coverPhotoUri: '',
    species: 'Köpek',
    breed: '',
    gender: 'Dişi',
    age: '',
    ageUnit: 'Yaş',
    weight: '',
    neutered: 'Bilinmiyor',
    microchipStatus: 'Bilinmiyor',
    foodType: '',
    mealsPerDay: '2',
    allergies: '',
    diseases: '',
    medicines: '',
    behaviorNotes: '',
    vetName: '',
    vetPhone: '',
    notes: '',
  };
};

const defaultOwnerProfile: OwnerProfile = {
  fullName: '',
  username: '',
  email: '',
  phone: '',
  city: '',
  bio: '',
  photoUri: '',
  hobbies: '',
  withPetSince: '',
};

const defaultAppSettings: AppSettings = {
  privateProfile: false,
  messageRequests: true,
  showContactInListings: true,
  showPetAgeOnProfile: true,
};

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeUsername = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);
};

const normalizeMealsPerDay = (value: string): string => {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return '';

  const parsed = Number(digits);
  if (Number.isNaN(parsed)) return '';
  if (parsed < 1) return '1';
  if (parsed > 3) return '3';
  return String(parsed);
};

const normalizeStoredPet = (input: Record<string, unknown>, index: number): PetProfile => {
  const empty = createEmptyPet(index);

  return {
    ...empty,
    name: getString(input.name) || empty.name,
    photoUri: getString(input.photoUri),
    coverPhotoUri: getString(input.coverPhotoUri),
    species: getString(input.species) || getString(input.type) || empty.species,
    breed: getString(input.breed),
    gender: getString(input.gender) || empty.gender,
    age: getString(input.age),
    ageUnit: getString(input.ageUnit) || empty.ageUnit,
    weight: getString(input.weight),
    neutered: getString(input.neutered) || empty.neutered,
    microchipStatus: getString(input.microchipStatus) || empty.microchipStatus,
    foodType: getString(input.foodType),
    mealsPerDay: normalizeMealsPerDay(getString(input.mealsPerDay)) || empty.mealsPerDay,
    allergies: getString(input.allergies),
    diseases: getString(input.diseases),
    medicines: getString(input.medicines),
    behaviorNotes: getString(input.behaviorNotes),
    vetName: getString(input.vetName),
    vetPhone: getString(input.vetPhone),
    notes: getString(input.notes),
  };
};

const normalizeLegacyProfile = (legacy: Record<string, unknown>, index: number): PetProfile => {
  return normalizeStoredPet(legacy, index);
};

const getPetCompletionPercent = (pet: PetProfile): number => {
  const completedFields = Object.values(pet).filter(
    (value) => typeof value === 'string' && value.trim() !== ''
  ).length;
  return Math.round((completedFields / Object.keys(pet).length) * 100);
};

export default function Profile() {
  const { signOut, session } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [activePetId, setActivePetId] = useState('');
  const [saving, setSaving] = useState(false);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(defaultOwnerProfile);
  const [relations, setRelations] = useState<PetRelation[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [initialOwnerUsername, setInitialOwnerUsername] = useState('');
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [showOwnerCardModal, setShowOwnerCardModal] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [expandedPetId, setExpandedPetId] = useState('');
  const [relationModalVisible, setRelationModalVisible] = useState(false);
  const [relationTypeInput, setRelationTypeInput] = useState<RelationType>('Arkadaşı');
  const [relationTargetPetIdInput, setRelationTargetPetIdInput] = useState('');

  const activePet = useMemo(
    () => pets.find((pet) => pet.id === activePetId) || pets[0] || null,
    [activePetId, pets]
  );

  useEffect(() => {
    loadProfiles();
    void loadOwnerProfile();
    void loadAppSettings();
    void loadRelations();
  }, []);

  useEffect(() => {
    if (!activePet && pets.length > 0) {
      setActivePetId(pets[0].id);
    }
  }, [activePet, pets]);

  useEffect(() => {
    if (!expandedPetId) return;
    const exists = pets.some((pet) => pet.id === expandedPetId);
    if (!exists) setExpandedPetId('');
  }, [expandedPetId, pets]);

  const loadProfiles = async () => {
    try {
      const savedProfilesRaw = await AsyncStorage.getItem(PROFILES_KEY);

      if (savedProfilesRaw) {
        const savedProfiles = JSON.parse(savedProfilesRaw) as StoredData;
        if (savedProfiles.pets && savedProfiles.pets.length > 0) {
          const normalizedPets = savedProfiles.pets.map((pet, index) =>
            normalizeStoredPet(pet as unknown as Record<string, unknown>, index + 1)
          );

          setPets(normalizedPets);
          setActivePetId(savedProfiles.activePetId || normalizedPets[0].id);
          return;
        }
      }

      const legacyRaw = await AsyncStorage.getItem(LEGACY_PROFILE_KEY);
      if (legacyRaw) {
        const legacyObject = JSON.parse(legacyRaw) as Record<string, unknown>;
        const migratedPet = normalizeLegacyProfile(legacyObject, 1);
        setPets([migratedPet]);
        setActivePetId(migratedPet.id);
        return;
      }

      const firstPet = createEmptyPet(1);
      setPets([firstPet]);
      setActivePetId(firstPet.id);
    } catch (error) {
      console.log('Profil yükleme hatası:', error);
      const fallbackPet = createEmptyPet(1);
      setPets([fallbackPet]);
      setActivePetId(fallbackPet.id);
    }
  };

  const loadOwnerProfile = async () => {
    try {
      const raw = await AsyncStorage.getItem(OWNER_PROFILE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const resolvedUsername = normalizeUsername(getString(parsed.username));
      setOwnerProfile({
        fullName: getString(parsed.fullName),
        username: resolvedUsername,
        email: getString(parsed.email),
        phone: getString(parsed.phone),
        city: getString(parsed.city),
        bio: getString(parsed.bio),
        photoUri: getString(parsed.photoUri),
        hobbies: getString(parsed.hobbies),
        withPetSince: getString(parsed.withPetSince),
      });
      setInitialOwnerUsername(resolvedUsername);
    } catch (error) {
      console.log('Insan profili yukleme hatasi:', error);
    }
  };

  const loadAppSettings = async () => {
    try {
      const raw = await AsyncStorage.getItem(APP_SETTINGS_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setAppSettings({
        privateProfile: Boolean(parsed.privateProfile),
        messageRequests:
          typeof parsed.messageRequests === 'boolean'
            ? parsed.messageRequests
            : defaultAppSettings.messageRequests,
        showContactInListings:
          typeof parsed.showContactInListings === 'boolean'
            ? parsed.showContactInListings
            : defaultAppSettings.showContactInListings,
        showPetAgeOnProfile:
          typeof parsed.showPetAgeOnProfile === 'boolean'
            ? parsed.showPetAgeOnProfile
            : defaultAppSettings.showPetAgeOnProfile,
      });
    } catch (error) {
      console.log('Ayarlar yukleme hatasi:', error);
    }
  };

  const loadRelations = async () => {
    try {
      const raw = await AsyncStorage.getItem(PET_RELATIONS_KEY);
      if (!raw) {
        setRelations([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setRelations([]);
        return;
      }

      const normalized = parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => {
          const relationTypeCandidate = getString(item.relationType) as RelationType;
          const relationType: RelationType =
            relationTypeCandidate === 'Arkadaşı' ||
            relationTypeCandidate === 'Sevgilisi' ||
            relationTypeCandidate === 'Kardeşi'
              ? relationTypeCandidate
              : 'Arkadaşı';

          return {
            id: getString(item.id) || `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sourcePetId: getString(item.sourcePetId),
            targetPetId: getString(item.targetPetId),
            relationType,
          };
        })
        .filter((item) => item.sourcePetId && item.targetPetId);

      setRelations(normalized);
    } catch (error) {
      console.log('Pet iliski verisi yukleme hatasi:', error);
      setRelations([]);
    }
  };

  const updateOwnerField = (field: keyof OwnerProfile, value: string) => {
    setOwnerProfile((current) => ({ ...current, [field]: value }));
  };

  const updateAppSetting = async (field: keyof AppSettings, value: boolean) => {
    const next = { ...appSettings, [field]: value };
    setAppSettings(next);
    try {
      await AsyncStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(next));
    } catch (error) {
      console.log('Ayar kaydetme hatasi:', error);
    }
  };

  const persistRelations = async (nextRelations: PetRelation[]) => {
    setRelations(nextRelations);
    try {
      await AsyncStorage.setItem(PET_RELATIONS_KEY, JSON.stringify(nextRelations));
    } catch (error) {
      console.log('Pet iliski kaydetme hatasi:', error);
    }
  };

  const saveOwnerProfile = async () => {
    if (!ownerProfile.fullName.trim()) {
      Alert.alert('Eksik bilgi', 'Lutfen ad-soyad bilgisini gir.');
      return;
    }
    const normalizedUsername = normalizeUsername(ownerProfile.username);
    if (!normalizedUsername || normalizedUsername.length < 3) {
      Alert.alert('Eksik bilgi', 'Lütfen en az 3 karakterlik bir kullanıcı adı oluştur.');
      return;
    }
    if (!ownerProfile.email.trim()) {
      Alert.alert('Eksik bilgi', 'Lutfen e-posta bilgisini gir.');
      return;
    }

    try {
      setSavingOwner(true);
      const registryRaw = await AsyncStorage.getItem(USERNAME_REGISTRY_KEY);
      const parsedRegistry = registryRaw ? (JSON.parse(registryRaw) as unknown) : [];
      const usernameRegistry = Array.isArray(parsedRegistry)
        ? parsedRegistry.filter((item): item is string => typeof item === 'string')
        : [];

      const takenByOthers =
        usernameRegistry.includes(normalizedUsername) && normalizedUsername !== initialOwnerUsername;
      if (takenByOthers) {
        Alert.alert('Kullanıcı adı dolu', `@${normalizedUsername} daha önce kullanılmış. Farklı bir ad dene.`);
        return;
      }

      const nextProfile: OwnerProfile = {
        ...ownerProfile,
        username: normalizedUsername,
      };

      const nextRegistry = usernameRegistry.includes(normalizedUsername)
        ? usernameRegistry
        : [...usernameRegistry, normalizedUsername];

      await AsyncStorage.setItem(OWNER_PROFILE_KEY, JSON.stringify(nextProfile));
      await AsyncStorage.setItem(USERNAME_REGISTRY_KEY, JSON.stringify(nextRegistry));
      setOwnerProfile(nextProfile);
      setInitialOwnerUsername(normalizedUsername);

      if (supabaseEnabled && session?.user.id) {
        const { error: profileSyncError } = await supabase.from('user_profiles').upsert(
          {
            user_id: session.user.id,
            full_name: nextProfile.fullName,
            username: nextProfile.username,
            phone: nextProfile.phone,
            city: nextProfile.city,
            bio: nextProfile.bio,
          },
          { onConflict: 'user_id' }
        );
        if (profileSyncError) {
          console.log('Supabase user_profiles senkronizasyon hatasi:', profileSyncError.message);
        }
      }

      Alert.alert('Kaydedildi', 'İnsan profili kaydedildi.');
      setShowOwnerModal(false);
    } catch (error) {
      console.log('Insan profili kaydetme hatasi:', error);
      Alert.alert('Hata', 'İnsan profili kaydedilirken sorun oluştu.');
    } finally {
      setSavingOwner(false);
    }
  };

  const ownerProfileReady =
    ownerProfile.fullName.trim() !== '' &&
    normalizeUsername(ownerProfile.username).length >= 3 &&
    ownerProfile.email.trim() !== '';

  const updateActivePetField = (field: keyof PetProfile, value: string) => {
    if (!activePet) return;

    const nextValue = field === 'mealsPerDay' ? normalizeMealsPerDay(value) : value;

    setPets((currentPets) =>
      currentPets.map((pet) => {
        if (pet.id !== activePet.id) return pet;
        return { ...pet, [field]: nextValue };
      })
    );
  };

  const addNewPet = () => {
    const newPet = createEmptyPet(pets.length + 1);
    setPets((currentPets) => [...currentPets, newPet]);
    setActivePetId(newPet.id);
    setExpandedPetId(newPet.id);
    setActiveTab('pets');
  };

  const setActivePetAndPersist = async (petId: string) => {
    setActivePetId(petId);
    try {
      const payload: StoredData = {
        pets,
        activePetId: petId,
      };
      await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(payload));
    } catch (error) {
      console.log('Aktif pet secimi kaydetme hatasi:', error);
    }
  };

  const openPetEditor = async (petId: string) => {
    await setActivePetAndPersist(petId);
    setExpandedPetId(petId);
    setActiveTab('pets');
  };

  const saveProfiles = async () => {
    if (!activePet) return;

    if (!activePet.name.trim()) {
      Alert.alert('Eksik bilgi', 'Lütfen aktif pet için isim gir.');
      return;
    }

    const mealsPerDay = Number(activePet.mealsPerDay);
    if (!Number.isInteger(mealsPerDay) || mealsPerDay < 1 || mealsPerDay > 3) {
      Alert.alert('Öğün sayısı hatalı', 'Günlük mama öğünü sayısını 1 ile 3 arasında gir.');
      return;
    }

    try {
      setSaving(true);
      const payload: StoredData = {
        pets,
        activePetId: activePet.id,
      };

      await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(payload));
      await AsyncStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(activePet));
      Alert.alert('Kaydedildi', 'Tüm pet profilleri kaydedildi.');
      setExpandedPetId('');
    } catch (error) {
      console.log('Profil kaydetme hatası:', error);
      Alert.alert('Hata', 'Kaydetme sırasında bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const deleteActivePet = () => {
    if (!activePet) return;

    if (pets.length <= 1) {
      Alert.alert('Silme engellendi', 'En az bir pet profili kalmalı.');
      return;
    }

    Alert.alert(
      'Bu işlemden emin misin?',
      `${activePet.name || 'Bu pet'} profilini silmek üzeresin.`,
      [
        { text: 'Hayır, değilim', style: 'cancel' },
        {
          text: 'Evet, eminim',
          style: 'destructive',
          onPress: async () => {
            const updatedPets = pets.filter((pet) => pet.id !== activePet.id);
            const nextActivePetId = updatedPets[0].id;

            setPets(updatedPets);
            setActivePetId(nextActivePetId);
            if (expandedPetId === activePet.id) {
              setExpandedPetId('');
            }

            try {
              const payload: StoredData = {
                pets: updatedPets,
                activePetId: nextActivePetId,
              };

              await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(payload));
              await AsyncStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(updatedPets[0]));
            } catch (error) {
              console.log('Profil silme kaydetme hatası:', error);
            }
          },
        },
      ]
    );
  };

  const pickPetPhoto = async () => {
    if (!activePet) return;

    try {
      const pickImageWithSource = async (aspect: [number, number]) => {
        const pickFromGallery = async (): Promise<string | null> => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('İzin gerekli', 'Galeri iznini açmalısın.');
            return null;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect,
            quality: 0.8,
          });
          if (result.canceled || result.assets.length === 0) return null;
          return result.assets[0].uri;
        };

        const pickFromCamera = async (): Promise<string | null> => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('İzin gerekli', 'Kamera iznini açmalısın.');
            return null;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect,
            quality: 0.8,
          });
          if (result.canceled || result.assets.length === 0) return null;
          return result.assets[0].uri;
        };

        if (Platform.OS === 'web') {
          return pickFromGallery();
        }

        return new Promise<string | null>((resolve) => {
          let resolved = false;
          const resolveOnce = (value: string | null) => {
            if (resolved) return;
            resolved = true;
            resolve(value);
          };

          Alert.alert('Fotoğraf Kaynağı', 'Kamera mı galeri mi kullanmak istersin?', [
            {
              text: 'Kamera',
              onPress: () => {
                void (async () => {
                  try {
                    resolveOnce(await pickFromCamera());
                  } catch (error) {
                    console.log('Kamera hatasi:', error);
                    resolveOnce(null);
                  }
                })();
              },
            },
            {
              text: 'Galeri',
              onPress: () => {
                void (async () => {
                  try {
                    resolveOnce(await pickFromGallery());
                  } catch (error) {
                    console.log('Galeri hatasi:', error);
                    resolveOnce(null);
                  }
                })();
              },
            },
            { text: 'İptal', style: 'cancel', onPress: () => resolveOnce(null) },
          ]);
        });
      };

      const uri = await pickImageWithSource([1, 1]);
      if (uri) updateActivePetField('photoUri', uri);
    } catch (error) {
      console.log('Fotoğraf seçme hatası:', error);
      Alert.alert('Hata', 'Fotoğraf seçilirken bir sorun oluştu.');
    }
  };

  const pickPetCoverPhoto = async () => {
    if (!activePet) return;

    try {
      const pickCoverFromGallery = async () => {
        const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!mediaPermission.granted) {
          Alert.alert('İzin gerekli', 'Galeri iznini açmalısın.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [16, 9],
          quality: 0.8,
        });
        if (!result.canceled && result.assets.length > 0) {
          updateActivePetField('coverPhotoUri', result.assets[0].uri);
        }
      };

      if (Platform.OS === 'web') {
        await pickCoverFromGallery();
        return;
      }

      Alert.alert('Kapak Fotoğrafı', 'Kaynak seç', [
        {
          text: 'Kamera',
          onPress: () => {
            void (async () => {
              try {
                const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
                if (!cameraPermission.granted) {
                  Alert.alert('İzin gerekli', 'Kamera iznini açmalısın.');
                  return;
                }
                const result = await ImagePicker.launchCameraAsync({
                  allowsEditing: true,
                  aspect: [16, 9],
                  quality: 0.8,
                });
                if (!result.canceled && result.assets.length > 0) {
                  updateActivePetField('coverPhotoUri', result.assets[0].uri);
                }
              } catch (error) {
                console.log('Kapak kamera hatasi:', error);
              }
            })();
          },
        },
        {
          text: 'Galeri',
          onPress: () => {
            void (async () => {
              try {
                await pickCoverFromGallery();
              } catch (error) {
                console.log('Kapak galeri hatasi:', error);
              }
            })();
          },
        },
        { text: 'İptal', style: 'cancel' },
      ]);
    } catch (error) {
      console.log('Kapak fotoğrafı seçme hatası:', error);
      Alert.alert('Hata', 'Kapak fotoğrafı seçilirken bir sorun oluştu.');
    }
  };

  const pickOwnerPhoto = async () => {
    try {
      const pickOwnerFromGallery = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('İzin gerekli', 'Galeri iznini açmalısın.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!result.canceled && result.assets.length > 0) {
          updateOwnerField('photoUri', result.assets[0].uri);
        }
      };

      if (Platform.OS === 'web') {
        await pickOwnerFromGallery();
        return;
      }

      Alert.alert('Profil Fotoğrafı', 'Kaynak seç', [
        {
          text: 'Kamera',
          onPress: () => {
            void (async () => {
              const permission = await ImagePicker.requestCameraPermissionsAsync();
              if (!permission.granted) {
                Alert.alert('İzin gerekli', 'Kamera iznini açmalısın.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });
              if (!result.canceled && result.assets.length > 0) {
                updateOwnerField('photoUri', result.assets[0].uri);
              }
            })();
          },
        },
        {
          text: 'Galeri',
          onPress: () => {
            void (async () => {
              await pickOwnerFromGallery();
            })();
          },
        },
        { text: 'İptal', style: 'cancel' },
      ]);
    } catch (error) {
      console.log('İnsan profil fotoğrafı seçme hatası:', error);
      Alert.alert('Hata', 'Profil fotoğrafı seçilirken bir sorun oluştu.');
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Çıkış yap', 'Hesaptan çıkmak istiyor musun?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: () => void signOut(),
      },
    ]);
  };

  const activePetRelations = useMemo(() => {
    if (!activePet) return [];
    return relations
      .filter((item) => item.sourcePetId === activePet.id)
      .map((item) => {
        const target = pets.find((pet) => pet.id === item.targetPetId);
        if (!target) return null;
        return { relation: item, target };
      })
      .filter((item): item is { relation: PetRelation; target: PetProfile } => Boolean(item));
  }, [activePet, relations, pets]);

  const openRelationModal = () => {
    if (!activePet) return;
    const candidates = pets.filter((pet) => pet.id !== activePet.id);
    if (candidates.length === 0) {
      Alert.alert('Ek pet gerekli', 'İlişki kurmak için en az bir pet daha eklemelisin.');
      return;
    }

    setRelationTypeInput('Arkadaşı');
    setRelationTargetPetIdInput(candidates[0].id);
    setRelationModalVisible(true);
  };

  const saveRelation = async () => {
    if (!activePet) return;
    if (!relationTargetPetIdInput) {
      Alert.alert('Eksik bilgi', 'Bir pet seçmelisin.');
      return;
    }

    const exists = relations.some(
      (item) =>
        item.sourcePetId === activePet.id &&
        item.targetPetId === relationTargetPetIdInput &&
        item.relationType === relationTypeInput
    );
    if (exists) {
      Alert.alert('Zaten ekli', 'Bu ilişki zaten mevcut.');
      return;
    }

    const nextRelation: PetRelation = {
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourcePetId: activePet.id,
      targetPetId: relationTargetPetIdInput,
      relationType: relationTypeInput,
    };

    await persistRelations([...relations, nextRelation]);
    setRelationModalVisible(false);
  };

  const removeRelation = async (relationId: string) => {
    const next = relations.filter((item) => item.id !== relationId);
    await persistRelations(next);
  };

  const goToRelatedPet = async (targetPetId: string) => {
    await setActivePetAndPersist(targetPetId);
    setExpandedPetId('');
    setActiveTab('profile');
  };

  const resetLocalAppData = () => {
    Alert.alert(
      'Yerel verileri sıfırla',
      'Tüm pet profilleri, ilanlar, mesajlar ve uygulama ayarları bu cihazdan silinecek. Devam etmek istiyor musun?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: async () => {
            try {
              setClearingData(true);
              await AsyncStorage.multiRemove(RESET_KEYS);

              const firstPet = createEmptyPet(1);
              setPets([firstPet]);
              setActivePetId(firstPet.id);
              setExpandedPetId('');
              setRelations([]);
              setOwnerProfile(defaultOwnerProfile);
              setInitialOwnerUsername('');
              setAppSettings(defaultAppSettings);
              setActiveTab('profile');
              setShowOwnerCardModal(false);
              setRelationModalVisible(false);

              Alert.alert('Tamamlandı', 'Yerel veriler sıfırlandı.');
            } catch (error) {
              console.log('Yerel veri sifirlama hatasi:', error);
              Alert.alert('Hata', 'Veriler sıfırlanırken bir sorun oluştu.');
            } finally {
              setClearingData(false);
            }
          },
        },
      ]
    );
  };

  if (!activePet) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Profil hazırlanıyor...</Text>
      </View>
    );
  }

  const isEditorOpen = expandedPetId === activePet.id;
  const ownerHandle = normalizeUsername(ownerProfile.username);
  const ageInfo = activePet.age.trim() ? `${activePet.age} ${activePet.ageUnit}` : 'Yaş bilgisi yok';
  const aboutText = ownerProfile.bio.trim() || 'Profil açıklaması eklemek için insan profiline dokun.';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileHeaderCard}>
          <Pressable style={styles.profileCover} onPress={pickPetCoverPhoto}>
            {activePet.coverPhotoUri ? (
              <Image source={{ uri: activePet.coverPhotoUri }} style={styles.profileCoverImage} />
            ) : null}
            <View style={styles.coverEditBadge}>
              <MaterialIcons name="photo-camera" size={13} color="#FFFFFF" />
              <Text style={styles.coverEditText}>Kapak</Text>
            </View>
          </Pressable>
          <View style={styles.profileHeaderTop}>
            <Pressable style={styles.avatarButton} onPress={pickPetPhoto}>
              {activePet.photoUri ? (
                <Image source={{ uri: activePet.photoUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <MaterialIcons name="pets" size={28} color="#4B5563" />
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <MaterialIcons name="photo-camera" size={14} color="#FFFFFF" />
              </View>
            </Pressable>

            <View style={styles.profileHeaderInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.heroName}>{activePet.name || 'İsimsiz pet'}</Text>
                <Pressable style={styles.ownerMiniTag} onPress={() => setShowOwnerCardModal(true)}>
                  <MaterialIcons name="person-outline" size={13} color="#1D4ED8" />
                  <Text style={styles.ownerMiniTagText}>Sahibi</Text>
                </Pressable>
              </View>
              <Text style={styles.socialHandle}>{ownerHandle ? `@${ownerHandle}` : '@kullaniciadi'}</Text>
              <Text style={styles.socialMeta}>
                {activePet.species}
                {appSettings.showPetAgeOnProfile ? ` • ${ageInfo}` : ''}
              </Text>
            </View>

          </View>

          <View style={styles.socialStatsRow}>
            <View style={styles.socialStatItem}>
              <Text style={styles.socialStatValue}>{pets.length}</Text>
              <Text style={styles.socialStatLabel}>Pet</Text>
            </View>
            <View style={styles.socialStatItem}>
              <Text style={styles.socialStatValue}>{ownerProfileReady ? 'Hazır' : 'Eksik'}</Text>
              <Text style={styles.socialStatLabel}>İlan</Text>
            </View>
          </View>
        </View>

        <View style={styles.profileTabs}>
          <Pressable
            style={[styles.profileTabButton, activeTab === 'profile' ? styles.profileTabButtonActive : null]}
            onPress={() => setActiveTab('profile')}
          >
            <Text style={[styles.profileTabText, activeTab === 'profile' ? styles.profileTabTextActive : null]}>
              Profil
            </Text>
          </Pressable>
          <Pressable
            style={[styles.profileTabButton, activeTab === 'pets' ? styles.profileTabButtonActive : null]}
            onPress={() => setActiveTab('pets')}
          >
            <Text style={[styles.profileTabText, activeTab === 'pets' ? styles.profileTabTextActive : null]}>
              Petler
            </Text>
          </Pressable>
          <Pressable
            style={[styles.profileTabButton, activeTab === 'settings' ? styles.profileTabButtonActive : null]}
            onPress={() => setActiveTab('settings')}
          >
            <Text style={[styles.profileTabText, activeTab === 'settings' ? styles.profileTabTextActive : null]}>
              Ayarlar
            </Text>
          </Pressable>
        </View>

        {activeTab === 'profile' ? (
          <>
            <View style={styles.socialProfileCard}>
              <Text style={styles.cardSectionTitle}>Profil Özeti</Text>
              <Text style={styles.socialAboutText}>{aboutText}</Text>

              <View style={styles.ownerStatusRow}>
                <Text style={styles.ownerStatus}>
                  {ownerProfileReady
                    ? `${ownerProfile.fullName} • ${ownerProfile.city || 'Şehir eklenmedi'}`
                    : 'İlan verebilmek için insan profilini tamamla.'}
                </Text>
                <Pressable style={styles.ownerInlineButton} onPress={() => setShowOwnerModal(true)}>
                  <Text style={styles.ownerInlineButtonText}>Düzenle</Text>
                </Pressable>
              </View>

              <View style={styles.profileFooterRow}>
                <Text style={styles.sessionText}>
                  {session?.user?.email ? `Oturum: ${session.user.email}` : 'Oturum açılmadı'}
                </Text>
              </View>
            </View>

            <View style={styles.socialProfileCard}>
              <View style={styles.relationsHeaderRow}>
                <Text style={styles.cardSectionTitle}>Pet Bağlantıları</Text>
                <Pressable style={styles.ownerInlineButton} onPress={openRelationModal}>
                  <Text style={styles.ownerInlineButtonText}>Bağ Ekle</Text>
                </Pressable>
              </View>

              {activePetRelations.length === 0 ? (
                <Text style={styles.collapsedText}>
                  Henüz ilişki eklenmemiş. Arkadaşı, sevgilisi veya kardeşi için bağ oluşturabilirsin.
                </Text>
              ) : (
                activePetRelations.map(({ relation, target }) => (
                  <View key={relation.id} style={styles.relationCard}>
                    <View style={styles.relationMain}>
                      {target.photoUri ? (
                        <Image source={{ uri: target.photoUri }} style={styles.relationAvatar} />
                      ) : (
                        <View style={styles.relationAvatarFallback}>
                          <MaterialIcons name="pets" size={16} color="#1D4ED8" />
                        </View>
                      )}
                      <Pressable style={styles.relationInfoWrap} onPress={() => void goToRelatedPet(target.id)}>
                        <Text style={styles.relationTypeText}>{relation.relationType}</Text>
                        <Text style={styles.relationNameText}>{target.name || 'İsimsiz pet'}</Text>
                      </Pressable>
                    </View>
                    <Pressable style={styles.relationDeleteButton} onPress={() => void removeRelation(relation.id)}>
                      <MaterialIcons name="close" size={15} color="#B91C1C" />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}

        {activeTab === 'pets' ? (
          <>
            <View style={styles.petList}>
              {pets.map((pet) => {
                const selected = pet.id === activePet.id;
                const editing = pet.id === expandedPetId;
                const petCompletion = getPetCompletionPercent(pet);
                const petAgeInfo = pet.age.trim() ? `${pet.age} ${pet.ageUnit}` : 'Yaş bilgisi yok';

                return (
                  <View key={pet.id} style={[styles.petListCard, selected ? styles.petListCardSelected : null]}>
                    <View style={styles.petListHeader}>
                      <Pressable style={styles.petListNameWrap} onPress={() => void openPetEditor(pet.id)}>
                        <Text style={styles.petListName}>{pet.name || 'İsimsiz pet'}</Text>
                        <Text style={styles.petListMeta}>
                          {pet.species} • {petAgeInfo}
                        </Text>
                      </Pressable>
                      <Text style={styles.petListPercent}>%{petCompletion}</Text>
                    </View>

                    <View style={styles.petListActions}>
                      <Pressable
                        style={[styles.petListActionButton, styles.petSelectButton]}
                        onPress={() => void setActivePetAndPersist(pet.id)}
                      >
                        <Text style={styles.petSelectButtonText}>Seç</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.petListActionButton, styles.petEditButton]}
                        onPress={() => void openPetEditor(pet.id)}
                      >
                        <Text style={styles.petEditButtonText}>{editing ? 'Açık' : 'Düzenle'}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            <Pressable style={styles.addPetButton} onPress={addNewPet}>
              <MaterialIcons name="add" size={18} color="#14532D" />
              <Text style={styles.addPetText}>Daha fazla pet ekle</Text>
            </Pressable>

            <View style={styles.completionBox}>
              <Text style={styles.completionTitle}>Aktif pet düzenleme paneli</Text>
              <Text style={styles.completionPercent}>{activePet.name || 'Pet'}</Text>
              <Pressable
                style={styles.quickEditButton}
                onPress={() => setExpandedPetId(isEditorOpen ? '' : activePet.id)}
              >
                <Text style={styles.quickEditButtonText}>
                  {isEditorOpen ? 'Detayı Kapat' : `${activePet.name || 'Pet'} için Düzenle`}
                </Text>
              </Pressable>
            </View>

            {isEditorOpen ? (
              <>
                <Input
                  label="Adı"
                  value={activePet.name}
                  placeholder="Örn: Odin"
                  onChangeText={(value) => updateActivePetField('name', value)}
                />

                <Text style={styles.label}>Tür</Text>
                <ChipGroup
                  options={['Köpek', 'Kedi', 'Kuş', 'Diğer']}
                  selected={activePet.species}
                  onSelect={(value) => updateActivePetField('species', value)}
                />

                <Input
                  label="Irk"
                  value={activePet.breed}
                  placeholder="Örn: Golden Retriever"
                  onChangeText={(value) => updateActivePetField('breed', value)}
                />

                <Text style={styles.label}>Cinsiyet</Text>
                <ChipGroup
                  options={['Dişi', 'Erkek', 'Bilinmiyor']}
                  selected={activePet.gender}
                  onSelect={(value) => updateActivePetField('gender', value)}
                />

                <Input
                  label="Yaş"
                  value={activePet.age}
                  placeholder="Örn: 3"
                  keyboardType="numeric"
                  onChangeText={(value) => updateActivePetField('age', value)}
                />

                <Text style={styles.label}>Yaş birimi</Text>
                <ChipGroup
                  options={['Ay', 'Yaş']}
                  selected={activePet.ageUnit}
                  onSelect={(value) => updateActivePetField('ageUnit', value)}
                />

                <Input
                  label="Kilo"
                  value={activePet.weight}
                  placeholder="Örn: 18"
                  keyboardType="numeric"
                  onChangeText={(value) => updateActivePetField('weight', value)}
                />

                <Text style={styles.label}>Kısırlaştırıldı mı?</Text>
                <ChipGroup
                  options={['Evet', 'Hayır', 'Bilinmiyor']}
                  selected={activePet.neutered}
                  onSelect={(value) => updateActivePetField('neutered', value)}
                />

                <Text style={styles.label}>Çip durumu</Text>
                <ChipGroup
                  options={['Var', 'Yok', 'Bilinmiyor']}
                  selected={activePet.microchipStatus}
                  onSelect={(value) => updateActivePetField('microchipStatus', value)}
                />

                <Input
                  label="Mama / Beslenme tipi"
                  value={activePet.foodType}
                  placeholder="Örn: Kuru mama, hassas sindirim maması"
                  onChangeText={(value) => updateActivePetField('foodType', value)}
                />

                <Input
                  label="Günlük mama öğünü sayısı (1-3)"
                  value={activePet.mealsPerDay}
                  placeholder="Örn: 2"
                  keyboardType="numeric"
                  onChangeText={(value) => updateActivePetField('mealsPerDay', value)}
                />

                <Input
                  label="Alerjiler"
                  value={activePet.allergies}
                  placeholder="Varsa alerjilerini yaz"
                  multiline
                  onChangeText={(value) => updateActivePetField('allergies', value)}
                />

                <Input
                  label="Hastalıklar"
                  value={activePet.diseases}
                  placeholder="Varsa hastalıklarını yaz"
                  multiline
                  onChangeText={(value) => updateActivePetField('diseases', value)}
                />

                <Input
                  label="Kullandığı ilaçlar"
                  value={activePet.medicines}
                  placeholder="Varsa düzenli ilaçlarını yaz"
                  multiline
                  onChangeText={(value) => updateActivePetField('medicines', value)}
                />

                <Input
                  label="Davranış notları"
                  value={activePet.behaviorNotes}
                  placeholder="Örn: Yalnız kalınca stres oluyor"
                  multiline
                  onChangeText={(value) => updateActivePetField('behaviorNotes', value)}
                />

                <Input
                  label="Genel notlar"
                  value={activePet.notes}
                  placeholder="Evcil hayvanın hakkında önemli notlar"
                  multiline
                  onChangeText={(value) => updateActivePetField('notes', value)}
                />

                <Pressable style={styles.saveButton} onPress={saveProfiles} disabled={saving}>
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Kaydediliyor...' : 'Tüm Profilleri Kaydet'}
                  </Text>
                </Pressable>

                <Pressable style={styles.closeEditorButton} onPress={() => setExpandedPetId('')}>
                  <Text style={styles.closeEditorButtonText}>Düzenlemeyi Kapat</Text>
                </Pressable>

                <Pressable style={styles.deleteButton} onPress={deleteActivePet}>
                  <Text style={styles.deleteButtonText}>Profili Sil</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.collapsedBox}>
                <Text style={styles.collapsedTitle}>Profil detayları kapalı</Text>
                <Text style={styles.collapsedText}>
                  {activePet.name || 'Bu pet'} için tüm soru alanlarını görmek ve düzenlemek için Düzenle butonuna
                  dokun.
                </Text>
                <Pressable style={styles.collapsedActionButton} onPress={() => setExpandedPetId(activePet.id)}>
                  <Text style={styles.collapsedActionText}>Detayları Aç</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null}

        {activeTab === 'settings' ? (
          <>
            <View style={styles.settingsCard}>
              <Text style={styles.cardSectionTitle}>Gizlilik ve Paylaşım</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingTextWrap}>
                  <Text style={styles.settingTitle}>Profili gizli tut</Text>
                  <Text style={styles.settingDesc}>Açık olduğunda hesap daha sınırlı görünür.</Text>
                </View>
                <Switch
                  value={appSettings.privateProfile}
                  onValueChange={(value) => void updateAppSetting('privateProfile', value)}
                  trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                  thumbColor={appSettings.privateProfile ? '#1D4ED8' : '#F8FAFC'}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingTextWrap}>
                  <Text style={styles.settingTitle}>Mesaj isteklerine izin ver</Text>
                  <Text style={styles.settingDesc}>İlanlarına mesajla ulaşılmasını aç/kapat.</Text>
                </View>
                <Switch
                  value={appSettings.messageRequests}
                  onValueChange={(value) => void updateAppSetting('messageRequests', value)}
                  trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                  thumbColor={appSettings.messageRequests ? '#1D4ED8' : '#F8FAFC'}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingTextWrap}>
                  <Text style={styles.settingTitle}>İlanda iletişim bilgisi göster</Text>
                  <Text style={styles.settingDesc}>Telefon/e-posta görünürlüğünü yönetirsin.</Text>
                </View>
                <Switch
                  value={appSettings.showContactInListings}
                  onValueChange={(value) => void updateAppSetting('showContactInListings', value)}
                  trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                  thumbColor={appSettings.showContactInListings ? '#1D4ED8' : '#F8FAFC'}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingTextWrap}>
                  <Text style={styles.settingTitle}>Pet yaşını profilde göster</Text>
                  <Text style={styles.settingDesc}>Profil kartındaki yaş bilgisini aç/kapat.</Text>
                </View>
                <Switch
                  value={appSettings.showPetAgeOnProfile}
                  onValueChange={(value) => void updateAppSetting('showPetAgeOnProfile', value)}
                  trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                  thumbColor={appSettings.showPetAgeOnProfile ? '#1D4ED8' : '#F8FAFC'}
                />
              </View>
            </View>

            <View style={styles.settingsCard}>
              <Text style={styles.cardSectionTitle}>Hesap ve Veri</Text>

              <Pressable style={styles.settingsActionButton} onPress={() => setShowOwnerModal(true)}>
                <MaterialIcons name="badge" size={16} color="#1D4ED8" />
                <Text style={styles.settingsActionText}>İnsan profilini düzenle</Text>
              </Pressable>

              <Pressable style={styles.settingsActionButton} onPress={confirmSignOut}>
                <MaterialIcons name="logout" size={16} color="#1D4ED8" />
                <Text style={styles.settingsActionText}>Oturumu kapat</Text>
              </Pressable>

              <Pressable
                style={[styles.settingsActionButton, styles.settingsDangerButton]}
                onPress={resetLocalAppData}
                disabled={clearingData}
              >
                <MaterialIcons name="delete-forever" size={16} color="#B91C1C" />
                <Text style={styles.settingsDangerText}>
                  {clearingData ? 'Sıfırlanıyor...' : 'Uygulama verilerini sıfırla'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <Modal
          visible={showOwnerCardModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowOwnerCardModal(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowOwnerCardModal(false)} accessible={false}>
            <View style={styles.modalOverlay}>
              <View style={styles.ownerCardModal}>
                <View style={styles.ownerCardHeader}>
                  {ownerProfile.photoUri ? (
                    <Image source={{ uri: ownerProfile.photoUri }} style={styles.ownerCardAvatar} />
                  ) : (
                    <View style={styles.ownerCardAvatarFallback}>
                      <MaterialIcons name="person" size={20} color="#1D4ED8" />
                    </View>
                  )}
                  <View style={styles.ownerCardInfo}>
                    <Text style={styles.ownerCardName}>{ownerProfile.fullName || 'İsimsiz Kullanıcı'}</Text>
                    <Text style={styles.ownerCardHandle}>
                      @{normalizeUsername(ownerProfile.username) || 'kullanici'}
                    </Text>
                  </View>
                </View>

                <View style={styles.ownerCardBody}>
                  <Text style={styles.ownerCardLine}>Şehir: {ownerProfile.city || 'Belirtilmedi'}</Text>
                  <Text style={styles.ownerCardLine}>Hobiler: {ownerProfile.hobbies || 'Belirtilmedi'}</Text>
                  <Text style={styles.ownerCardLine}>
                    {activePet.name || 'Bu pet'} ile: {ownerProfile.withPetSince || 'Belirtilmedi'}
                  </Text>
                </View>

                <Pressable style={styles.ownerCardCloseButton} onPress={() => setShowOwnerCardModal(false)}>
                  <Text style={styles.ownerCardCloseText}>Kapat</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal
          visible={relationModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setRelationModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Pet Bağı Ekle</Text>
                  <Pressable onPress={() => setRelationModalVisible(false)} style={styles.modalCloseButton}>
                    <MaterialIcons name="close" size={18} color="#334155" />
                  </Pressable>
                </View>

                <Text style={styles.modalHint}>İlişki tipi seç ve hangi petle bağlantılı olduğunu belirt.</Text>

                <Text style={styles.label}>İlişki</Text>
                <ChipGroup
                  options={['Arkadaşı', 'Sevgilisi', 'Kardeşi']}
                  selected={relationTypeInput}
                  onSelect={(value) => setRelationTypeInput(value as RelationType)}
                />

                <Text style={styles.label}>Bağlı pet</Text>
                <View style={styles.chipGroup}>
                  {pets
                    .filter((pet) => pet.id !== activePet.id)
                    .map((pet) => {
                      const selected = relationTargetPetIdInput === pet.id;
                      return (
                        <Pressable
                          key={pet.id}
                          style={[styles.chip, selected ? styles.selectedChip : null]}
                          onPress={() => setRelationTargetPetIdInput(pet.id)}
                        >
                          <Text style={[styles.chipText, selected ? styles.selectedChipText : null]}>
                            {pet.name || 'İsimsiz pet'}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                <Pressable style={styles.modalSaveButton} onPress={() => void saveRelation()}>
                  <Text style={styles.modalSaveButtonText}>Bağı Kaydet</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal
        visible={showOwnerModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowOwnerModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>İnsan Profili</Text>
              <Pressable onPress={() => setShowOwnerModal(false)} style={styles.modalCloseButton}>
                <MaterialIcons name="close" size={18} color="#334155" />
              </Pressable>
            </View>

            <Text style={styles.modalHint}>
              İlan verirken bu bilgiler görünür. Ad-soyad, kullanıcı adı ve e-posta zorunlu.
            </Text>

            <Pressable style={styles.ownerPhotoPicker} onPress={() => void pickOwnerPhoto()}>
              {ownerProfile.photoUri ? (
                <Image source={{ uri: ownerProfile.photoUri }} style={styles.ownerPhotoPreview} />
              ) : (
                <View style={styles.ownerPhotoFallback}>
                  <MaterialIcons name="add-a-photo" size={18} color="#1D4ED8" />
                  <Text style={styles.ownerPhotoFallbackText}>Profil fotoğrafı ekle</Text>
                </View>
              )}
            </Pressable>

            <Input
              label="Ad Soyad"
              value={ownerProfile.fullName}
              placeholder="Orn: Emre Y."
              onChangeText={(value) => updateOwnerField('fullName', value)}
            />
            <Input
              label="Kullanıcı Adı"
              value={ownerProfile.username}
              placeholder="Orn: emrealin"
              onChangeText={(value) => updateOwnerField('username', normalizeUsername(value))}
            />
            {normalizeUsername(ownerProfile.username) ? (
              <Text style={styles.usernamePreview}>Profil etiketi: @{normalizeUsername(ownerProfile.username)}</Text>
            ) : null}
            <Input
              label="E-posta"
              value={ownerProfile.email}
              placeholder="Orn: ornek@mail.com"
              keyboardType="default"
              onChangeText={(value) => updateOwnerField('email', value)}
            />
            <Input
              label="Telefon (opsiyonel)"
              value={ownerProfile.phone}
              placeholder="Orn: 05xx xxx xx xx"
              keyboardType="phone-pad"
              onChangeText={(value) => updateOwnerField('phone', value)}
            />
            <Input
              label="Sehir (opsiyonel)"
              value={ownerProfile.city}
              placeholder="Orn: Istanbul"
              onChangeText={(value) => updateOwnerField('city', value)}
            />
            <Input
              label="Profil açıklaması (opsiyonel)"
              value={ownerProfile.bio}
              placeholder="Petlerle yaşayan, şehirde aktif ve yardımlaşmaya açık."
              multiline
              onChangeText={(value) => updateOwnerField('bio', value)}
            />
            <Input
              label="Hobiler (opsiyonel)"
              value={ownerProfile.hobbies}
              placeholder="Orn: Kamp, yürüyüş, barınak gönüllülüğü"
              onChangeText={(value) => updateOwnerField('hobbies', value)}
            />
            <Input
              label={`${activePet.name || 'Pet'} ile ne kadar berabersin? (opsiyonel)`}
              value={ownerProfile.withPetSince}
              placeholder="Orn: 2 yıldır birlikteyiz"
              onChangeText={(value) => updateOwnerField('withPetSince', value)}
            />

            <Pressable style={styles.modalSaveButton} onPress={saveOwnerProfile} disabled={savingOwner}>
              <Text style={styles.modalSaveButtonText}>
                {savingOwner ? 'Kaydediliyor...' : 'İnsan Profilini Kaydet'}
              </Text>
            </Pressable>
            </ScrollView>
          </View>
        </View>
        </TouchableWithoutFeedback>
        </Modal>
      </ScrollView>
    </SafeAreaView>
    </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

type InputProps = {
  label: string;
  value: string;
  placeholder: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  multiline?: boolean;
  onChangeText: (value: string) => void;
};

function Input(props: InputProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline ? styles.multilineInput : null]}
        value={props.value}
        placeholder={props.placeholder}
        placeholderTextColor="#4B5563"
        keyboardType={props.keyboardType || 'default'}
        multiline={props.multiline}
        onChangeText={props.onChangeText}
      />
    </View>
  );
}

type ChipGroupProps = {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
};

function ChipGroup(props: ChipGroupProps) {
  return (
    <View style={styles.chipGroup}>
      {props.options.map((option) => {
        const selected = props.selected === option;

        return (
          <Pressable
            key={option}
            style={[styles.chip, selected ? styles.selectedChip : null]}
            onPress={() => props.onSelect(option)}
          >
            <Text style={[styles.chipText, selected ? styles.selectedChipText : null]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FBFF',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  profileHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    overflow: 'hidden',
    marginBottom: 12,
  },
  profileCover: {
    height: 124,
    backgroundColor: '#DDF4FF',
    position: 'relative',
    overflow: 'hidden',
  },
  profileCoverImage: {
    width: '100%',
    height: '100%',
  },
  coverEditBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(15,23,42,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  coverEditText: {
    marginLeft: 4,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  profileHeaderTop: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginTop: -34,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  profileHeaderInfo: {
    flex: 1,
    marginLeft: 13,
    marginBottom: 8,
    gap: 4,
  },
  profileHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    marginRight: 4,
  },
  profileTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 16,
    padding: 4,
    marginBottom: 12,
  },
  profileTabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 8,
  },
  profileTabButtonActive: {
    backgroundColor: '#2563EB',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  profileTabText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
  },
  profileTabTextActive: {
    color: '#FFFFFF',
  },
  cardSectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F5EF',
  },
  loadingText: {
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1F2933',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#5B6470',
    lineHeight: 21,
  },
  ownerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    marginTop: 2,
  },
  socialProfileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE6EE',
    padding: 14,
    marginBottom: 12,
  },
  socialHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  socialHandle: {
    marginTop: 4,
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '800',
  },
  socialMeta: {
    marginTop: 3,
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  socialStatsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 15,
  },
  socialStatItem: {
    alignItems: 'center',
    minWidth: 86,
    borderRadius: 16,
    backgroundColor: '#F8FBFF',
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  socialStatValue: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  socialStatLabel: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  socialAboutText: {
    marginTop: 12,
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ownerStatusRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ownerStatus: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    flex: 1,
    marginRight: 8,
  },
  ownerInlineButton: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  ownerInlineButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 12,
  },
  profileFooterRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  sessionText: {
    color: '#64748B',
    fontSize: 11,
  },
  petList: {
    marginTop: 6,
    marginBottom: 8,
    gap: 8,
  },
  petListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DFE6EE',
    padding: 12,
  },
  petListCardSelected: {
    borderColor: '#256D5A',
    backgroundColor: '#F5FFFA',
  },
  petListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  petListNameWrap: {
    flex: 1,
    marginRight: 8,
  },
  petListName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2933',
  },
  petListMeta: {
    marginTop: 2,
    color: '#5B6470',
    fontSize: 13,
  },
  petListPercent: {
    color: '#256D5A',
    fontSize: 16,
    fontWeight: '800',
  },
  petListActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  petListActionButton: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  petSelectButton: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  petSelectButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  petEditButton: {
    backgroundColor: '#256D5A',
  },
  petEditButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  addPetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9FBE5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#98E2B4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  addPetText: {
    marginLeft: 4,
    color: '#14532D',
    fontWeight: '700',
    fontSize: 14,
  },
  avatarButton: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#E0F2FE',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    width: '100%',
    borderRadius: 46,
    backgroundColor: '#E0F2FE',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 46,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 29,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  ownerMiniTag: {
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownerMiniTagText: {
    marginLeft: 3,
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '700',
  },
  completionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  },
  completionTitle: {
    fontSize: 15,
    color: '#5B6470',
    marginBottom: 4,
  },
  completionPercent: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#256D5A',
  },
  quickEditButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickEditButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  quickActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  relationsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  relationCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DFE6EE',
    backgroundColor: '#F8FBFF',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  relationMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  relationAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E2E8F0',
  },
  relationAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  relationInfoWrap: {
    marginLeft: 9,
    flex: 1,
  },
  relationTypeText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  relationNameText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  relationDeleteButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  collapsedBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D0D9E2',
    padding: 14,
    marginBottom: 10,
  },
  collapsedTitle: {
    color: '#1F2933',
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 6,
  },
  collapsedText: {
    color: '#4B5563',
    fontSize: 13,
    lineHeight: 19,
  },
  collapsedActionButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#256D5A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  collapsedActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  closeEditorButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#93C5FD',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closeEditorButtonText: {
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '700',
  },
  petTabText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2933',
    marginBottom: 7,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8D0D9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2DED3',
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedChip: {
    backgroundColor: '#256D5A',
    borderColor: '#256D5A',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#344054',
  },
  selectedChipText: {
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#256D5A',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  deleteButtonText: {
    color: '#B91C1C',
    fontSize: 16,
    fontWeight: '700',
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE6EE',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  settingTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  settingTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  settingDesc: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  settingsActionButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsActionText: {
    marginLeft: 8,
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  settingsDangerButton: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  settingsDangerText: {
    marginLeft: 8,
    color: '#B91C1C',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    maxHeight: '90%',
  },
  ownerCardModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    maxWidth: 380,
    width: '100%',
    alignSelf: 'center',
  },
  ownerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  ownerCardAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E2E8F0',
  },
  ownerCardAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2FF',
  },
  ownerCardInfo: {
    marginLeft: 10,
    flex: 1,
  },
  ownerCardName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  ownerCardHandle: {
    color: '#1D4ED8',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '700',
  },
  ownerCardBody: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  ownerCardLine: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  ownerCardCloseButton: {
    marginTop: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ownerCardCloseText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalHint: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  ownerPhotoPicker: {
    alignSelf: 'center',
    marginBottom: 10,
  },
  ownerPhotoPreview: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#E2E8F0',
  },
  ownerPhotoFallback: {
    width: 140,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerPhotoFallbackText: {
    marginTop: 6,
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  usernamePreview: {
    marginTop: -2,
    marginBottom: 8,
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  modalCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalSaveButton: {
    marginTop: 4,
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalSaveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
