import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PROFILES_KEY = 'petProfilesV2';
const OWNER_PROFILE_KEY = 'petOwnerProfileV1';
const POSTS_KEY = 'petSocialPostsV1';
const POST_COMMENTS_KEY = 'petSocialPostCommentsV1';
const LISTINGS_KEY = 'petCommunityListingsV1';
const MESSAGES_KEY = 'petCommunityMessagesV1';
const DAILY_LOGS_KEY = 'petDailyLogsV1';
const CALENDAR_EVENTS_KEY = 'petCalendarEventsV1';

type ExploreSection = 'feed' | 'nearby' | 'listings' | 'calendar';
type ListingType = 'adoption' | 'mate' | 'lost';
type ContactPreference = 'message' | 'phone' | 'both';
type CalendarEventType = 'vet_visit' | 'vaccine' | 'annual_vaccine' | 'parasite' | 'checkup';
type NearbyStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'preview';

type PetProfile = {
  id: string;
  name: string;
  photoUri: string;
  species: string;
  age: string;
  ageUnit: string;
  microchipStatus: string;
};

type OwnerProfile = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  city: string;
};

type ProfilesStore = {
  pets: PetProfile[];
  activePetId: string;
};

type SocialPost = {
  id: string;
  petId: string;
  petName: string;
  petPhotoUri: string;
  ownerName: string;
  ownerUsername: string;
  ownerEmail: string;
  text: string;
  imageUri: string;
  videoUri: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

type PostComment = {
  id: string;
  postId: string;
  authorName: string;
  authorUsername: string;
  text: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
};

type NearbyPetProfile = {
  id: string;
  petName: string;
  ownerName: string;
  username: string;
  species: string;
  distance: string;
  neighborhood: string;
  status: string;
  photoUri: string;
  online: boolean;
};

type PetListing = {
  id: string;
  type: ListingType;
  petId: string;
  petName: string;
  species: string;
  age: string;
  ageUnit: string;
  microchipStatus: string;
  photoUri: string;
  city: string;
  description: string;
  distinctiveFeatures: string;
  contactPreference: ContactPreference;
  ownerName: string;
  ownerUsername: string;
  ownerEmail: string;
  ownerPhone: string;
  createdAt: string;
  status: 'active' | 'resolved';
};

type CommunityMessage = {
  id: string;
  listingId: string;
  conversationId?: string;
  senderName: string;
  senderUsername?: string;
  senderContact: string;
  text: string;
  imageUri?: string;
  createdAt: string;
  senderType: 'visitor' | 'owner';
};

type DailyLog = {
  water: boolean;
  food: boolean;
  play: boolean;
  toilet: boolean;
  mood: number;
  updatedAt: string;
};

type DailyLogsStore = Record<string, Record<string, DailyLog>>;

type ListingDraft = {
  type: ListingType;
  petName: string;
  species: string;
  age: string;
  ageUnit: string;
  city: string;
  description: string;
  distinctiveFeatures: string;
  contactPreference: ContactPreference;
  photoUri: string;
};

type CalendarEvent = {
  id: string;
  petId: string;
  type: CalendarEventType;
  title: string;
  date: string;
  notes: string;
  createdAt: string;
};

type CalendarDraft = {
  type: CalendarEventType;
  title: string;
  date: string;
  notes: string;
};

const defaultOwnerProfile: OwnerProfile = {
  fullName: '',
  username: '',
  email: '',
  phone: '',
  city: '',
};

const defaultListingDraft: ListingDraft = {
  type: 'adoption',
  petName: '',
  species: 'Kedi',
  age: '',
  ageUnit: 'Yaş',
  city: '',
  description: '',
  distinctiveFeatures: '',
  contactPreference: 'message',
  photoUri: '',
};

const defaultCalendarDraft: CalendarDraft = {
  type: 'vet_visit',
  title: '',
  date: '',
  notes: '',
};

const calendarTypeLabel: Record<CalendarEventType, string> = {
  vet_visit: 'Veteriner',
  vaccine: 'Aşı',
  annual_vaccine: 'Yıllık aşı',
  parasite: 'İç-dış parazit',
  checkup: 'Kontrol',
};

const calendarTypeIcon: Record<CalendarEventType, keyof typeof MaterialIcons.glyphMap> = {
  vet_visit: 'local-hospital',
  vaccine: 'vaccines',
  annual_vaccine: 'event-repeat',
  parasite: 'bug-report',
  checkup: 'fact-check',
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

const getLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const addDaysToDateKey = (dateKey: string, days: number): string => {
  const date = parseDateKey(dateKey) || new Date();
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
};

const addYearsToDateKey = (dateKey: string, years: number): string => {
  const date = parseDateKey(dateKey) || new Date();
  date.setFullYear(date.getFullYear() + years);
  return getLocalDateKey(date);
};

const getDaysUntil = (dateKey: string): number => {
  const target = parseDateKey(dateKey);
  if (!target) return 0;
  const today = parseDateKey(getLocalDateKey(new Date())) || new Date();
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const formatDateLabel = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Bugün';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }).format(date);
};

const formatCalendarDate = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey || 'Tarih yok';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
};

const getPetAgeMonths = (pet: PetProfile | null): number => {
  if (!pet) return 0;
  const age = Number(pet.age);
  if (!Number.isFinite(age) || age <= 0) return 0;
  return pet.ageUnit === 'Ay' ? age : age * 12;
};

const listingTypeLabel: Record<ListingType, string> = {
  adoption: 'Yuva',
  mate: 'Eş',
  lost: 'Kayıp',
};

const listingTypeIcon: Record<ListingType, keyof typeof MaterialIcons.glyphMap> = {
  adoption: 'favorite',
  mate: 'diversity-1',
  lost: 'location-searching',
};

const contactPreferenceLabel: Record<ContactPreference, string> = {
  message: 'Mesaj',
  phone: 'Telefon',
  both: 'Mesaj + Telefon',
};

const speciesOptions = ['Kedi', 'Köpek', 'Kuş', 'Tavşan', 'Diğerleri'];

const seedPosts: SocialPost[] = [
  {
    id: 'demo-post-boncuk',
    petId: 'demo-boncuk',
    petName: 'Boncuk',
    petPhotoUri:
      'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=300&q=80',
    ownerName: 'Maya Çelik',
    ownerUsername: 'maya.boncuk',
    ownerEmail: '',
    text: 'Boncuk bugün cam kenarında güneş nöbetinde. Su kabını yeniledim, birazdan oyun saati.',
    imageUri:
      'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=1200&q=80',
    videoUri: '',
    createdAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    likeCount: 128,
    commentCount: 2,
    likedByMe: false,
  },
  {
    id: 'demo-post-leo',
    petId: 'demo-leo',
    petName: 'Leo',
    petPhotoUri:
      'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=300&q=80',
    ownerName: 'Emir Arslan',
    ownerUsername: 'emir.leo',
    ownerEmail: '',
    text: 'Leo yeni tasmasını gururla gezdirdi. Akşam yürüyüşünde 20 dakika yetmedi, enerjisi hâlâ tavan.',
    imageUri:
      'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1200&q=80',
    videoUri: '',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    likeCount: 96,
    commentCount: 3,
    likedByMe: false,
  },
  {
    id: 'demo-post-misket',
    petId: 'demo-misket',
    petName: 'Misket',
    petPhotoUri:
      'https://images.unsplash.com/photo-1596854407944-bf87f6fdd49e?auto=format&fit=crop&w=300&q=80',
    ownerName: 'Defne Yılmaz',
    ownerUsername: 'defne.misket',
    ownerEmail: '',
    text: 'Misket bugün oyuncak faresini sakladı. Bulana kadar evde küçük bir hazine avı yaşandı.',
    imageUri:
      'https://images.unsplash.com/photo-1596854407944-bf87f6fdd49e?auto=format&fit=crop&w=1200&q=80',
    videoUri: '',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(),
    likeCount: 74,
    commentCount: 2,
    likedByMe: false,
  },
  {
    id: 'demo-post-pasa',
    petId: 'demo-pasa',
    petName: 'Paşa',
    petPhotoUri:
      'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?auto=format&fit=crop&w=300&q=80',
    ownerName: 'Can Aksoy',
    ownerUsername: 'can.pasa',
    ownerEmail: '',
    text: 'Paşa parkta yeni arkadaş edindi. Sosyalleşme kısmı uygulamada gerçekten işe yarayacak gibi.',
    imageUri:
      'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?auto=format&fit=crop&w=1200&q=80',
    videoUri: '',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    likeCount: 113,
    commentCount: 4,
    likedByMe: false,
  },
];

const seedComments: PostComment[] = [
  {
    id: 'comment-1',
    postId: 'demo-post-boncuk',
    authorName: 'Defne Yılmaz',
    authorUsername: 'defne.misket',
    text: 'Misket de güneş görünce aynı moda giriyor.',
    createdAt: new Date(Date.now() - 1000 * 60 * 16).toISOString(),
    likeCount: 3,
    likedByMe: false,
  },
  {
    id: 'comment-2',
    postId: 'demo-post-boncuk',
    authorName: 'Emir Arslan',
    authorUsername: 'emir.leo',
    text: 'Boncuk tam huzur uzmanı olmuş.',
    createdAt: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    likeCount: 5,
    likedByMe: false,
  },
  {
    id: 'comment-3',
    postId: 'demo-post-leo',
    authorName: 'Maya Çelik',
    authorUsername: 'maya.boncuk',
    text: 'Leo enerjisini Boncukla paylaşsın lütfen.',
    createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    likeCount: 2,
    likedByMe: false,
  },
  {
    id: 'comment-4',
    postId: 'demo-post-misket',
    authorName: 'Can Aksoy',
    authorUsername: 'can.pasa',
    text: 'Bu hazine avını Paşa görse oyunu büyütürdü.',
    createdAt: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    likeCount: 4,
    likedByMe: false,
  },
  {
    id: 'comment-5',
    postId: 'demo-post-pasa',
    authorName: 'Emir Arslan',
    authorUsername: 'emir.leo',
    text: 'Sosyalleşme kısmı Leo için de çok iyi olur.',
    createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    likeCount: 6,
    likedByMe: false,
  },
  {
    id: 'comment-6',
    postId: 'demo-post-pasa',
    authorName: 'Defne Yılmaz',
    authorUsername: 'defne.misket',
    text: 'Paşa’nın enerjisi fotoğraftan bile belli.',
    createdAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    likeCount: 1,
    likedByMe: false,
  },
];

const nearbySeedPets: NearbyPetProfile[] = [
  {
    id: 'nearby-luna',
    petName: 'Luna',
    ownerName: 'Zeynep',
    username: 'zeynep.luna',
    species: 'Kedi',
    distance: '0.6 km',
    neighborhood: 'Aynı mahalle',
    status: 'Sakin oyun arkadaşı arıyor',
    photoUri: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=400&q=80',
    online: true,
  },
  {
    id: 'nearby-kopuk',
    petName: 'Köpük',
    ownerName: 'Deniz',
    username: 'deniz.kopuk',
    species: 'Köpek',
    distance: '1.1 km',
    neighborhood: 'Park çevresi',
    status: 'Akşam yürüyüş arkadaşı olabilir',
    photoUri: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=400&q=80',
    online: false,
  },
  {
    id: 'nearby-mavi',
    petName: 'Mavi',
    ownerName: 'Ece',
    username: 'ece.mavi',
    species: 'Kuş',
    distance: '1.8 km',
    neighborhood: 'Yakın çevre',
    status: 'Pet dostu kafeler için öneri paylaşıyor',
    photoUri: 'https://images.unsplash.com/photo-1522926193341-e9ffd686c60f?auto=format&fit=crop&w=400&q=80',
    online: true,
  },
];

const seedMessages: CommunityMessage[] = [
  {
    id: 'seed-msg-1',
    listingId: 'seed-listing',
    conversationId: 'demo-sima',
    senderName: 'Şima',
    senderUsername: 'sima.pati',
    senderContact: 'sima@example.com',
    text: 'Selam, ilanındaki dost için bilgi almak istedim. Uygunsa konuşabilir miyiz?',
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    senderType: 'visitor',
  },
  {
    id: 'seed-msg-2',
    listingId: 'seed-listing',
    conversationId: 'demo-arya',
    senderName: 'Arya',
    senderUsername: 'aryavetdegil',
    senderContact: 'arya@example.com',
    text: 'Fotoğrafı çok tatlı. Yaş ve şehir bilgisini paylaşabilir misin?',
    createdAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    senderType: 'visitor',
  },
];

const normalizePet = (input: Record<string, unknown>, index: number): PetProfile => ({
  id: getString(input.id) || `pet-${index}`,
  name: getString(input.name) || `Pet ${index}`,
  photoUri: getString(input.photoUri),
  species: getString(input.species) || getString(input.type) || 'Köpek',
  age: getString(input.age),
  ageUnit: getString(input.ageUnit) || 'Yaş',
  microchipStatus: getString(input.microchipStatus) || 'Bilinmiyor',
});

const normalizeOwner = (input: Record<string, unknown>): OwnerProfile => ({
  fullName: getString(input.fullName),
  username: normalizeUsername(getString(input.username)),
  email: getString(input.email),
  phone: getString(input.phone),
  city: getString(input.city),
});

const normalizePost = (input: Record<string, unknown>): SocialPost => ({
  id: getString(input.id) || `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  petId: getString(input.petId),
  petName: getString(input.petName) || 'Pet',
  petPhotoUri: getString(input.petPhotoUri),
  ownerName: getString(input.ownerName) || 'Pet sahibi',
  ownerUsername: normalizeUsername(getString(input.ownerUsername)) || 'petcare',
  ownerEmail: getString(input.ownerEmail),
  text: getString(input.text),
  imageUri: getString(input.imageUri),
  videoUri: getString(input.videoUri),
  createdAt: getString(input.createdAt) || new Date().toISOString(),
  likeCount: typeof input.likeCount === 'number' ? input.likeCount : 0,
  commentCount: typeof input.commentCount === 'number' ? input.commentCount : 0,
  likedByMe: Boolean(input.likedByMe),
});

const normalizeComment = (input: Record<string, unknown>): PostComment => ({
  id: getString(input.id) || `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  postId: getString(input.postId),
  authorName: getString(input.authorName) || 'Pati dostu',
  authorUsername: normalizeUsername(getString(input.authorUsername)) || 'pati.dostu',
  text: getString(input.text),
  createdAt: getString(input.createdAt) || new Date().toISOString(),
  likeCount: typeof input.likeCount === 'number' ? input.likeCount : 0,
  likedByMe: Boolean(input.likedByMe),
});

const normalizeListing = (input: Record<string, unknown>): PetListing => {
  const rawType = getString(input.type) as ListingType;
  const type: ListingType = rawType === 'mate' || rawType === 'lost' || rawType === 'adoption' ? rawType : 'adoption';
  const rawPreference = getString(input.contactPreference) as ContactPreference;
  const contactPreference: ContactPreference =
    rawPreference === 'phone' || rawPreference === 'both' || rawPreference === 'message' ? rawPreference : 'message';

  return {
    id: getString(input.id) || `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    petId: getString(input.petId),
    petName: getString(input.petName) || 'Pet',
    species: getString(input.species) || 'Diğerleri',
    age: getString(input.age),
    ageUnit: getString(input.ageUnit) || 'Yaş',
    microchipStatus: getString(input.microchipStatus) || 'Bilinmiyor',
    photoUri: getString(input.photoUri),
    city: getString(input.city),
    description: getString(input.description),
    distinctiveFeatures: getString(input.distinctiveFeatures),
    contactPreference,
    ownerName: getString(input.ownerName) || 'Pet sahibi',
    ownerUsername: normalizeUsername(getString(input.ownerUsername)) || 'petcare',
    ownerEmail: getString(input.ownerEmail),
    ownerPhone: getString(input.ownerPhone),
    createdAt: getString(input.createdAt) || new Date().toISOString(),
    status: input.status === 'resolved' ? 'resolved' : 'active',
  };
};

const normalizeMessage = (input: Record<string, unknown>): CommunityMessage => ({
  id: getString(input.id) || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  listingId: getString(input.listingId),
  conversationId: getString(input.conversationId),
  senderName: getString(input.senderName) || 'Pati dostu',
  senderUsername: normalizeUsername(getString(input.senderUsername)),
  senderContact: getString(input.senderContact),
  text: getString(input.text),
  imageUri: getString(input.imageUri),
  createdAt: getString(input.createdAt) || new Date().toISOString(),
  senderType: input.senderType === 'owner' ? 'owner' : 'visitor',
});

const normalizeCalendarEvent = (input: Record<string, unknown>): CalendarEvent => {
  const rawType = getString(input.type) as CalendarEventType;
  const type: CalendarEventType =
    rawType === 'vaccine' ||
    rawType === 'annual_vaccine' ||
    rawType === 'parasite' ||
    rawType === 'checkup' ||
    rawType === 'vet_visit'
      ? rawType
      : 'vet_visit';

  return {
    id: getString(input.id) || `calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    petId: getString(input.petId),
    type,
    title: getString(input.title) || calendarTypeLabel[type],
    date: getString(input.date) || getLocalDateKey(new Date()),
    notes: getString(input.notes),
    createdAt: getString(input.createdAt) || new Date().toISOString(),
  };
};

export default function Explore() {
  const router = useRouter();
  const [section, setSection] = useState<ExploreSection>('feed');
  const [query, setQuery] = useState('');
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [activePetId, setActivePetId] = useState('');
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(defaultOwnerProfile);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [listings, setListings] = useState<PetListing[]>([]);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLogsStore>({});
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [postText, setPostText] = useState('');
  const [postImageUri, setPostImageUri] = useState('');
  const [postVideoUri, setPostVideoUri] = useState('');
  const [showListingComposer, setShowListingComposer] = useState(false);
  const [listingDraft, setListingDraft] = useState<ListingDraft>(defaultListingDraft);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [blockedUsernames, setBlockedUsernames] = useState<string[]>([]);
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<NearbyStatus>('idle');
  const [followedNearby, setFollowedNearby] = useState<Record<string, boolean>>({});
  const [sentSocialRequests, setSentSocialRequests] = useState<Record<string, boolean>>({});
  const [selectedPostId, setSelectedPostId] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft>({
    ...defaultCalendarDraft,
    date: getLocalDateKey(new Date()),
  });

  const activePet = useMemo(
    () => pets.find((pet) => pet.id === activePetId) || pets[0] || null,
    [activePetId, pets]
  );

  const ownerReady =
    ownerProfile.fullName.trim() !== '' &&
    normalizeUsername(ownerProfile.username).length >= 3 &&
    (ownerProfile.email.trim() !== '' || ownerProfile.phone.trim() !== '');

  const loadExploreData = useCallback(async () => {
    try {
      const [profilesRaw, ownerRaw, postsRaw, commentsRaw, listingsRaw, messagesRaw, logsRaw, calendarRaw] = await Promise.all([
        AsyncStorage.getItem(PROFILES_KEY),
        AsyncStorage.getItem(OWNER_PROFILE_KEY),
        AsyncStorage.getItem(POSTS_KEY),
        AsyncStorage.getItem(POST_COMMENTS_KEY),
        AsyncStorage.getItem(LISTINGS_KEY),
        AsyncStorage.getItem(MESSAGES_KEY),
        AsyncStorage.getItem(DAILY_LOGS_KEY),
        AsyncStorage.getItem(CALENDAR_EVENTS_KEY),
      ]);

      if (profilesRaw) {
        const parsed = JSON.parse(profilesRaw) as ProfilesStore;
        const normalizedPets = Array.isArray(parsed.pets)
          ? parsed.pets.map((pet, index) => normalizePet(pet as unknown as Record<string, unknown>, index + 1))
          : [];
        setPets(normalizedPets);
        setActivePetId(parsed.activePetId || normalizedPets[0]?.id || '');
      }

      if (ownerRaw) {
        setOwnerProfile(normalizeOwner(JSON.parse(ownerRaw) as Record<string, unknown>));
      }

      const storedPosts = postsRaw ? (JSON.parse(postsRaw) as unknown[]) : [];
      setPosts(
        Array.isArray(storedPosts)
          ? storedPosts
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              .map(normalizePost)
          : []
      );

      const storedComments = commentsRaw ? (JSON.parse(commentsRaw) as unknown[]) : [];
      setComments(
        Array.isArray(storedComments)
          ? storedComments
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              .map(normalizeComment)
          : []
      );

      const storedListings = listingsRaw ? (JSON.parse(listingsRaw) as unknown[]) : [];
      setListings(
        Array.isArray(storedListings)
          ? storedListings
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              .map(normalizeListing)
          : []
      );

      const storedMessages = messagesRaw ? (JSON.parse(messagesRaw) as unknown[]) : [];
      setMessages(
        Array.isArray(storedMessages)
          ? storedMessages
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              .map(normalizeMessage)
          : []
      );

      setDailyLogs(logsRaw ? (JSON.parse(logsRaw) as DailyLogsStore) : {});

      const storedCalendarEvents = calendarRaw ? (JSON.parse(calendarRaw) as unknown[]) : [];
      setCalendarEvents(
        Array.isArray(storedCalendarEvents)
          ? storedCalendarEvents
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              .map(normalizeCalendarEvent)
          : []
      );
    } catch (error) {
      console.log('Keşfet verileri okunamadı:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadExploreData();
    }, [loadExploreData])
  );

  const allPosts = useMemo(() => {
    const storedIds = new Set(posts.map((post) => post.id));
    return [...posts, ...seedPosts.filter((post) => !storedIds.has(post.id))].filter(
      (post) => !blockedUsernames.includes(post.ownerUsername)
    );
  }, [blockedUsernames, posts]);
  const allComments = useMemo(() => {
    const storedIds = new Set(comments.map((comment) => comment.id));
    return [...comments, ...seedComments.filter((comment) => !storedIds.has(comment.id))];
  }, [comments]);
  const allMessages = useMemo(() => [...messages, ...seedMessages], [messages]);

  const lowerQuery = query.trim().toLocaleLowerCase('tr-TR');
  const filteredPosts = useMemo(() => {
    if (!lowerQuery) return allPosts;
    return allPosts.filter((post) =>
      [post.petName, post.ownerName, post.ownerUsername, post.text]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(lowerQuery)
    );
  }, [allPosts, lowerQuery]);

  const filteredListings = useMemo(() => {
    if (!lowerQuery) return listings;
    return listings.filter((listing) =>
      [
        listing.petName,
        listing.ownerName,
        listing.ownerUsername,
        listing.city,
        listing.species,
        listing.description,
        listing.distinctiveFeatures,
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(lowerQuery)
    );
  }, [listings, lowerQuery]);

  const conversations = useMemo(() => {
    const grouped = new Map<string, CommunityMessage[]>();
    allMessages.forEach((message) => {
      const key = message.conversationId || `${message.listingId}-${message.senderContact || message.senderName}`;
      grouped.set(key, [...(grouped.get(key) || []), message]);
    });

    return Array.from(grouped.entries())
      .map(([id, items]) => {
        const sorted = [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return {
          id,
          messages: sorted,
          lastMessage: sorted[sorted.length - 1],
        };
      })
      .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  }, [allMessages]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) || null;
  const selectedPost = allPosts.find((post) => post.id === selectedPostId) || null;
  const selectedPostComments = allComments.filter((comment) => comment.postId === selectedPostId);
  const nearbyProfiles = useMemo(() => {
    const normalizedQuery = lowerQuery.replace(/^@+/, '');
    return nearbySeedPets.filter((profile) => {
      if (blockedUsernames.includes(profile.username)) return false;
      if (!normalizedQuery) return true;
      return [profile.petName, profile.ownerName, profile.username, profile.species, profile.neighborhood]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(normalizedQuery);
    });
  }, [blockedUsernames, lowerQuery]);

  const suggestedUsers = useMemo(() => {
    const map = new Map<string, { name: string; username: string; subtitle: string; photoUri: string }>();
    allPosts.forEach((post) => {
      map.set(post.ownerUsername, {
        name: post.ownerName,
        username: post.ownerUsername,
        subtitle: `${post.petName} ile paylaşıyor`,
        photoUri: post.petPhotoUri,
      });
    });
    listings.forEach((listing) => {
      map.set(listing.ownerUsername, {
        name: listing.ownerName,
        username: listing.ownerUsername,
        subtitle: `${listingTypeLabel[listing.type]} ilanı`,
        photoUri: listing.photoUri,
      });
    });
    return Array.from(map.values()).slice(0, 6);
  }, [allPosts, listings]);

  const weekCare = useMemo(() => {
    if (!activePet) return [];
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = getLocalDateKey(date);
      const log = dailyLogs[activePet.id]?.[key];
      const completed = log ? [log.water, log.food, log.play, log.toilet].filter(Boolean).length : 0;
      return {
        key,
        label: new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(date),
        completed,
        mood: log?.mood || 0,
      };
    });
  }, [activePet, dailyLogs]);

  const petAgeMonths = getPetAgeMonths(activePet);
  const petCalendarEvents = useMemo(() => {
    if (!activePet) return [];
    return calendarEvents
      .filter((event) => event.petId === activePet.id)
      .sort((a, b) => (parseDateKey(a.date)?.getTime() || 0) - (parseDateKey(b.date)?.getTime() || 0));
  }, [activePet, calendarEvents]);

  const upcomingCalendarEvents = useMemo(() => {
    const todayKey = getLocalDateKey(new Date());
    return petCalendarEvents.filter((event) => event.date >= todayKey).slice(0, 6);
  }, [petCalendarEvents]);

  const lastAnnualVaccine = useMemo(() => {
    return [...petCalendarEvents]
      .filter((event) => event.type === 'annual_vaccine')
      .sort((a, b) => (parseDateKey(b.date)?.getTime() || 0) - (parseDateKey(a.date)?.getTime() || 0))[0];
  }, [petCalendarEvents]);

  const lastParasiteCare = useMemo(() => {
    return [...petCalendarEvents]
      .filter((event) => event.type === 'parasite')
      .sort((a, b) => (parseDateKey(b.date)?.getTime() || 0) - (parseDateKey(a.date)?.getTime() || 0))[0];
  }, [petCalendarEvents]);

  const annualNextDate = lastAnnualVaccine ? addYearsToDateKey(lastAnnualVaccine.date, 1) : '';
  const parasiteNextDate = lastParasiteCare ? addDaysToDateKey(lastParasiteCare.date, 60) : '';
  const puppyWeeklyDate = addDaysToDateKey(getLocalDateKey(new Date()), 7);

  const chooseImage = async (onSelected: (uri: string) => void, aspect: [number, number] = [4, 3]) => {
    const pickFromGallery = async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('İzin gerekli', 'Fotoğraf seçmek için galeri izni vermelisin.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect,
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) onSelected(result.assets[0].uri);
    };

    const pickFromCamera = async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('İzin gerekli', 'Fotoğraf çekmek için kamera izni vermelisin.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect,
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) onSelected(result.assets[0].uri);
    };

    if (Platform.OS === 'web') {
      await pickFromGallery();
      return;
    }

    Alert.alert('Fotoğraf ekle', 'Nasıl fotoğraf eklemek istersin?', [
      { text: 'Galeri', onPress: () => void pickFromGallery() },
      { text: 'Kamera', onPress: () => void pickFromCamera() },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  const setPostImage = (uri: string) => {
    setPostImageUri(uri);
    setPostVideoUri('');
  };

  const capturePostPhoto = async () => {
    try {
      if (Platform.OS === 'web') {
        await chooseImage(setPostImage, [1, 1]);
        return;
      }

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('İzin gerekli', 'Anlık fotoğraf çekmek için kamera izni vermelisin.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setPostImage(result.assets[0].uri);
      }
    } catch (error) {
      console.log('Gönderi kamerası açılamadı:', error);
    }
  };

  const pickPostVideo = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('İzin gerekli', 'Video seçmek için galeri izni vermelisin.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 0.75,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setPostVideoUri(result.assets[0].uri);
        setPostImageUri('');
      }
    } catch (error) {
      console.log('Gönderi videosu seçilemedi:', error);
    }
  };

  const savePosts = async (nextPosts: SocialPost[]) => {
    setPosts(nextPosts);
    await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(nextPosts));
  };

  const saveComments = async (nextComments: PostComment[]) => {
    setComments(nextComments);
    await AsyncStorage.setItem(POST_COMMENTS_KEY, JSON.stringify(nextComments));
  };

  const saveListings = async (nextListings: PetListing[]) => {
    setListings(nextListings);
    await AsyncStorage.setItem(LISTINGS_KEY, JSON.stringify(nextListings));
  };

  const saveMessages = async (nextMessages: CommunityMessage[]) => {
    setMessages(nextMessages);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(nextMessages));
  };

  const saveCalendarEvents = async (nextEvents: CalendarEvent[]) => {
    setCalendarEvents(nextEvents);
    await AsyncStorage.setItem(CALENDAR_EVENTS_KEY, JSON.stringify(nextEvents));
  };

  const createCalendarEvent = async (override?: Partial<CalendarDraft>) => {
    if (!activePet) {
      Alert.alert('Pet gerekli', 'Takvim kaydı için önce profil sekmesinden bir pet oluştur.');
      return;
    }

    const draft = { ...calendarDraft, ...override };
    if (!parseDateKey(draft.date)) {
      Alert.alert('Tarih hatalı', 'Tarihi 2026-06-28 formatında yazmalısın.');
      return;
    }

    const nextEvent: CalendarEvent = {
      id: `calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      petId: activePet.id,
      type: draft.type,
      title: draft.title.trim() || calendarTypeLabel[draft.type],
      date: draft.date,
      notes: draft.notes.trim(),
      createdAt: new Date().toISOString(),
    };

    await saveCalendarEvents([nextEvent, ...calendarEvents]);
    setCalendarDraft({ ...defaultCalendarDraft, date: getLocalDateKey(new Date()) });
  };

  const createPuppyWeeklyPlan = async () => {
    if (!activePet) {
      Alert.alert('Pet gerekli', 'Önce bir pet profili oluştur.');
      return;
    }
    const startDate = parseDateKey(calendarDraft.date) ? calendarDraft.date : getLocalDateKey(new Date());
    const weeklyEvents: CalendarEvent[] = Array.from({ length: 4 }, (_, index) => ({
      id: `puppy-vaccine-${Date.now()}-${index}`,
      petId: activePet.id,
      type: 'vaccine',
      title: `Yavru aşı kontrolü ${index + 1}`,
      date: addDaysToDateKey(startDate, index * 7),
      notes: 'Yavru petler için veterinerin belirlediği aşı programına göre haftalık kontrol hatırlatması.',
      createdAt: new Date().toISOString(),
    }));
    await saveCalendarEvents([...weeklyEvents, ...calendarEvents]);
  };

  const deleteCalendarEvent = (eventId: string) => {
    Alert.alert('Takvim kaydı silinsin mi?', 'Bu kayıt sadece bu petin takviminden kaldırılır.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void saveCalendarEvents(calendarEvents.filter((event) => event.id !== eventId));
        },
      },
    ]);
  };

  const createPost = async () => {
    if (!activePet) {
      Alert.alert('Pet gerekli', 'Paylaşım için önce profil sekmesinden bir pet oluştur.');
      return;
    }
    if (!postText.trim() && !postImageUri && !postVideoUri) {
      Alert.alert('Boş paylaşım', 'Bir metin yaz, fotoğraf çek/seç veya video ekle.');
      return;
    }

    const nextPost: SocialPost = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      petId: activePet.id,
      petName: activePet.name,
      petPhotoUri: activePet.photoUri,
      ownerName: ownerProfile.fullName.trim() || 'Pet sahibi',
      ownerUsername: normalizeUsername(ownerProfile.username) || 'petcare',
      ownerEmail: ownerProfile.email,
      text: postText.trim(),
      imageUri: postImageUri,
      videoUri: postVideoUri,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    };

    await savePosts([nextPost, ...posts]);
    setPostText('');
    setPostImageUri('');
    setPostVideoUri('');
  };

  const togglePostLike = async (post: SocialPost) => {
    const exists = posts.some((item) => item.id === post.id);
    const update = (item: SocialPost) => {
      if (item.id !== post.id) return item;
      const likedByMe = !item.likedByMe;
      return {
        ...item,
        likedByMe,
        likeCount: Math.max(0, item.likeCount + (likedByMe ? 1 : -1)),
      };
    };
    const next = exists ? posts.map(update) : [update(post), ...posts];
    await savePosts(next);
  };

  const openPostMenu = (post: SocialPost) => {
    Alert.alert(post.petName, 'Gönderi için işlem seç.', [
      {
        text: reportedPostIds.includes(post.id) ? 'Şikayet edildi' : 'Gönderiyi şikayet et',
        onPress: () => {
          if (reportedPostIds.includes(post.id)) return;
          setReportedPostIds((current) => [...current, post.id]);
          Alert.alert('Şikayet alındı', 'Bu gönderi inceleme listesine eklendi.');
        },
      },
      {
        text: `@${post.ownerUsername} kullanıcısını engelle`,
        style: 'destructive',
        onPress: () => {
          setBlockedUsernames((current) => Array.from(new Set([...current, post.ownerUsername])));
        },
      },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  const sharePost = async (post: SocialPost) => {
    await Share.share({
      message: `${post.petName} paylaştı:\n${post.text}`,
    });
  };

  const openComments = (postId: string) => {
    setSelectedPostId(postId);
    setCommentInput('');
  };

  const addComment = async () => {
    if (!selectedPostId || !commentInput.trim()) return;
    const ownerName = ownerProfile.fullName.trim() || 'Sen';
    const ownerUsername = normalizeUsername(ownerProfile.username) || 'ben';
    const nextComment: PostComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      postId: selectedPostId,
      authorName: ownerName,
      authorUsername: ownerUsername,
      text: commentInput.trim(),
      createdAt: new Date().toISOString(),
      likeCount: 0,
      likedByMe: false,
    };
    await saveComments([nextComment, ...comments]);
    setCommentInput('');

    const targetPost = allPosts.find((post) => post.id === selectedPostId);
    if (targetPost) {
      const exists = posts.some((post) => post.id === targetPost.id);
      const updatedPost = { ...targetPost, commentCount: targetPost.commentCount + 1 };
      await savePosts(exists ? posts.map((post) => (post.id === targetPost.id ? updatedPost : post)) : [updatedPost, ...posts]);
    }
  };

  const toggleCommentLike = async (comment: PostComment) => {
    const exists = comments.some((item) => item.id === comment.id);
    const update = (item: PostComment) => {
      if (item.id !== comment.id) return item;
      const likedByMe = !item.likedByMe;
      return {
        ...item,
        likedByMe,
        likeCount: Math.max(0, item.likeCount + (likedByMe ? 1 : -1)),
      };
    };
    await saveComments(exists ? comments.map(update) : [update(comment), ...comments]);
  };

  const requestNearbyPermission = () => {
    if (nearbyStatus === 'requesting') return;

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      setNearbyStatus('requesting');
      navigator.geolocation.getCurrentPosition(
        () => {
          setNearbyStatus('granted');
        },
        () => {
          setNearbyStatus('denied');
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 1000 * 60 * 10 }
      );
      return;
    }

    setNearbyStatus('unsupported');
    Alert.alert(
      'Konum modülü gerekli',
      'Expo Go telefon sürümünde gerçek yakınlık için expo-location modülünü eklememiz gerekiyor. Şimdilik sosyal keşif alanının taslağını gösteriyorum.'
    );
  };

  const showNearbyPreview = () => {
    setNearbyStatus('preview');
  };

  const toggleNearbyFollow = (profile: NearbyPetProfile) => {
    setFollowedNearby((current) => ({ ...current, [profile.id]: !current[profile.id] }));
  };

  const sendSocialRequest = (profile: NearbyPetProfile) => {
    setSentSocialRequests((current) => ({ ...current, [profile.id]: true }));
    Alert.alert('İstek gönderildi', `${profile.petName} ve ${profile.ownerName} için sosyalleşme isteği gönderildi.`);
  };

  const blockNearbyProfile = (profile: NearbyPetProfile) => {
    Alert.alert('Kullanıcı engellensin mi?', `@${profile.username} artık yakın dostlar listende görünmez.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: () => {
          setBlockedUsernames((current) => Array.from(new Set([...current, profile.username])));
        },
      },
    ]);
  };

  const createListing = async () => {
    if (!ownerReady) {
      Alert.alert('İnsan profili gerekli', 'İlan açmak için Profil sekmesinden ad, kullanıcı adı ve iletişim bilgisini tamamla.');
      return;
    }
    if (!listingDraft.petName.trim() || !listingDraft.city.trim() || !listingDraft.description.trim()) {
      Alert.alert('Eksik bilgi', 'Pet adı, şehir ve açıklama alanlarını doldur.');
      return;
    }

    const petMatch = pets.find((pet) => pet.name.toLocaleLowerCase('tr-TR') === listingDraft.petName.toLocaleLowerCase('tr-TR'));
    const nextListing: PetListing = {
      id: `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: listingDraft.type,
      petId: petMatch?.id || activePet?.id || '',
      petName: listingDraft.petName.trim(),
      species: listingDraft.species,
      age: listingDraft.age.trim(),
      ageUnit: listingDraft.ageUnit,
      microchipStatus: petMatch?.microchipStatus || 'Bilinmiyor',
      photoUri: listingDraft.photoUri || petMatch?.photoUri || '',
      city: listingDraft.city.trim(),
      description: listingDraft.description.trim(),
      distinctiveFeatures: listingDraft.distinctiveFeatures.trim(),
      contactPreference: listingDraft.contactPreference,
      ownerName: ownerProfile.fullName.trim(),
      ownerUsername: normalizeUsername(ownerProfile.username),
      ownerEmail: ownerProfile.email.trim(),
      ownerPhone: ownerProfile.phone.trim(),
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    await saveListings([nextListing, ...listings]);
    setListingDraft(defaultListingDraft);
    setShowListingComposer(false);
    setSection('listings');
  };

  const sendMessage = async () => {
    if (!selectedConversation || !messageInput.trim()) return;
    const lastMessage = selectedConversation.lastMessage;
    const nextMessage: CommunityMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      listingId: lastMessage.listingId,
      conversationId: selectedConversation.id,
      senderName: ownerProfile.fullName.trim() || 'Ben',
      senderUsername: normalizeUsername(ownerProfile.username),
      senderContact: ownerProfile.email || ownerProfile.phone,
      text: messageInput.trim(),
      createdAt: new Date().toISOString(),
      senderType: 'owner',
    };
    await saveMessages([...messages, nextMessage]);
    setMessageInput('');
  };

  const shareListing = async (listing: PetListing) => {
    await Share.share({
      message: `${listing.petName} için ${listingTypeLabel[listing.type]} ilanı\nŞehir: ${listing.city}\n${listing.description}`,
    });
  };

  const openPhoneAction = async (listing: PetListing) => {
    const phone = listing.ownerPhone.replace(/[^0-9+]/g, '');
    if (!phone) {
      Alert.alert('Telefon yok', 'Bu ilan sahibi telefon bilgisini paylaşmamış.');
      return;
    }
    Alert.alert('İletişim', `${listing.ownerName} ile nasıl iletişim kurmak istersin?`, [
      { text: 'Ara', onPress: () => void Linking.openURL(`tel:${phone}`) },
      { text: 'WhatsApp', onPress: () => void Linking.openURL(`https://wa.me/${phone.replace(/^\+/, '')}`) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  const renderFeed = () => (
    <>
      <View style={styles.composerCard}>
        <View style={styles.composerHeader}>
          <Avatar uri={activePet?.photoUri || ownerProfile.email} label={activePet?.name || 'P'} size={42} />
          <View style={styles.composerTitleWrap}>
            <Text style={styles.composerTitle}>{activePet?.name || 'Petin'} adına paylaş</Text>
            <Text style={styles.composerSubtitle}>Fotoğraf, kısa not veya günlük an</Text>
          </View>
        </View>
        <TextInput
          style={styles.postInput}
          value={postText}
          onChangeText={setPostText}
          placeholder="Bugün ne paylaşmak istersin?"
          placeholderTextColor="#64748B"
          multiline
        />
        {postImageUri ? <Image source={{ uri: postImageUri }} style={styles.composerPreviewImage} /> : null}
        {postVideoUri ? (
          <View style={styles.composerVideoPreview}>
            <Video source={{ uri: postVideoUri }} style={styles.composerVideo} resizeMode={ResizeMode.COVER} useNativeControls />
            <Pressable style={styles.mediaRemoveButton} onPress={() => setPostVideoUri('')}>
              <MaterialIcons name="close" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composerActions}>
          <Pressable style={styles.lightActionButton} onPress={() => void capturePostPhoto()}>
            <MaterialIcons name="photo-camera" size={16} color="#F97316" />
            <Text style={styles.lightActionText}>Kamera</Text>
          </Pressable>
          <Pressable style={styles.lightActionButton} onPress={() => void chooseImage(setPostImage, [1, 1])}>
            <MaterialIcons name="photo-camera" size={16} color="#F97316" />
            <Text style={styles.lightActionText}>Fotoğraf</Text>
          </Pressable>
          <Pressable style={styles.lightActionButton} onPress={() => void pickPostVideo()}>
            <MaterialIcons name="videocam" size={16} color="#BE123C" />
            <Text style={styles.lightActionText}>Video</Text>
          </Pressable>
          <Pressable style={styles.primaryButtonSmall} onPress={() => void createPost()}>
            <MaterialIcons name="send" size={15} color="#FFFFFF" />
            <Text style={styles.primaryButtonSmallText}>Paylaş</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.userStrip}>
        {suggestedUsers.map((user) => (
          <View key={user.username} style={styles.userCard}>
            <Avatar uri={user.photoUri} label={user.name} size={48} />
            <Text style={styles.userCardName} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={styles.userCardUsername} numberOfLines={1}>
              @{user.username}
            </Text>
          </View>
        ))}
      </ScrollView>

      {filteredPosts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          comments={allComments.filter((comment) => comment.postId === post.id)}
          reported={reportedPostIds.includes(post.id)}
          onLike={() => void togglePostLike(post)}
          onComment={() => openComments(post.id)}
          onShare={() => void sharePost(post)}
          onMenu={() => openPostMenu(post)}
        />
      ))}
    </>
  );

  const renderNearby = () => (
    <View style={styles.nearbyStack}>
      <View style={styles.nearbyHeroCard}>
        <View style={styles.nearbyHeroIcon}>
          <MaterialIcons name="map" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.nearbyHeroText}>
          <Text style={styles.sectionTitle}>Arkadaş Bul</Text>
          <Text style={styles.sectionSubtitle}>
            Konum izni verince yakın çevrendeki pati dostlarını gör, takip et ve sosyalleşme isteği gönder.
          </Text>
        </View>
      </View>

      {nearbyStatus !== 'granted' && nearbyStatus !== 'preview' ? (
        <View style={styles.permissionCard}>
          <MaterialIcons name="my-location" size={24} color="#F97316" />
          <Text style={styles.permissionTitle}>Yakındaki dostları görmek ister misin?</Text>
          <Text style={styles.permissionText}>
            Bilgisayarda konum açık olsa bile tarayıcı bu uygulama için ayrıca izin ister. İstersen gerçek konumla dene,
            istersen şimdilik örnek yakın dostları gösterelim.
          </Text>
          <View style={styles.permissionActionRow}>
            <Pressable style={styles.primaryButtonSmall} onPress={requestNearbyPermission}>
              <MaterialIcons name="location-on" size={16} color="#FFFFFF" />
              <Text style={styles.primaryButtonSmallText}>
                {nearbyStatus === 'requesting' ? 'İzin bekleniyor' : 'Konumla göster'}
              </Text>
            </Pressable>
            <Pressable style={styles.previewButton} onPress={showNearbyPreview}>
              <MaterialIcons name="visibility" size={16} color="#EA580C" />
              <Text style={styles.previewButtonText}>Örnekleri göster</Text>
            </Pressable>
          </View>
          {nearbyStatus === 'denied' ? (
            <Text style={styles.permissionWarning}>Konum izni verilmedi. Tarayıcı/telefon ayarlarından tekrar açabilirsin.</Text>
          ) : null}
          {nearbyStatus === 'unsupported' ? (
            <Text style={styles.permissionWarning}>Bu ortam gerçek konumu desteklemiyor. Telefon için konum modülünü ekleyebiliriz.</Text>
          ) : null}
        </View>
      ) : (
        <>
          {nearbyStatus === 'preview' ? (
            <View style={styles.previewNotice}>
              <MaterialIcons name="info-outline" size={17} color="#0F766E" />
              <Text style={styles.previewNoticeText}>
                Şu an örnek sosyal keşif görünümü açık. Gerçek yakınlık için konum izni ve canlı kullanıcı verisi gerekir.
              </Text>
            </View>
          ) : null}
          <View style={styles.mapMockCard}>
            <View style={styles.mapCircleLarge} />
            <View style={[styles.mapPin, styles.mapPinOne]}>
              <MaterialIcons name="pets" size={15} color="#FFFFFF" />
            </View>
            <View style={[styles.mapPin, styles.mapPinTwo]}>
              <MaterialIcons name="pets" size={15} color="#FFFFFF" />
            </View>
            <View style={[styles.mapPin, styles.mapPinThree]}>
              <MaterialIcons name="pets" size={15} color="#FFFFFF" />
            </View>
            <View style={styles.myLocationPin}>
              <MaterialIcons name="person-pin-circle" size={26} color="#0F766E" />
            </View>
          </View>

          {nearbyProfiles.map((profile) => (
            <View key={profile.id} style={styles.nearbyCard}>
              <Avatar uri={profile.photoUri} label={profile.petName} size={58} />
              <View style={styles.nearbyBody}>
                <View style={styles.nearbyNameRow}>
                  <Text style={styles.nearbyName}>{profile.petName}</Text>
                  <View style={[styles.presenceBadge, profile.online ? styles.presenceBadgeOnline : styles.presenceBadgeAway]}>
                    <Text style={styles.presenceBadgeText}>{profile.online ? 'çevrim içi' : 'sonra bakar'}</Text>
                  </View>
                </View>
                <Text style={styles.nearbyMeta}>
                  @{profile.username} • {profile.species} • {profile.distance}
                </Text>
                <Text style={styles.nearbyStatusText}>{profile.neighborhood} · {profile.status}</Text>
                <View style={styles.nearbyActions}>
                  <Pressable style={styles.nearbyActionButton} onPress={() => toggleNearbyFollow(profile)}>
                    <MaterialIcons
                      name={followedNearby[profile.id] ? 'check-circle' : 'person-add'}
                      size={15}
                      color={followedNearby[profile.id] ? '#0F766E' : '#F97316'}
                    />
                    <Text style={styles.nearbyActionText}>{followedNearby[profile.id] ? 'Takipte' : 'Takip et'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.nearbyActionButton}
                    onPress={() => (sentSocialRequests[profile.id] ? undefined : sendSocialRequest(profile))}
                  >
                    <MaterialIcons name={sentSocialRequests[profile.id] ? 'done' : 'waving-hand'} size={15} color="#F97316" />
                    <Text style={styles.nearbyActionText}>
                      {sentSocialRequests[profile.id] ? 'İstek gitti' : 'Sosyalleş'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.nearbyIconButton} onPress={() => blockNearbyProfile(profile)}>
                    <MaterialIcons name="block" size={16} color="#BE123C" />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );

  const renderListings = () => (
    <>
      <View style={styles.listingToolbar}>
        <View>
          <Text style={styles.sectionTitle}>Pati İlanları</Text>
          <Text style={styles.sectionSubtitle}>Yuva, kayıp ve eş arama tek yerde.</Text>
        </View>
        <Pressable style={styles.fabButton} onPress={() => setShowListingComposer((current) => !current)}>
          <MaterialIcons name={showListingComposer ? 'close' : 'add'} size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {showListingComposer ? (
        <View style={styles.composerCard}>
          <Text style={styles.composerTitle}>İlan oluştur</Text>
          <SegmentedRow
            options={[
              { label: 'Yuva', value: 'adoption' },
              { label: 'Eş', value: 'mate' },
              { label: 'Kayıp', value: 'lost' },
            ]}
            value={listingDraft.type}
            onChange={(value) => setListingDraft((current) => ({ ...current, type: value as ListingType }))}
          />
          <View style={styles.formGrid}>
            <TextInput
              style={styles.formInputHalf}
              value={listingDraft.petName}
              onChangeText={(value) => setListingDraft((current) => ({ ...current, petName: value }))}
              placeholder="Pet adı"
              placeholderTextColor="#64748B"
            />
            <TextInput
              style={styles.formInputHalf}
              value={listingDraft.city}
              onChangeText={(value) => setListingDraft((current) => ({ ...current, city: value }))}
              placeholder="Şehir"
              placeholderTextColor="#64748B"
            />
          </View>
          <SegmentedRow
            options={speciesOptions.map((item) => ({ label: item, value: item }))}
            value={listingDraft.species}
            onChange={(value) => setListingDraft((current) => ({ ...current, species: value }))}
            compact
          />
          <View style={styles.formGrid}>
            <TextInput
              style={styles.formInputHalf}
              value={listingDraft.age}
              onChangeText={(value) => setListingDraft((current) => ({ ...current, age: value.replace(/[^0-9]/g, '') }))}
              placeholder="Yaş"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
            />
            <SegmentedRow
              options={[
                { label: 'Ay', value: 'Ay' },
                { label: 'Yaş', value: 'Yaş' },
              ]}
              value={listingDraft.ageUnit}
              onChange={(value) => setListingDraft((current) => ({ ...current, ageUnit: value }))}
              compact
              style={styles.halfSegment}
            />
          </View>
          <TextInput
            style={styles.longInput}
            value={listingDraft.description}
            onChangeText={(value) => setListingDraft((current) => ({ ...current, description: value }))}
            placeholder="Açıklama"
            placeholderTextColor="#64748B"
            multiline
          />
          <TextInput
            style={styles.longInput}
            value={listingDraft.distinctiveFeatures}
            onChangeText={(value) => setListingDraft((current) => ({ ...current, distinctiveFeatures: value }))}
            placeholder="Ayırt edici özellikler"
            placeholderTextColor="#64748B"
            multiline
          />
          <SegmentedRow
            options={[
              { label: 'Mesaj', value: 'message' },
              { label: 'Telefon', value: 'phone' },
              { label: 'İkisi', value: 'both' },
            ]}
            value={listingDraft.contactPreference}
            onChange={(value) => setListingDraft((current) => ({ ...current, contactPreference: value as ContactPreference }))}
            compact
          />
          {listingDraft.photoUri ? <Image source={{ uri: listingDraft.photoUri }} style={styles.composerPreviewImage} /> : null}
          <View style={styles.composerActions}>
            <Pressable
              style={styles.lightActionButton}
              onPress={() => void chooseImage((uri) => setListingDraft((current) => ({ ...current, photoUri: uri })), [1, 1])}
            >
              <MaterialIcons name="photo-camera" size={16} color="#F97316" />
              <Text style={styles.lightActionText}>Fotoğraf</Text>
            </Pressable>
            <Pressable style={styles.primaryButtonSmall} onPress={() => void createListing()}>
              <MaterialIcons name="done" size={15} color="#FFFFFF" />
              <Text style={styles.primaryButtonSmallText}>Yayınla</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {filteredListings.length === 0 ? (
        <EmptyState
          icon="pets"
          title="Henüz ilan yok"
          text="İlk ilanı sen oluşturabilirsin. İnsan profili tamamlanınca ilan vermek açılır."
        />
      ) : (
        filteredListings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            onShare={() => void shareListing(listing)}
            onPhone={() => void openPhoneAction(listing)}
            onMessage={() => {
              router.push('/messages');
            }}
          />
        ))
      )}
    </>
  );

  const renderCalendar = () => (
    <View style={styles.calendarStack}>
      <View style={styles.calendarCard}>
        <View style={styles.listingToolbar}>
          <View>
            <Text style={styles.sectionTitle}>Pet Takvimi</Text>
            <Text style={styles.sectionSubtitle}>
              {activePet?.name || 'Petin'} için veteriner, aşı ve parazit kayıtları.
            </Text>
          </View>
        </View>
        <View style={styles.weekRow}>
          {weekCare.map((day) => (
            <View key={day.key} style={styles.dayPill}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              <Text style={styles.dayScore}>{day.completed}/4</Text>
              <View style={[styles.dayMoodDot, day.mood >= 4 ? styles.dayMoodGood : day.mood ? styles.dayMoodLow : null]} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.calendarCard}>
        <Text style={styles.calendarFormTitle}>Takvime kayıt ekle</Text>
        <SegmentedRow
          options={[
            { label: 'Veteriner', value: 'vet_visit' },
            { label: 'Aşı', value: 'vaccine' },
            { label: 'Yıllık', value: 'annual_vaccine' },
            { label: 'Parazit', value: 'parasite' },
            { label: 'Kontrol', value: 'checkup' },
          ]}
          value={calendarDraft.type}
          onChange={(value) =>
            setCalendarDraft((current) => ({
              ...current,
              type: value as CalendarEventType,
              title: current.title || calendarTypeLabel[value as CalendarEventType],
            }))
          }
          compact
        />
        <View style={styles.formGrid}>
          <TextInput
            style={styles.formInputHalf}
            value={calendarDraft.date}
            onChangeText={(value) => setCalendarDraft((current) => ({ ...current, date: value }))}
            placeholder="2026-06-28"
            placeholderTextColor="#9A6B4F"
          />
          <TextInput
            style={styles.formInputHalf}
            value={calendarDraft.title}
            onChangeText={(value) => setCalendarDraft((current) => ({ ...current, title: value }))}
            placeholder={calendarTypeLabel[calendarDraft.type]}
            placeholderTextColor="#9A6B4F"
          />
        </View>
        <TextInput
          style={styles.longInput}
          value={calendarDraft.notes}
          onChangeText={(value) => setCalendarDraft((current) => ({ ...current, notes: value }))}
          placeholder="Veterinerde yapılan işlem, aşı adı, doz notu veya kontrol sebebi"
          placeholderTextColor="#9A6B4F"
          multiline
        />
        <View style={styles.composerActions}>
          <Pressable style={styles.lightActionButton} onPress={() => void createPuppyWeeklyPlan()}>
            <MaterialIcons name="event-repeat" size={16} color="#F97316" />
            <Text style={styles.lightActionText}>4 haftalık yavru planı</Text>
          </Pressable>
          <Pressable style={styles.primaryButtonSmall} onPress={() => void createCalendarEvent()}>
            <MaterialIcons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.primaryButtonSmallText}>Kaydet</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.calendarCard}>
        <Text style={styles.calendarFormTitle}>Yaklaşan kayıtlar</Text>
        {upcomingCalendarEvents.length === 0 ? (
          <Text style={styles.calendarEmptyText}>Henüz yaklaşan kayıt yok. İlk veteriner veya aşı kaydını ekleyebilirsin.</Text>
        ) : (
          upcomingCalendarEvents.map((event) => (
            <View key={event.id} style={styles.calendarEventCard}>
              <View style={styles.calendarEventIcon}>
                <MaterialIcons name={calendarTypeIcon[event.type]} size={18} color="#F97316" />
              </View>
              <View style={styles.calendarEventBody}>
                <Text style={styles.calendarEventTitle}>{event.title}</Text>
                <Text style={styles.calendarEventMeta}>
                  {formatCalendarDate(event.date)} • {calendarTypeLabel[event.type]}
                </Text>
                {event.notes ? <Text style={styles.calendarEventNotes}>{event.notes}</Text> : null}
              </View>
              <View style={styles.calendarEventActions}>
                <Text style={styles.calendarEventDay}>{getDaysUntil(event.date)} gün</Text>
                <Pressable style={styles.calendarEventDelete} onPress={() => deleteCalendarEvent(event.id)}>
                  <MaterialIcons name="delete-outline" size={17} color="#BE123C" />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.calendarCard}>
        <Text style={styles.calendarFormTitle}>Akıllı hatırlatmalar</Text>
        <View style={styles.reminderCard}>
          <MaterialIcons name="vaccines" size={20} color="#F97316" />
          <Text style={styles.reminderText}>
            {petAgeMonths > 0 && petAgeMonths < 12
              ? `${activePet?.name || 'Petin'} yavru görünüyor. Veterinerin belirlediği programa göre haftalık aşı/kontrol takibi açabilirsin. Sıradaki önerilen tarih: ${formatCalendarDate(puppyWeeklyDate)}.`
              : 'Yavru petlerde aşı programı veteriner tarafından haftalık takip edilebilir. Yavru pet eklersen burası otomatik öneri verir.'}
          </Text>
        </View>
        <View style={styles.reminderCard}>
          <MaterialIcons name="event-repeat" size={20} color="#0F766E" />
          <Text style={styles.reminderText}>
            {lastAnnualVaccine
              ? `Son yıllık aşı: ${formatCalendarDate(lastAnnualVaccine.date)}. Bir sonraki yıllık hatırlatma: ${formatCalendarDate(annualNextDate)}.`
              : 'Yetişkin petler için son yıllık aşı tarihini girersen bir sonraki yıllık hatırlatma burada görünür.'}
          </Text>
        </View>
        <View style={styles.reminderCard}>
          <MaterialIcons name="bug-report" size={20} color="#BE123C" />
          <Text style={styles.reminderText}>
            {lastParasiteCare
              ? `Son iç-dış parazit kaydı: ${formatCalendarDate(lastParasiteCare.date)}. Varsayılan takip önerisi: ${formatCalendarDate(parasiteNextDate)}. Veterinerinin söylediği aralık önceliklidir.`
              : 'İç-dış parazit işlemini kaydedersen sonraki kontrol tarihi burada takip edilir.'}
          </Text>
        </View>
      </View>

      <View style={styles.calendarCard}>
        <Text style={styles.calendarFormTitle}>Mevsimsel uyarılar</Text>
        <View style={styles.seasonTip}>
          <Text style={styles.seasonTipTitle}>Pisi pisi otu / kılçık otu</Text>
          <Text style={styles.seasonTipText}>
            Yaz aylarında burun, kulak ve pati aralarına kaçabilir. Şiddetli hapşırma, baş sallama veya sürekli pati yalama varsa kontrol ettir.
          </Text>
        </View>
        <View style={styles.seasonTip}>
          <Text style={styles.seasonTipTitle}>Sıcak zemin ve sıcak çarpması</Text>
          <Text style={styles.seasonTipText}>
            Öğle saatlerinde asfalt patileri yakabilir. Gölge, su ve kısa yürüyüş planı özellikle yaz aylarında önemli.
          </Text>
        </View>
        <View style={styles.seasonTip}>
          <Text style={styles.seasonTipTitle}>Kene, pire ve dış parazit</Text>
          <Text style={styles.seasonTipText}>
            Park/orman dönüşü kulak arkası, boyun ve pati çevresini kontrol et. Parazit ürününü veteriner önerisine göre takvime işle.
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroEyebrow}>PetCare Sosyal</Text>
            <Text style={styles.heroTitle}>Pati dostlarının enerjik alanı</Text>
            <Text style={styles.heroSubtitle}>Paylaş, ara, ilan ver ve mesajlaş. Sade, sevimli, karmaşasız.</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={19} color="#F97316" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Kullanıcı veya pet ara"
            placeholderTextColor="#64748B"
            autoCapitalize="none"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')}>
              <MaterialIcons name="close" size={18} color="#64748B" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
          <SectionTab icon="dynamic-feed" label="Akış" active={section === 'feed'} onPress={() => setSection('feed')} />
          <SectionTab icon="map" label="Arkadaş Bul" active={section === 'nearby'} onPress={() => setSection('nearby')} />
          <SectionTab icon="campaign" label="İlanlar" active={section === 'listings'} onPress={() => setSection('listings')} />
          <SectionTab icon="calendar-month" label="Takvim" active={section === 'calendar'} onPress={() => setSection('calendar')} />
        </ScrollView>

        {section === 'feed' ? renderFeed() : null}
        {section === 'nearby' ? renderNearby() : null}
        {section === 'listings' ? renderListings() : null}
        {section === 'calendar' ? renderCalendar() : null}
      </ScrollView>

      <Modal visible={Boolean(selectedPost)} animationType="slide" transparent onRequestClose={() => setSelectedPostId('')}>
        <View style={styles.modalOverlay}>
          <View style={styles.commentsPanel}>
            <View style={styles.chatHeader}>
              <View>
                <Text style={styles.chatTitle}>Yorumlar</Text>
                <Text style={styles.chatSubtitle}>
                  {selectedPost ? `${selectedPost.petName} • @${selectedPost.ownerUsername}` : ''}
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setSelectedPostId('')}>
                <MaterialIcons name="close" size={20} color="#0F172A" />
              </Pressable>
            </View>
            <ScrollView style={styles.commentsScroll} contentContainerStyle={styles.commentsContent} keyboardShouldPersistTaps="handled">
              {selectedPostComments.map((comment) => (
                <View key={comment.id} style={styles.commentRow}>
                  <Avatar uri="" label={comment.authorName} size={34} />
                  <View style={styles.commentBubble}>
                    <Text style={styles.commentAuthor}>
                      {comment.authorName} <Text style={styles.commentUsername}>@{comment.authorUsername}</Text>
                    </Text>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    <Pressable style={styles.commentLikeButton} onPress={() => void toggleCommentLike(comment)}>
                      <MaterialIcons
                        name={comment.likedByMe ? 'favorite' : 'favorite-border'}
                        size={15}
                        color={comment.likedByMe ? '#EF4444' : '#9A3412'}
                      />
                      <Text style={styles.commentLikeText}>{comment.likeCount}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {selectedPostComments.length === 0 ? (
                <Text style={styles.noCommentText}>İlk yorumu sen yazabilirsin.</Text>
              ) : null}
            </ScrollView>
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                value={commentInput}
                onChangeText={setCommentInput}
                placeholder="Yorum yaz"
                placeholderTextColor="#9A6B4F"
              />
              <Pressable
                style={[styles.commentSendButton, !commentInput.trim() ? styles.commentSendButtonDisabled : null]}
                disabled={!commentInput.trim()}
                onPress={() => void addComment()}
              >
                <MaterialIcons name="send" size={17} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedConversation)} animationType="slide" transparent onRequestClose={() => setSelectedConversationId('')}>
        <View style={styles.modalOverlay}>
          <View style={styles.chatPanel}>
            <View style={styles.chatHeader}>
              <View>
                <Text style={styles.chatTitle}>{selectedConversation?.lastMessage.senderName}</Text>
                <Text style={styles.chatSubtitle}>
                  @{selectedConversation?.lastMessage.senderUsername || 'pati.dostu'}
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setSelectedConversationId('')}>
                <MaterialIcons name="close" size={20} color="#0F172A" />
              </Pressable>
            </View>
            <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
              {selectedConversation?.messages.map((message) => {
                const mine = message.senderType === 'owner';
                return (
                  <View key={message.id} style={[styles.chatRow, mine ? styles.chatRowMine : null]}>
                    <View style={[styles.chatBubble, mine ? styles.chatBubbleMine : null]}>
                      <Text style={[styles.chatBubbleText, mine ? styles.chatBubbleTextMine : null]}>{message.text}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={messageInput}
                onChangeText={setMessageInput}
                placeholder="Mesaj yaz"
                placeholderTextColor="#64748B"
              />
              <Pressable style={styles.chatSendButton} onPress={() => void sendMessage()}>
                <MaterialIcons name="send" size={17} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Avatar({ uri, label, size }: { uri?: string; label: string; size: number }) {
  const letter = label.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'P';
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarFallbackText}>{letter}</Text>
    </View>
  );
}

function SectionTab({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.sectionTab, active ? styles.sectionTabActive : null]} onPress={onPress}>
      <MaterialIcons name={icon} size={16} color={active ? '#FFFFFF' : '#EA580C'} />
      <Text style={[styles.sectionTabText, active ? styles.sectionTabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function SegmentedRow({
  options,
  value,
  onChange,
  compact = false,
  style,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  style?: object;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={[styles.segmentedRow, compact ? styles.segmentedRowCompact : null]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segmentedButton, active ? styles.segmentedButtonActive : null]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.segmentedButtonText, active ? styles.segmentedButtonTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function PostCard({
  post,
  comments,
  reported,
  onLike,
  onComment,
  onShare,
  onMenu,
}: {
  post: SocialPost;
  comments: PostComment[];
  reported: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onMenu: () => void;
}) {
  const previewComments = comments.slice(0, 2);
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <Avatar uri={post.petPhotoUri} label={post.petName} size={42} />
        <View style={styles.postHeaderText}>
          <Text style={styles.postPetName}>{post.petName}</Text>
          <Text style={styles.postMeta}>
            @{post.ownerUsername} • {formatDateLabel(post.createdAt)}
          </Text>
        </View>
        {reported ? (
          <View style={styles.reportedBadge}>
            <Text style={styles.reportedBadgeText}>Şikayet edildi</Text>
          </View>
        ) : null}
        <Pressable style={styles.postMenuButton} onPress={onMenu}>
          <MaterialIcons name="more-horiz" size={22} color="#7C2D12" />
        </Pressable>
      </View>
      {post.imageUri ? <Image source={{ uri: post.imageUri }} style={styles.postImage} /> : null}
      {post.videoUri ? (
        <Video source={{ uri: post.videoUri }} style={styles.postVideo} resizeMode={ResizeMode.COVER} useNativeControls />
      ) : null}
      {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}
      <View style={styles.postActions}>
        <Pressable style={styles.postAction} onPress={onLike}>
          <MaterialIcons name={post.likedByMe ? 'favorite' : 'favorite-border'} size={21} color={post.likedByMe ? '#EF4444' : '#7C2D12'} />
          <Text style={styles.postActionText}>{post.likeCount}</Text>
        </Pressable>
        <Pressable style={styles.postAction} onPress={onComment}>
          <MaterialIcons name="chat-bubble-outline" size={20} color="#7C2D12" />
          <Text style={styles.postActionText}>{post.commentCount}</Text>
        </Pressable>
        <Pressable style={styles.postAction} onPress={onShare}>
          <MaterialIcons name="ios-share" size={20} color="#7C2D12" />
        </Pressable>
      </View>
      {previewComments.length > 0 ? (
        <View style={styles.postCommentsPreview}>
          {previewComments.map((comment) => (
            <Text key={comment.id} style={styles.postCommentPreviewText} numberOfLines={2}>
              <Text style={styles.postCommentPreviewName}>@{comment.authorUsername} </Text>
              {comment.text}
            </Text>
          ))}
          {comments.length > 2 ? (
            <Pressable onPress={onComment}>
              <Text style={styles.viewAllCommentsText}>{comments.length} yorumun tümünü gör</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ListingCard({
  listing,
  onShare,
  onPhone,
  onMessage,
}: {
  listing: PetListing;
  onShare: () => void;
  onPhone: () => void;
  onMessage: () => void;
}) {
  return (
    <View style={styles.listingCard}>
      {listing.photoUri ? (
        <Image source={{ uri: listing.photoUri }} style={styles.listingImage} />
      ) : (
        <View style={styles.listingImageFallback}>
          <MaterialIcons name={listingTypeIcon[listing.type]} size={34} color="#F97316" />
        </View>
      )}
      <View style={styles.listingBody}>
        <View style={styles.listingTopRow}>
          <View style={styles.listingBadge}>
            <MaterialIcons name={listingTypeIcon[listing.type]} size={13} color="#F97316" />
            <Text style={styles.listingBadgeText}>{listingTypeLabel[listing.type]}</Text>
          </View>
          <Text style={styles.listingCity}>{listing.city}</Text>
        </View>
        <Text style={styles.listingTitle}>{listing.petName}</Text>
        <Text style={styles.listingMeta}>
          {listing.species} • {listing.age ? `${listing.age} ${listing.ageUnit}` : 'Yaş belirtilmedi'}
        </Text>
        <Text style={styles.listingDescription} numberOfLines={3}>
          {listing.description}
        </Text>
        {listing.distinctiveFeatures ? (
          <Text style={styles.listingFeature} numberOfLines={2}>
            Ayırt edici: {listing.distinctiveFeatures}
          </Text>
        ) : null}
        <View style={styles.listingActions}>
          {(listing.contactPreference === 'message' || listing.contactPreference === 'both') && (
            <Pressable style={styles.listingActionButton} onPress={onMessage}>
              <MaterialIcons name="chat" size={15} color="#F97316" />
              <Text style={styles.listingActionText}>Mesaj</Text>
            </Pressable>
          )}
          {(listing.contactPreference === 'phone' || listing.contactPreference === 'both') && (
            <Pressable style={styles.listingActionButton} onPress={onPhone}>
              <MaterialIcons name="phone" size={15} color="#F97316" />
              <Text style={styles.listingActionText}>Ara</Text>
            </Pressable>
          )}
          <Pressable style={styles.listingActionButton} onPress={onShare}>
            <MaterialIcons name="share" size={15} color="#F97316" />
            <Text style={styles.listingActionText}>Paylaş</Text>
          </Pressable>
        </View>
        <Text style={styles.contactModeText}>İletişim tercihi: {contactPreferenceLabel[listing.contactPreference]}</Text>
      </View>
    </View>
  );
}

function EmptyState({ icon, title, text }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <MaterialIcons name={icon} size={28} color="#F97316" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  container: {
    padding: 16,
    paddingBottom: 28,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFE7D6',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 12,
  },
  heroTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  heroEyebrow: {
    color: '#F97316',
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 6,
  },
  heroTitle: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  heroSubtitle: {
    marginTop: 6,
    color: '#475569',
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 13,
  },
  searchBar: {
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 9,
  },
  sectionTabs: {
    gap: 8,
    paddingBottom: 12,
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 5,
  },
  sectionTabActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  sectionTabText: {
    color: '#EA580C',
    fontSize: 13,
    fontWeight: '900',
  },
  sectionTabTextActive: {
    color: '#FFFFFF',
  },
  composerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 14,
    marginBottom: 12,
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  composerTitleWrap: {
    flex: 1,
    marginLeft: 10,
  },
  composerTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  composerSubtitle: {
    color: '#64748B',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  postInput: {
    minHeight: 76,
    borderRadius: 16,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 12,
    color: '#0F172A',
    textAlignVertical: 'top',
    fontSize: 14,
  },
  composerPreviewImage: {
    width: '100%',
    height: 190,
    borderRadius: 18,
    marginTop: 10,
  },
  composerVideoPreview: {
    marginTop: 10,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  composerVideo: {
    width: '100%',
    height: 190,
  },
  mediaRemoveButton: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  lightActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 6,
  },
  lightActionText: {
    color: '#EA580C',
    fontWeight: '900',
    fontSize: 13,
  },
  primaryButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F97316',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  primaryButtonSmallText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  userStrip: {
    gap: 10,
    paddingBottom: 12,
  },
  userCard: {
    width: 104,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    padding: 12,
  },
  userCardName: {
    marginTop: 7,
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '900',
  },
  userCardUsername: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  avatarFallback: {
    backgroundColor: '#FFE7D6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarFallbackText: {
    color: '#EA580C',
    fontWeight: '900',
    fontSize: 16,
  },
  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 12,
    overflow: 'hidden',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  postHeaderText: {
    flex: 1,
    marginLeft: 10,
  },
  postPetName: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
  },
  postMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  postImage: {
    width: '100%',
    height: 260,
    backgroundColor: '#E2E8F0',
  },
  postVideo: {
    width: '100%',
    height: 260,
    backgroundColor: '#0F172A',
  },
  postText: {
    color: '#1E293B',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 16,
  },
  postMenuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7ED',
  },
  reportedBadge: {
    backgroundColor: '#FFE4E6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  reportedBadgeText: {
    color: '#BE123C',
    fontSize: 10,
    fontWeight: '900',
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  postActionText: {
    color: '#7C2D12',
    fontWeight: '900',
  },
  postCommentsPreview: {
    borderTopWidth: 1,
    borderTopColor: '#FFEDD5',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 5,
  },
  postCommentPreviewText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  postCommentPreviewName: {
    color: '#EA580C',
    fontWeight: '900',
  },
  viewAllCommentsText: {
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  nearbyStack: {
    gap: 12,
  },
  nearbyHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 14,
  },
  nearbyHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  nearbyHeroText: {
    flex: 1,
  },
  permissionCard: {
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 18,
  },
  permissionTitle: {
    marginTop: 8,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  permissionText: {
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 12,
  },
  permissionActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 6,
  },
  previewButtonText: {
    color: '#EA580C',
    fontWeight: '900',
    fontSize: 13,
  },
  permissionWarning: {
    color: '#BE123C',
    textAlign: 'center',
    fontWeight: '800',
    marginTop: 10,
    fontSize: 12,
  },
  previewNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 11,
  },
  previewNoticeText: {
    flex: 1,
    color: '#0F766E',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  mapMockCard: {
    height: 188,
    borderRadius: 24,
    backgroundColor: '#DFF7FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    overflow: 'hidden',
    position: 'relative',
  },
  mapCircleLarge: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 2,
    borderColor: 'rgba(14,165,163,0.22)',
    left: -34,
    top: -42,
  },
  mapPin: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  mapPinOne: {
    left: '19%',
    top: '30%',
  },
  mapPinTwo: {
    right: '22%',
    top: '22%',
    backgroundColor: '#F472B6',
  },
  mapPinThree: {
    right: '36%',
    bottom: '24%',
    backgroundColor: '#38BDF8',
  },
  myLocationPin: {
    position: 'absolute',
    left: '48%',
    top: '48%',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 12,
  },
  nearbyBody: {
    flex: 1,
    marginLeft: 11,
    minWidth: 0,
  },
  nearbyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nearbyName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  presenceBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  presenceBadgeOnline: {
    backgroundColor: '#DCFCE7',
  },
  presenceBadgeAway: {
    backgroundColor: '#FEF3C7',
  },
  presenceBadgeText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '900',
  },
  nearbyMeta: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  nearbyStatusText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 5,
  },
  nearbyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  nearbyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
  },
  nearbyActionText: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '900',
  },
  nearbyIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: '#64748B',
    marginTop: 3,
    fontWeight: '700',
    fontSize: 12,
  },
  fabButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },
  formInputHalf: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  longInput: {
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: 9,
    textAlignVertical: 'top',
  },
  halfSegment: {
    flex: 1,
  },
  segmentedRow: {
    gap: 7,
    paddingVertical: 9,
  },
  segmentedRowCompact: {
    paddingVertical: 7,
  },
  segmentedButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  segmentedButtonActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  segmentedButtonText: {
    color: '#EA580C',
    fontWeight: '900',
    fontSize: 12,
  },
  segmentedButtonTextActive: {
    color: '#FFFFFF',
  },
  listingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 12,
    overflow: 'hidden',
  },
  listingImage: {
    width: '100%',
    height: 190,
  },
  listingImageFallback: {
    height: 126,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingBody: {
    padding: 13,
  },
  listingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  listingBadgeText: {
    color: '#EA580C',
    fontWeight: '900',
    fontSize: 12,
  },
  listingCity: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  listingTitle: {
    marginTop: 8,
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
  },
  listingMeta: {
    color: '#475569',
    marginTop: 2,
    fontWeight: '700',
    fontSize: 13,
  },
  listingDescription: {
    color: '#334155',
    marginTop: 8,
    lineHeight: 19,
    fontWeight: '600',
  },
  listingFeature: {
    color: '#0F766E',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 9,
    marginTop: 9,
    fontWeight: '800',
    fontSize: 12,
  },
  listingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 11,
  },
  listingActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  listingActionText: {
    color: '#EA580C',
    fontWeight: '900',
    fontSize: 12,
  },
  contactModeText: {
    color: '#64748B',
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    padding: 22,
  },
  emptyTitle: {
    color: '#0F172A',
    marginTop: 8,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    color: '#64748B',
    marginTop: 5,
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '700',
  },
  messagePreview: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  messagePreviewText: {
    flex: 1,
    marginLeft: 11,
  },
  messageName: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 15,
  },
  messageSnippet: {
    color: '#64748B',
    marginTop: 3,
    fontWeight: '700',
  },
  messageDate: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 14,
  },
  calendarStack: {
    gap: 12,
  },
  calendarFormTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
  },
  calendarEmptyText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  calendarEventCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 11,
    marginBottom: 8,
  },
  calendarEventIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 9,
  },
  calendarEventBody: {
    flex: 1,
    minWidth: 0,
  },
  calendarEventTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
  },
  calendarEventMeta: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  calendarEventNotes: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    fontWeight: '600',
  },
  calendarEventActions: {
    alignItems: 'flex-end',
    gap: 8,
    marginLeft: 8,
  },
  calendarEventDay: {
    color: '#9A3412',
    backgroundColor: '#FFEDD5',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  calendarEventDelete: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE4E6',
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FFFDF8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 11,
    marginBottom: 8,
  },
  reminderText: {
    flex: 1,
    color: '#334155',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  seasonTip: {
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    padding: 12,
    marginBottom: 8,
  },
  seasonTipTitle: {
    color: '#0F766E',
    fontSize: 14,
    fontWeight: '900',
  },
  seasonTipText: {
    color: '#14532D',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  dayPill: {
    flex: 1,
    minHeight: 78,
    borderRadius: 16,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
  },
  dayScore: {
    marginTop: 5,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
  },
  dayMoodDot: {
    marginTop: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  dayMoodGood: {
    backgroundColor: '#22C55E',
  },
  dayMoodLow: {
    backgroundColor: '#F59E0B',
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
  },
  tipText: {
    flex: 1,
    color: '#0F766E',
    lineHeight: 18,
    fontWeight: '700',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'flex-end',
  },
  chatPanel: {
    height: '82%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  commentsPanel: {
    height: '74%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  commentsScroll: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  commentsContent: {
    padding: 14,
    gap: 10,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  commentBubble: {
    flex: 1,
    marginLeft: 9,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 10,
  },
  commentAuthor: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
  },
  commentUsername: {
    color: '#EA580C',
    fontWeight: '800',
  },
  commentText: {
    color: '#334155',
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  commentLikeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 7,
    borderRadius: 999,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  commentLikeText: {
    color: '#9A3412',
    fontSize: 11,
    fontWeight: '900',
  },
  noCommentText: {
    textAlign: 'center',
    color: '#9A6B4F',
    fontWeight: '800',
    marginTop: 24,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#FED7AA',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  commentInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 14,
    color: '#0F172A',
    fontWeight: '700',
  },
  commentSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendButtonDisabled: {
    opacity: 0.45,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  chatTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '900',
  },
  chatSubtitle: {
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatScroll: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  chatContent: {
    padding: 14,
  },
  chatRow: {
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  chatRowMine: {
    alignItems: 'flex-end',
  },
  chatBubble: {
    maxWidth: '84%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chatBubbleMine: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  chatBubbleText: {
    color: '#1E293B',
    lineHeight: 20,
    fontWeight: '600',
  },
  chatBubbleTextMine: {
    color: '#FFFFFF',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 14,
    color: '#0F172A',
    fontWeight: '700',
  },
  chatSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
