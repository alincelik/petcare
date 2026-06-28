import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';
import { generateVeterinaryAssistantReply, remotePetAiEnabled } from '@/lib/pet-ai';

const PROFILES_KEY = 'petProfilesV2';
const LEGACY_PROFILE_KEY = 'petProfile';
const DAILY_LOGS_KEY = 'petDailyLogsV1';
const REMINDERS_KEY = 'petReminderSettingsV1';
const OWNER_PROFILE_KEY = 'petOwnerProfileV1';
const AI_CHAT_STORE_KEY = 'petAiChatStoreV4';
const AI_MEMORY_KEY = 'petAiMemoryV1';
const FALLBACK_CAROUSEL_WIDTH = Dimensions.get('window').width - 44;

type PetProfile = {
  id: string;
  name: string;
  species: string;
  age: string;
  ageUnit: string;
  weight: string;
  allergies: string;
  diseases: string;
  foodType: string;
  vetName: string;
  mealsPerDay?: string;
};

type ProfilesStore = {
  pets: PetProfile[];
  activePetId: string;
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

type DailyLogHistoryItem = {
  date: string;
  water: boolean;
  food: boolean;
  play: boolean;
  toilet: boolean;
  mood: number;
};

type ReminderNotificationIds = {
  water?: string;
  food?: string[];
  puppyWeekly?: string;
  annual?: string;
};

type PetReminderSetting = {
  waterTime: string;
  foodTimes: string[];
  puppyVaccineStartDate: string;
  annualVaccineLastDate: string;
  notificationIds: ReminderNotificationIds;
};

type ReminderSettingsStore = Record<string, PetReminderSetting>;

type RoutinePlan = {
  waterTime: string;
  foodTimes: string[];
  source: 'saved' | 'auto';
};

type OwnerProfile = {
  fullName: string;
  username: string;
  city: string;
  bio: string;
};

type AiRole = 'assistant' | 'user';

type AiChatMessage = {
  id: string;
  role: AiRole;
  text: string;
  createdAt: string;
};

type AiChatStore = Record<string, AiChatMessage[]>;
type AiMemoryStore = Record<string, string[]>;

type HighlightSlide = {
  id: string;
  title: string;
  subtitle: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  image: string;
  link: string;
};

type QuickAiPrompt = {
  id: string;
  label: string;
  prompt: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

type AiIntent =
  | 'emergency'
  | 'health'
  | 'nutrition'
  | 'hydration'
  | 'routine'
  | 'summary'
  | 'greeting'
  | 'chat'
  | 'unclear';
type KittenMood = 'happy' | 'curious' | 'concerned' | 'sleepy';

type AiMessageAnalysis = {
  intent: AiIntent;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  symptoms: string[];
  needsClarification: boolean;
};

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

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');

const getAgeYears = (pet: PetProfile | null): number => {
  if (!pet) return 0;
  const parsed = Number(pet.age);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return pet.ageUnit === 'Ay' ? parsed / 12 : parsed;
};

const clampMealCount = (value: string | undefined): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 2;
  if (parsed < 1) return 1;
  if (parsed > 3) return 3;
  return parsed;
};

const getDefaultFoodTimes = (mealCount: number): string[] => {
  if (mealCount <= 1) return ['19:00'];
  if (mealCount === 2) return ['09:00', '19:00'];
  return ['08:30', '13:30', '19:30'];
};

const getAutoWaterTime = (pet: PetProfile | null): string => {
  const ageYears = getAgeYears(pet);
  if (pet?.species === 'Kedi') return ageYears < 1 ? '08:00' : '09:00';
  if (pet?.species === 'Köpek') return ageYears < 1 ? '07:30' : '08:30';
  return '09:00';
};

const dailyHighlights: HighlightSlide[] = [
  {
    id: 'care',
    title: 'Günlük Bakım Rehberi',
    subtitle: 'Su, mama ve tuvalet rutininde nelere dikkat edilmeli?',
    label: 'Video',
    icon: 'play-circle',
    image:
      'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&w=1200&q=80',
    link: 'https://www.youtube.com/results?search_query=evcil+hayvan+g%C3%BCnl%C3%BCk+bak%C4%B1m+su+mama+tuvalet',
  },
  {
    id: 'mood',
    title: 'Beslenmede Denge',
    subtitle: 'Mama geçişi, öğün düzeni ve hassas mide konularını izle.',
    label: 'Beslenme',
    icon: 'restaurant',
    image:
      'https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&w=1200&q=80',
    link: 'https://www.youtube.com/results?search_query=veteriner+evcil+hayvan+beslenme+mama+ge%C3%A7i%C5%9Fi',
  },
  {
    id: 'notice',
    title: 'Veterinerden Notlar',
    subtitle: 'Aşı, parazit ve mevsimsel riskler için kısa bilgilendirici videolar.',
    label: 'Sağlık',
    icon: 'health-and-safety',
    image:
      'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=1200&q=80',
    link: 'https://www.youtube.com/results?search_query=veteriner+a%C5%9F%C4%B1+parazit+evcil+hayvan+bak%C4%B1m',
  },
];

const quickAiPrompts: QuickAiPrompt[] = [
  {
    id: 'summary',
    label: 'Özet',
    prompt: 'Bugün için kısa bakım özeti ver.',
    icon: 'summarize',
  },
  {
    id: 'food',
    label: 'Mama',
    prompt: 'Mama planını kısa ve net anlat.',
    icon: 'restaurant',
  },
  {
    id: 'water',
    label: 'Su',
    prompt: 'Su takibi için bugün neye dikkat etmeliyim?',
    icon: 'water-drop',
  },
  {
    id: 'memory',
    label: 'Not kaydet',
    prompt: 'öğren: ',
    icon: 'bookmark-add',
  },
];

const getPersonalizedComment = (pet: PetProfile | null, log: DailyLog): string => {
  if (!pet || !pet.name.trim()) {
    return 'Daha iyi AI yorumu için Profil sekmesinden pet bilgilerini tamamla.';
  }

  const completed = [log.water, log.food, log.play, log.toilet].filter(Boolean).length;
  const issues: string[] = [];

  if (pet.allergies.trim()) issues.push('alerji');
  if (pet.diseases.trim()) issues.push('hastalık');

  let base = '';
  if (log.mood <= 2 && completed <= 2) {
    base = `${pet.name} bugün düşük enerjide. Temel rutinleri (su, mama, tuvalet) tamamlayıp dinlenmesini gözlemle.`;
  } else if (log.mood <= 2) {
    base = `${pet.name} biraz yorgun görünüyor. Bugün daha sakin tempo ve kısa oyun daha iyi olabilir.`;
  } else if (log.mood >= 4 && completed === 4) {
    base = `${pet.name} bugün gayet iyi görünüyor. Rutinleri eksiksiz sürdürmen çok iyi.`;
  } else if (completed < 4) {
    base = `${pet.name} için günlük bakımın bir kısmı eksik. Bugünü tamamlayınca durum daha netleşir.`;
  } else {
    base = `${pet.name} bugün dengeli görünüyor. Rutin bakım planı doğru ilerliyor.`;
  }

  const ageNum = Number(pet.age);
  if (!Number.isNaN(ageNum) && ageNum >= 8 && pet.ageUnit === 'Yaş') {
    base += ' İleri yaşta olduğu için su tüketimi ve enerji düşüşünü ekstra takip et.';
  }

  if (issues.length > 0) {
    base += ` Profilde ${issues.join(' ve ')} bilgisi olduğu için ani değişimlerde veterinerine danışman iyi olur.`;
  }

  return base;
};

const includesAny = (text: string, words: string[]): boolean => words.some((word) => text.includes(word));

const findMatches = (text: string, words: string[]): string[] => words.filter((word) => text.includes(word));

const analyzeAiMessage = (input: string): AiMessageAnalysis => {
  const q = input.toLocaleLowerCase('tr-TR');
  const emergencyWords = [
    'nefes alam',
    'boğul',
    'bogul',
    'bayıl',
    'bayil',
    'nöbet',
    'nobet',
    'kanlı',
    'kanli',
    'kan kus',
    'zehir',
    'çikolata',
    'cikolata',
    'soğan',
    'sogan',
    'üzüm',
    'uzum',
    'araba çarptı',
    'araba carpti',
    'idrar yapam',
    'su tutam',
    'sürekli kus',
    'surekli kus',
  ];
  const healthWords = [
    'kus',
    'ishal',
    'halsiz',
    'iştahsız',
    'istahsız',
    'ateş',
    'ates',
    'öksür',
    'oksur',
    'hapşır',
    'hapsir',
    'titri',
    'topal',
    'kaşın',
    'kasin',
    'yara',
    'şiş',
    'sis',
    'ağrı',
    'agri',
    'kulak',
    'göz',
    'goz',
    'idrar',
    'dışkı',
    'diski',
    'alerji',
    'hastalık',
    'hastalik',
    'aşı',
    'asi',
  ];
  const nutritionWords = ['mama', 'öğün', 'ogun', 'beslen', 'yemek', 'kilo', 'diyet'];
  const hydrationWords = ['su', 'susuz', 'içmiyor', 'icmiyor', 'su kab'];
  const routineWords = ['rutin', 'plan', 'hatırlat', 'hatirlat', 'takvim', 'oyun', 'tuvalet'];
  const summaryWords = ['özet', 'ozet', 'durum', 'bugün', 'bugun'];
  const greetingWords = ['selam', 'merhaba', 'hey', 'sa'];
  const chatWords = [
    'nasılsın',
    'nasilsin',
    'ne yapıyorsun',
    'ne yapiyorsun',
    'konuşalım',
    'konusalim',
    'sohbet',
    'canım sıkıldı',
    'canim sikildi',
    'teşekkür',
    'tesekkur',
    'sağ ol',
    'sag ol',
    'seni seviyorum',
    'şaka',
    'saka',
    'komik',
    'tatlı',
    'tatli',
    'iyi misin',
  ];
  const vagueWords = ['kötü', 'kotu', 'garip', 'tuhaf', 'iyi değil', 'iyi degil', 'sorun var', 'ne yapayım', 'ne yapayim'];

  const symptoms = findMatches(q, [...emergencyWords, ...healthWords]);
  if (includesAny(q, emergencyWords)) {
    return { intent: 'emergency', confidence: 0.92, riskLevel: 'high', symptoms, needsClarification: false };
  }
  if (symptoms.length > 0) {
    return { intent: 'health', confidence: 0.82, riskLevel: 'medium', symptoms, needsClarification: q.length < 18 };
  }
  if (includesAny(q, nutritionWords)) {
    return { intent: 'nutrition', confidence: 0.78, riskLevel: 'low', symptoms: [], needsClarification: false };
  }
  if (includesAny(q, hydrationWords)) {
    return { intent: 'hydration', confidence: 0.78, riskLevel: 'low', symptoms: [], needsClarification: false };
  }
  if (includesAny(q, greetingWords)) {
    return { intent: 'greeting', confidence: 0.7, riskLevel: 'low', symptoms: [], needsClarification: false };
  }
  if (includesAny(q, chatWords)) {
    return { intent: 'chat', confidence: 0.76, riskLevel: 'low', symptoms: [], needsClarification: false };
  }
  if (includesAny(q, routineWords)) {
    return { intent: 'routine', confidence: 0.72, riskLevel: 'low', symptoms: [], needsClarification: false };
  }
  if (includesAny(q, summaryWords)) {
    return { intent: 'summary', confidence: 0.72, riskLevel: 'low', symptoms: [], needsClarification: false };
  }
  if (q.length < 12 || includesAny(q, vagueWords)) {
    return { intent: 'unclear', confidence: 0.42, riskLevel: 'low', symptoms: [], needsClarification: true };
  }
  return { intent: 'unclear', confidence: 0.5, riskLevel: 'low', symptoms: [], needsClarification: true };
};

const buildCoachReply = ({
  input,
  pet,
  routinePlan,
  mood,
  completed,
  aiComment,
  ownerProfile,
  memoryNotes,
}: {
  input: string;
  pet: PetProfile | null;
  routinePlan: RoutinePlan | null;
  mood: number;
  completed: number;
  aiComment: string;
  ownerProfile: OwnerProfile | null;
  memoryNotes: string[];
}): string => {
  if (!pet) {
    return 'Önce Profil sekmesinden bir pet seçelim, sonra sana kişiselleştirilmiş öneri verebilirim.';
  }

  const q = input.toLocaleLowerCase('tr-TR');
  const analysis = analyzeAiMessage(input);
  const petName = pet.name.trim() || 'Dostun';
  const moodText = ['bitkin', 'huysuz', 'normal', 'enerjik', 'mutlu'][Math.max(0, Math.min(4, mood - 1))];
  const ownerContext = ownerProfile?.fullName.trim()
    ? 'Sahip profilindeki iletişim tercihlerini de dikkate alıyorum.'
    : 'Sahip profilini tamamladıkça cevaplarım daha kişisel olur.';

  if (analysis.intent === 'emergency') {
    return `${petName} için bu acil risk gibi değerlendirilmeli.\n- Nefes, bayılma, kan, zehirlenme, su tutamama veya idrar yapamama varsa beklemeden en yakın veteriner hekime başvur.\n- Bu sırada yediği şeyi, zamanı, kusma/ishal sayısını ve varsa fotoğrafını not et.\n- Uygulama burada teşhis koymaz; acil belirtilerde zaman kaybetmemek en güvenli adımdır.`;
  }

  if (analysis.intent === 'health') {
    if (analysis.needsClarification) {
      return `${petName} için bunu doğru anlamam gerekiyor.\n- Belirti ne zamandır var ve kaç kez tekrar etti?\n- Halsizlik, iştahsızlık, kan, ateş veya nefes problemi var mı?\n- Son 24 saatte yeni mama, ödül maması ya da farklı bir şey yedi mi?`;
    }
    return `${petName} için bu bir sağlık/belirti konusu.\n- Belirtiyi süre, tekrar sayısı, iştah, su tüketimi ve enerjiyle birlikte takip et.\n- Kan, belirgin halsizlik, nefes problemi, sürekli kusma/ishal veya su tutamama varsa beklemeden veteriner hekime başvur.\n- Profildeki alerji, hastalık, ilaç ve son yediği mama bilgisini not edersen daha isabetli yönlendirebilirim.`;
  }

  if (analysis.intent === 'unclear' && analysis.needsClarification) {
    return `${petName} için bunu doğru anlamak istiyorum.\n- "Kötü" derken halsizlik, kusma, ishal, iştahsızlık, ağrı veya davranış değişikliği mi var?\n- Ne zamandır böyle ve kaç kez tekrar etti?\n- Acil belirti varsa beklemeden veteriner hekime başvur.`;
  }

  if (analysis.intent === 'summary') {
    return `${petName} için kısa özet:\n- Bakım: ${completed}/4 tamam\n- Ruh hali: ${moodText}\n- Yorum: ${aiComment}`;
  }

  if (analysis.intent === 'nutrition') {
    if (!routinePlan) {
      return `${petName} için henüz kayıtlı mama planı göremiyorum. Keşfet > Takvim/hatırlatıcıdan saatleri kaydedelim.`;
    }
    return `${petName} için mama planı:\n- Saatler: ${routinePlan.foodTimes.join(' • ')}\n- Not: Öğünleri aynı saat aralığında tutmak iyi olur.\n- Su: Mama saatlerinden sonra su kabını da kontrol et.`;
  }

  if (analysis.intent === 'hydration') {
    if (!routinePlan) return `${petName} için su saatini henüz göremiyorum. Gün içinde en az 1 kez su yenilemeni öneririm.`;
    return `${petName} için su takibi:\n- Ana yenileme saati: ${routinePlan.waterTime}\n- Sıcak günlerde ekstra kontrol iyi olur.\n- Su kabı kirlenirse saati beklemeden değiştir.`;
  }

  if (analysis.intent === 'routine' || q.includes('öner') || q.includes('plan')) {
    const planLine = routinePlan
      ? `Plan: su ${routinePlan.waterTime}, mama ${routinePlan.foodTimes.join(' • ')}.`
      : 'Plan saatleri henüz yok, önce hatırlatıcılarını ayarlayalım.';
    const memoryLine =
      memoryNotes.length > 0 ? `Senden öğrendiklerim: ${memoryNotes.slice(0, 2).join(' | ')}.` : '';
    return `${petName} için önerim:\n- Bakım hedefi: Bugün 4/4 rutini tamamla.\n- Ruh hali: "${moodText}" görünüyorsa oyunu ve dinlenmeyi buna göre ayarla.\n- ${planLine} ${memoryLine}`.trim();
  }

  if (analysis.intent === 'greeting') {
    return `Merhaba, buradayım. ${petName} bugün "${moodText}" modunda görünüyor.\nİstersen sadece sohbet edebiliriz, istersen ${petName} için mama, su, oyun, davranış veya sağlık belirtisi hakkında birlikte düşünebiliriz.\n${ownerContext}`;
  }

  if (analysis.intent === 'chat') {
    const memoryLine =
      memoryNotes.length > 0 ? `Ayrıca ${petName} hakkında öğrendiğim notları da aklımda tutuyorum.` : '';
    if (q.includes('teşekkür') || q.includes('tesekkur') || q.includes('sağ ol') || q.includes('sag ol')) {
      return `Rica ederim. ${petName} için buradayım; ister ciddi bir bakım sorusu, ister küçük bir sohbet olsun birlikte toparlarız. ${memoryLine}`.trim();
    }
    if (q.includes('canım') || q.includes('canim') || q.includes('sohbet') || q.includes('konuş')) {
      return `Olur, biraz sohbet edelim. Bugün ${petName} nasıl, sen nasılsın? İstersen bana gününüzü anlat; ben hem seni dinlerim hem de arada ${petName} için küçük bakım fikirleri yakalarım.`;
    }
    return `Ben iyiyim, ${petName} için de buradayım. Sen bana normal insan gibi yazabilirsin; sadece belirti, mama, su veya rutin konusu sezdiğimde daha dikkatli ve veterinerlik bilgisine yakın cevap veririm.`;
  }

  return `Seni dinliyorum. Bunu ${petName} için bir bakım sorusu gibi mi düşünelim, yoksa sadece sohbet mi edelim?\nKısaca yazman yeterli: “mama”, “su”, “bugün çok halsiz”, “sadece sohbet” gibi.`;
};

const cleanupAiReply = (text: string): string => {
  return text
    .replaceAll('[VET_CONSULT_SUGGESTED]', '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const isLowQualityAiReply = (text: string): boolean => {
  const normalized = text.toLocaleLowerCase('tr-TR');
  const badFragments = [
    'bugün için özür',
    'özür dilerim',
    'as an ai',
    'i am an ai',
    'bir yapay zeka olarak',
    'bunu yapamam',
    'anlamadım',
  ];

  if (text.trim().length < 24) return true;
  if (text.length > 900) return true;
  return badFragments.some((fragment) => normalized.includes(fragment));
};

const getKittenMood = (input: string, sending: boolean): KittenMood => {
  if (sending) return 'curious';
  const trimmed = input.trim();
  if (!trimmed) return 'happy';

  const analysis = analyzeAiMessage(trimmed);
  if (analysis.intent === 'emergency' || analysis.riskLevel === 'high') return 'concerned';
  if (analysis.intent === 'health') return 'concerned';
  if (analysis.intent === 'unclear') return 'curious';
  if (trimmed.toLocaleLowerCase('tr-TR').includes('uyku')) return 'sleepy';
  return 'happy';
};

const kittenMoodText: Record<KittenMood, { title: string; subtitle: string }> = {
  happy: {
    title: 'Mavi seni dinliyor',
    subtitle: 'Bakım, mama, su veya ruh hali için yazabilirsin.',
  },
  curious: {
    title: 'Mavi anlamaya çalışıyor',
    subtitle: 'Biraz daha detay yazarsan daha net yönlendirebilirim.',
  },
  concerned: {
    title: 'Mavi dikkat kesildi',
    subtitle: 'Sağlık belirtisi varsa süre, tekrar ve enerji bilgisini yaz.',
  },
  sleepy: {
    title: 'Mavi sakin modda',
    subtitle: 'Dinlenme, uyku ve rutin konularını birlikte takip edebiliriz.',
  },
};

function AiKittenMascot({ mood = 'happy', size = 78 }: { mood?: KittenMood; size?: number }) {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1350,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1350,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [bob]);

  const translateY = bob.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });
  const look = {
    happy: { x: 0, y: 0 },
    curious: { x: 2.5, y: -1 },
    concerned: { x: -1.5, y: 1 },
    sleepy: { x: 0, y: 0 },
  }[mood];
  const headWidth = size * 0.78;
  const headHeight = size * 0.66;
  const headLeft = size * 0.11;
  const headTop = size * 0.23;

  return (
    <Animated.View style={[styles.kittenStage, { width: size, height: size, transform: [{ translateY }] }]}>
      <View
        style={[
          styles.kittenTail,
          {
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: size * 0.18,
            right: size * 0.02,
            bottom: size * 0.08,
          },
        ]}
      />
      <View
        style={[
          styles.kittenEar,
          {
            width: size * 0.22,
            height: size * 0.25,
            left: size * 0.17,
            top: size * 0.12,
            transform: [{ rotate: '-17deg' }],
          },
        ]}
      >
        <View style={styles.kittenInnerEar} />
      </View>
      <View
        style={[
          styles.kittenEar,
          {
            width: size * 0.22,
            height: size * 0.25,
            right: size * 0.17,
            top: size * 0.12,
            transform: [{ rotate: '17deg' }],
          },
        ]}
      >
        <View style={styles.kittenInnerEar} />
      </View>
      <View
        style={[
          styles.kittenHead,
          {
            width: headWidth,
            height: headHeight,
            left: headLeft,
            top: headTop,
            borderRadius: size * 0.26,
          },
        ]}
      >
        <View style={[styles.kittenStripe, { top: headHeight * 0.03, left: headWidth * 0.46 }]} />
        <View style={[styles.kittenEye, { left: headWidth * 0.25, top: headHeight * 0.34 }]}>
          {mood === 'sleepy' ? (
            <View style={styles.kittenSleepyEye} />
          ) : (
            <View style={[styles.kittenPupil, { transform: [{ translateX: look.x }, { translateY: look.y }] }]}>
              <View style={styles.kittenEyeShine} />
            </View>
          )}
        </View>
        <View style={[styles.kittenEye, { right: headWidth * 0.25, top: headHeight * 0.34 }]}>
          {mood === 'sleepy' ? (
            <View style={styles.kittenSleepyEye} />
          ) : (
            <View style={[styles.kittenPupil, { transform: [{ translateX: look.x }, { translateY: look.y }] }]}>
              <View style={styles.kittenEyeShine} />
            </View>
          )}
        </View>
        {mood === 'concerned' ? (
          <>
            <View style={[styles.kittenBrow, styles.kittenBrowLeft]} />
            <View style={[styles.kittenBrow, styles.kittenBrowRight]} />
          </>
        ) : null}
        <View style={[styles.kittenBlush, { left: headWidth * 0.14, top: headHeight * 0.58 }]} />
        <View style={[styles.kittenBlush, { right: headWidth * 0.14, top: headHeight * 0.58 }]} />
        <View style={[styles.kittenNose, { top: headHeight * 0.52 }]} />
        <View style={[styles.kittenWhisker, styles.kittenWhiskerLeftTop]} />
        <View style={[styles.kittenWhisker, styles.kittenWhiskerLeftBottom]} />
        <View style={[styles.kittenWhisker, styles.kittenWhiskerRightTop]} />
        <View style={[styles.kittenWhisker, styles.kittenWhiskerRightBottom]} />
        {mood === 'curious' ? (
          <View style={[styles.kittenMouthO, { top: headHeight * 0.64 }]} />
        ) : mood === 'concerned' ? (
          <View style={[styles.kittenMouthConcern, { top: headHeight * 0.66 }]} />
        ) : (
          <View style={[styles.kittenSmile, { top: headHeight * 0.63 }]} />
        )}
      </View>
    </Animated.View>
  );
}

export default function Home() {
  const { session } = useAuth();
  const [water, setWater] = useState(false);
  const [food, setFood] = useState(false);
  const [play, setPlay] = useState(false);
  const [toilet, setToilet] = useState(false);
  const [mood, setMood] = useState(3);
  const [activePet, setActivePet] = useState<PetProfile | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [recentLogs, setRecentLogs] = useState<DailyLogHistoryItem[]>([]);
  const [routinePlan, setRoutinePlan] = useState<RoutinePlan | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(FALLBACK_CAROUSEL_WIDTH);
  const [activeSlide, setActiveSlide] = useState(0);
  const [aiChatVisible, setAiChatVisible] = useState(false);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiMemoryNotes, setAiMemoryNotes] = useState<string[]>([]);
  const [sendingAiMessage, setSendingAiMessage] = useState(false);

  const meowSoundRef = useRef<Audio.Sound | null>(null);
  const carouselRef = useRef<ScrollView | null>(null);
  const aiScrollRef = useRef<ScrollView | null>(null);
  const todayKey = useMemo(() => getLocalDateKey(new Date()), []);
  const userKey = session?.user.id || 'local-user';
  const activeAiKey = `${userKey}::${activePet?.id || 'global'}`;

  useEffect(() => {
    const initAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
        });
        const { sound } = await Audio.Sound.createAsync(require('../../assets/meow.wav'));
        meowSoundRef.current = sound;
      } catch (error) {
        console.log('Ses hazırlama hatası:', error);
      }
    };

    void initAudio();

    return () => {
      if (meowSoundRef.current) {
        void meowSoundRef.current.unloadAsync();
        meowSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (dailyHighlights.length <= 1) return undefined;

    const timer = setInterval(() => {
      setActiveSlide((prev) => {
        const next = (prev + 1) % dailyHighlights.length;
        carouselRef.current?.scrollTo({ x: next * carouselWidth, animated: true });
        return next;
      });
    }, 5500);

    return () => clearInterval(timer);
  }, [carouselWidth]);

  const loadHomeData = useCallback(async () => {
    let resolvedPet: PetProfile | null = null;

    try {
      const profilesRaw = await AsyncStorage.getItem(PROFILES_KEY);
      if (profilesRaw) {
        const profiles = JSON.parse(profilesRaw) as ProfilesStore;
        if (profiles.pets && profiles.pets.length > 0) {
          const current = profiles.pets.find((pet) => pet.id === profiles.activePetId) || profiles.pets[0];
          resolvedPet = current;
        }
      }

      if (!resolvedPet) {
        const legacyRaw = await AsyncStorage.getItem(LEGACY_PROFILE_KEY);
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw) as Record<string, unknown>;
          resolvedPet = {
            id: 'legacy',
            name: getString(legacy.name),
            species: getString(legacy.species) || getString(legacy.type),
            age: getString(legacy.age),
            ageUnit: getString(legacy.ageUnit) || 'Yaş',
            weight: getString(legacy.weight),
            allergies: getString(legacy.allergies),
            diseases: getString(legacy.diseases),
            foodType: getString(legacy.foodType),
            vetName: getString(legacy.vetName),
          };
        }
      }
    } catch (error) {
      console.log('Profil okuma hatası:', error);
    }

    setActivePet(resolvedPet);

    try {
      const ownerRaw = await AsyncStorage.getItem(OWNER_PROFILE_KEY);
      if (ownerRaw) {
        const parsed = JSON.parse(ownerRaw) as Record<string, unknown>;
        setOwnerProfile({
          fullName: getString(parsed.fullName),
          username: normalizeUsername(getString(parsed.username)),
          city: getString(parsed.city),
          bio: getString(parsed.bio),
        });
      } else {
        setOwnerProfile(null);
      }
    } catch (error) {
      console.log('İnsan profili okuma hatası:', error);
      setOwnerProfile(null);
    }

    try {
      if (!resolvedPet?.id) {
        setRoutinePlan(null);
      } else {
        const remindersRaw = await AsyncStorage.getItem(REMINDERS_KEY);
        const reminderStore = remindersRaw ? (JSON.parse(remindersRaw) as ReminderSettingsStore) : {};
        const currentReminder = reminderStore[resolvedPet.id];
        if (currentReminder && Array.isArray(currentReminder.foodTimes) && currentReminder.foodTimes.length > 0) {
          setRoutinePlan({
            waterTime: currentReminder.waterTime || getAutoWaterTime(resolvedPet),
            foodTimes: currentReminder.foodTimes,
            source: 'saved',
          });
        } else {
          const meals = clampMealCount(resolvedPet.mealsPerDay);
          setRoutinePlan({
            waterTime: getAutoWaterTime(resolvedPet),
            foodTimes: getDefaultFoodTimes(meals),
            source: 'auto',
          });
        }
      }
    } catch (error) {
      console.log('Rutin plan okuma hatası:', error);
      setRoutinePlan(null);
    }

    try {
      const logsRaw = await AsyncStorage.getItem(DAILY_LOGS_KEY);
      if (!logsRaw || !resolvedPet?.id) {
        setWater(false);
        setFood(false);
        setPlay(false);
        setToilet(false);
        setMood(3);
        setRecentLogs([]);
        return;
      }

      const logs = JSON.parse(logsRaw) as DailyLogsStore;
      const logsForPet = logs[resolvedPet.id] || {};
      const todayLog = logsForPet[todayKey];

      const history = Object.entries(logsForPet)
        .map(([date, log]) => ({
          date,
          water: Boolean(log.water),
          food: Boolean(log.food),
          play: Boolean(log.play),
          toilet: Boolean(log.toilet),
          mood: typeof log.mood === 'number' ? log.mood : 3,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20);
      setRecentLogs(history);

      if (todayLog) {
        setWater(todayLog.water);
        setFood(todayLog.food);
        setPlay(todayLog.play);
        setToilet(todayLog.toilet);
        setMood(todayLog.mood);
      } else {
        setWater(false);
        setFood(false);
        setPlay(false);
        setToilet(false);
        setMood(3);
      }
    } catch (error) {
      console.log('Günlük kayıt okuma hatası:', error);
      setRecentLogs([]);
    }

  }, [todayKey]);

  useFocusEffect(
    useCallback(() => {
      void loadHomeData();
    }, [loadHomeData])
  );

  useEffect(() => {
    const loadAiData = async () => {
      try {
        const chatRaw = await AsyncStorage.getItem(AI_CHAT_STORE_KEY);
        const chatStore = chatRaw ? (JSON.parse(chatRaw) as AiChatStore) : {};
        const fromStore = Array.isArray(chatStore[activeAiKey]) ? chatStore[activeAiKey] : [];

        if (fromStore.length > 0) {
          setAiMessages(fromStore);
        } else {
          const petName = activePet?.name?.trim() || 'dostun';
          setAiMessages([
            {
              id: `ai-welcome-${activeAiKey}`,
              role: 'assistant',
              text: `Merhaba, ${petName} için buradayım. Belirti, bakım rutini, mama veya su planı hakkında soru sorabilirsin.`,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch (error) {
        console.log('AI sohbet verisi okuma hatası:', error);
        setAiMessages([]);
      }

      try {
        const memoryRaw = await AsyncStorage.getItem(AI_MEMORY_KEY);
        const memoryStore = memoryRaw ? (JSON.parse(memoryRaw) as AiMemoryStore) : {};
        const notes = Array.isArray(memoryStore[activeAiKey]) ? memoryStore[activeAiKey] : [];
        setAiMemoryNotes(notes.filter((item): item is string => typeof item === 'string').slice(0, 15));
      } catch (error) {
        console.log('AI hafıza verisi okuma hatası:', error);
        setAiMemoryNotes([]);
      }
    };

    void loadAiData();
  }, [activeAiKey, activePet?.name]);

  useEffect(() => {
    if (!aiChatVisible) return;
    const timer = setTimeout(() => {
      aiScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [aiChatVisible, aiMessages]);

  const persistAiMessages = async (nextMessages: AiChatMessage[]) => {
    setAiMessages(nextMessages);
    try {
      const chatRaw = await AsyncStorage.getItem(AI_CHAT_STORE_KEY);
      const chatStore = chatRaw ? (JSON.parse(chatRaw) as AiChatStore) : {};
      const nextStore: AiChatStore = {
        ...chatStore,
        [activeAiKey]: nextMessages.slice(-120),
      };
      await AsyncStorage.setItem(AI_CHAT_STORE_KEY, JSON.stringify(nextStore));
    } catch (error) {
      console.log('AI sohbet kaydetme hatası:', error);
    }
  };

  const persistAiMemory = async (nextNotes: string[]) => {
    setAiMemoryNotes(nextNotes);
    try {
      const memoryRaw = await AsyncStorage.getItem(AI_MEMORY_KEY);
      const memoryStore = memoryRaw ? (JSON.parse(memoryRaw) as AiMemoryStore) : {};
      const nextStore: AiMemoryStore = {
        ...memoryStore,
        [activeAiKey]: nextNotes.slice(0, 15),
      };
      await AsyncStorage.setItem(AI_MEMORY_KEY, JSON.stringify(nextStore));
    } catch (error) {
      console.log('AI hafıza kaydetme hatası:', error);
    }
  };

  const saveDailyLog = async (nextLog: Omit<DailyLog, 'updatedAt'>) => {
    if (!activePet?.id) return;

    try {
      const logsRaw = await AsyncStorage.getItem(DAILY_LOGS_KEY);
      const logs = logsRaw ? (JSON.parse(logsRaw) as DailyLogsStore) : {};

      if (!logs[activePet.id]) logs[activePet.id] = {};

      logs[activePet.id][todayKey] = {
        ...nextLog,
        updatedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(DAILY_LOGS_KEY, JSON.stringify(logs));

      const history = Object.entries(logs[activePet.id] || {})
        .map(([date, log]) => ({
          date,
          water: Boolean(log.water),
          food: Boolean(log.food),
          play: Boolean(log.play),
          toilet: Boolean(log.toilet),
          mood: typeof log.mood === 'number' ? log.mood : 3,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20);
      setRecentLogs(history);
    } catch (error) {
      console.log('Günlük kayıt yazma hatası:', error);
    }
  };

  const playMeow = async () => {
    try {
      if (!meowSoundRef.current) {
        const { sound } = await Audio.Sound.createAsync(require('../../assets/meow.wav'));
        meowSoundRef.current = sound;
      }

      await meowSoundRef.current.setPositionAsync(0);
      await meowSoundRef.current.playAsync();
    } catch (error) {
      console.log('Ses çalma hatası:', error);
    }
  };

  const updateChecklist = (updates: Partial<Omit<DailyLog, 'updatedAt'>>) => {
    const next = {
      water,
      food,
      play,
      toilet,
      mood,
      ...updates,
    };

    setWater(next.water);
    setFood(next.food);
    setPlay(next.play);
    setToilet(next.toilet);
    setMood(next.mood);
    void saveDailyLog(next);
  };

  const onCarouselScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
    setActiveSlide(Math.min(Math.max(nextIndex, 0), dailyHighlights.length - 1));
  };

  const openHighlightLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.log('Link açma hatası:', error);
    }
  };

  const sendAiMessage = async (preset?: string) => {
    const rawInput = (preset ?? aiChatInput).trim();
    if (!rawInput || sendingAiMessage) return;

    const userMessage: AiChatMessage = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      text: rawInput,
      createdAt: new Date().toISOString(),
    };

    const draftMessages = [...aiMessages, userMessage];
    await persistAiMessages(draftMessages);
    setAiChatInput('');
    setSendingAiMessage(true);

    const lower = rawInput.toLocaleLowerCase('tr-TR');
    if (lower.startsWith('öğren:') || lower.startsWith('not olarak kaydet:')) {
      const note = rawInput.replace(/^(öğren:|not olarak kaydet:)/i, '').trim();
      if (!note) {
        const assistantWarn: AiChatMessage = {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          text: 'Kaydetmem için kısa bir not yazmalısın. Örnek: "öğren: Elsa tavuklu mama seviyor".',
          createdAt: new Date().toISOString(),
        };
        await persistAiMessages([...draftMessages, assistantWarn]);
        setSendingAiMessage(false);
        return;
      }

      const nextNotes = Array.from(new Set([note, ...aiMemoryNotes])).slice(0, 15);
      await persistAiMemory(nextNotes);
      const ack: AiChatMessage = {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'assistant',
        text: `"${note}" bilgisini öğrendim. Bundan sonra önerilerimde bunu da dikkate alacağım.`,
        createdAt: new Date().toISOString(),
      };
      await persistAiMessages([...draftMessages, ack]);
      setSendingAiMessage(false);
      return;
    }

    const liveComment = getPersonalizedComment(activePet, {
      water,
      food,
      play,
      toilet,
      mood,
      updatedAt: '',
    });

    let reply = buildCoachReply({
      input: rawInput,
      pet: activePet,
      routinePlan,
      mood,
      completed,
      aiComment: liveComment,
      ownerProfile,
      memoryNotes: aiMemoryNotes,
    });

    if (remotePetAiEnabled) {
      const remote = await generateVeterinaryAssistantReply({
        userMessage: rawInput,
        pet: activePet
          ? {
              name: activePet.name,
              species: activePet.species,
              age: activePet.age,
              ageUnit: activePet.ageUnit,
              weight: activePet.weight,
              allergies: activePet.allergies,
              diseases: activePet.diseases,
              foodType: activePet.foodType,
              vetName: activePet.vetName,
              mealsPerDay: activePet.mealsPerDay,
            }
          : null,
        owner: ownerProfile,
        routinePlan,
        todayLog: {
          water,
          food,
          play,
          toilet,
          mood,
        },
        recentLogs,
        vetHistory: [],
        memoryNotes: aiMemoryNotes,
      });

      if (remote.source === 'remote' && remote.text.trim()) {
        const remoteReply = cleanupAiReply(remote.text);
        if (!isLowQualityAiReply(remoteReply)) {
          reply = remoteReply;
        }
      }
    }

    const cleanedReply = cleanupAiReply(reply);

    const assistantMessage: AiChatMessage = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'assistant',
      text: cleanedReply,
      createdAt: new Date().toISOString(),
    };

    await persistAiMessages([...draftMessages, assistantMessage]);
    setSendingAiMessage(false);
  };

  const handleAiInputKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (event.nativeEvent.key !== 'Enter' || sendingAiMessage || !aiChatInput.trim()) return;
    event.preventDefault();
    void sendAiMessage();
  };

  const moodTexts = ['Bitkin', 'Huysuz', 'Normal', 'Enerjik', 'Mutlu'];
  const completed = [water, food, play, toilet].filter(Boolean).length;
  const percent = completed * 25;

  const aiComment = getPersonalizedComment(activePet, {
    water,
    food,
    play,
    toilet,
    mood,
    updatedAt: '',
  });

  const petName = activePet?.name?.trim() ? activePet.name : 'evcil dostun';
  const lastUserAiText = [...aiMessages].reverse().find((message) => message.role === 'user')?.text || '';
  const kittenMood = getKittenMood(aiChatInput || lastUserAiText, sendingAiMessage);
  const kittenCopy = kittenMoodText[kittenMood];
  const todayLabel = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
  }).format(new Date());

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.homeHero}>
          <View style={styles.homeHeroTextWrap}>
            <View style={styles.homeBrandRow}>
              <Text style={styles.logo}>PetCare</Text>
              <View style={styles.homeStatusPill}>
                <MaterialIcons name="auto-awesome" size={13} color="#0F766E" />
                <Text style={styles.homeStatusPillText}>AI hazır</Text>
              </View>
            </View>
            <Text style={styles.hello}>Bugün {petName} için bakım ritmi</Text>
            <Text style={styles.homeHeroSubtitle}>
              {completed}/4 görev tamamlandı • Ruh hali {moodTexts[mood - 1]}
            </Text>
          </View>
          <View style={styles.homeHeroBadge}>
            <AiKittenMascot mood="happy" size={72} />
          </View>
        </View>

        <Pressable style={styles.aiSearchBar} onPress={() => setAiChatVisible(true)}>
          <View style={styles.aiSearchMascotDot} />
          <Text style={styles.aiSearchBarText}>Selam, bir sorun mu var?</Text>
          <MaterialIcons name="arrow-forward" size={18} color="#F97316" />
        </Pressable>

        <View style={styles.heroBanner}>
          <View style={styles.heroTopRow}>
            <View style={styles.dateChip}>
              <MaterialIcons name="today" size={14} color="#F97316" />
              <Text style={styles.dateChipText}>{todayLabel}</Text>
            </View>
            <Text style={styles.progressText}>%{percent}</Text>
          </View>
          <Text style={styles.progressLabel}>Bugünkü bakım ilerlemesi</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
        </View>

        {routinePlan ? (
          <View style={styles.planCard}>
            <View style={styles.planHeaderRow}>
              <Text style={styles.planTitle}>Bugünkü Plan</Text>
              <Text style={styles.planSource}>{routinePlan.source === 'saved' ? 'Kayıtlı plan' : 'Otomatik plan'}</Text>
            </View>
            <View style={styles.planItemRow}>
              <MaterialIcons name="water-drop" size={16} color="#0EA5A3" />
              <Text style={styles.planItemText}>Su yenileme: {routinePlan.waterTime}</Text>
            </View>
            <View style={styles.planItemRow}>
              <MaterialIcons name="restaurant" size={16} color="#F97316" />
              <Text style={styles.planItemText}>Mama saatleri: {routinePlan.foodTimes.join(' • ')}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.checkGrid}>
          <CheckItem icon="water-drop" title="Su" value={water} onPress={() => updateChecklist({ water: !water })} />
          <CheckItem icon="restaurant" title="Mama" value={food} onPress={() => updateChecklist({ food: !food })} />
          <CheckItem icon="sports-tennis" title="Oyun" value={play} onPress={() => updateChecklist({ play: !play })} />
          <CheckItem icon="task-alt" title="Tuvalet" value={toilet} onPress={() => updateChecklist({ toilet: !toilet })} />
        </View>

        <View style={styles.carouselSection}>
          <View style={styles.feedHeaderRow}>
            <Text style={styles.feedTitle}>Pati Akışı</Text>
            <MaterialIcons name="view-carousel" size={18} color="#F97316" />
          </View>

          <View
            style={styles.carouselViewport}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              if (width > 0) setCarouselWidth(width);
            }}
          >
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onCarouselScrollEnd}
            >
              {dailyHighlights.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.carouselCard, { width: carouselWidth }]}
                  onPress={() => void openHighlightLink(item.link)}
                >
                  <ImageBackground source={{ uri: item.image }} style={styles.carouselImage} imageStyle={styles.carouselImageStyle}>
                    <View style={styles.carouselOverlay}>
                      <View style={styles.carouselBadge}>
                        <MaterialIcons name={item.icon} size={14} color="#FFFFFF" />
                        <Text style={styles.carouselBadgeText}>{item.label}</Text>
                      </View>
                      <Text style={styles.carouselCardTitle}>{item.title}</Text>
                      <Text style={styles.carouselCardSubtitle}>{item.subtitle}</Text>
                    </View>
                  </ImageBackground>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.carouselDotsRow}>
            {dailyHighlights.map((item, index) => (
              <View
                key={item.id}
                style={[styles.carouselDot, index === activeSlide ? styles.carouselDotActive : undefined]}
              />
            ))}
          </View>
        </View>

        <Text style={styles.question}>{petName} bugün nasıl hissediyor?</Text>
        <Text style={styles.moodText}>{moodTexts[mood - 1]}</Text>

        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={5}
          step={1}
          value={mood}
          onValueChange={(value) => setMood(value)}
          onSlidingComplete={(value) => {
            updateChecklist({ mood: value });
            void playMeow();
          }}
        />

        <View style={styles.labels}>
          <Text style={styles.labelText}>Bitkin</Text>
          <Text style={styles.labelText}>Normal</Text>
          <Text style={styles.labelText}>Mutlu</Text>
        </View>

        <View style={styles.aiBox}>
          <View style={styles.aiHeaderRow}>
            <Text style={styles.aiTitle}>Günlük AI Yorumu</Text>
            <MaterialIcons name="auto-awesome" size={18} color="#F97316" />
          </View>
          <Text style={styles.aiText}>{aiComment}</Text>
          <Text style={styles.aiHintText}>
            AI ile sohbette öğren komutu ile not eklersen cevaplar daha kişisel olur.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={aiChatVisible} animationType="slide" transparent onRequestClose={() => setAiChatVisible(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.aiModalOverlay}>
            <View style={styles.aiModalCard}>
              <View style={styles.aiModalHeader}>
                <View style={styles.aiModalTitleWrap}>
                  <Text style={styles.aiModalTitle}>PetCare AI</Text>
                  <Text style={styles.aiModalSubtitle}>
                    {activePet?.name || 'Petin'} için kişisel bakım asistanı
                  </Text>
                </View>
                <Pressable style={styles.aiModalCloseButton} onPress={() => setAiChatVisible(false)}>
                  <MaterialIcons name="close" size={20} color="#334155" />
                </Pressable>
              </View>

              <View style={styles.aiMascotPanel}>
                <AiKittenMascot mood={kittenMood} size={86} />
                <View style={styles.aiMascotTextWrap}>
                  <Text style={styles.aiMascotTitle}>{kittenCopy.title}</Text>
                  <Text style={styles.aiMascotSubtitle}>{kittenCopy.subtitle}</Text>
                </View>
              </View>

              <ScrollView
                ref={aiScrollRef}
                style={styles.aiMessagesScroll}
                contentContainerStyle={styles.aiMessagesContent}
                keyboardShouldPersistTaps="handled"
              >
                {aiMessages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <View key={message.id} style={[styles.aiMessageRow, isUser ? styles.aiMessageRowUser : undefined]}>
                      <View style={[styles.aiBubble, isUser ? styles.aiBubbleUser : styles.aiBubbleAssistant]}>
                        <Text style={[styles.aiBubbleText, isUser ? styles.aiBubbleTextUser : styles.aiBubbleTextAssistant]}>
                          {message.text}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                {sendingAiMessage ? (
                  <View style={styles.aiTypingRow}>
                    <View style={styles.aiTypingBubble}>
                      <Text style={styles.aiTypingText}>Yanıt hazırlanıyor...</Text>
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              <ScrollView
                horizontal
                style={styles.aiQuickPromptsScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.aiQuickPromptsRow}
                keyboardShouldPersistTaps="handled"
              >
                {quickAiPrompts.map((item) => (
                  <Pressable key={item.id} style={styles.aiQuickPromptChip} onPress={() => void sendAiMessage(item.prompt)}>
                    <MaterialIcons name={item.icon} size={14} color="#F97316" />
                    <Text style={styles.aiQuickPromptText}>{item.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.aiInputRow}>
                <TextInput
                  style={styles.aiInput}
                  value={aiChatInput}
                  onChangeText={setAiChatInput}
                  placeholder='Soru sor veya "öğren: ..." yaz'
                  placeholderTextColor="#64748B"
                  multiline
                  onKeyPress={handleAiInputKeyPress}
                  autoFocus={Platform.OS !== 'web' ? true : false}
                />
                <Pressable
                  style={[styles.aiSendButton, !aiChatInput.trim() || sendingAiMessage ? styles.aiSendButtonDisabled : undefined]}
                  onPress={() => void sendAiMessage()}
                  disabled={!aiChatInput.trim() || sendingAiMessage}
                >
                  <MaterialIcons name="send" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

type CheckItemProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  value: boolean;
  onPress: () => void;
};

function CheckItem({ icon, title, value, onPress }: CheckItemProps) {
  return (
    <Pressable style={styles.checkItem} onPress={onPress}>
      <View style={[styles.checkIconWrap, value ? styles.checkIconWrapActive : undefined]}>
        <MaterialIcons name={icon} size={18} color={value ? '#FFFFFF' : '#0EA5A3'} />
      </View>
      <View style={styles.checkTextWrap}>
        <Text style={styles.checkTitle}>{title}</Text>
        <Text style={[styles.checkStatusText, value ? styles.checkStatusTextActive : undefined]}>
          {value ? 'Tamamlandı' : 'Bekliyor'}
        </Text>
      </View>
      <MaterialIcons name={value ? 'check-circle' : 'radio-button-unchecked'} size={20} color={value ? '#16A34A' : '#94A3B8'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kittenStage: {
    position: 'relative',
  },
  kittenTail: {
    position: 'absolute',
    backgroundColor: '#67E8F9',
    borderWidth: 4,
    borderColor: '#0EA5A3',
    transform: [{ rotate: '28deg' }],
    opacity: 0.92,
  },
  kittenEar: {
    position: 'absolute',
    backgroundColor: '#38BDF8',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kittenInnerEar: {
    width: '48%',
    height: '48%',
    borderRadius: 999,
    backgroundColor: '#F9A8D4',
  },
  kittenHead: {
    position: 'absolute',
    backgroundColor: '#67E8F9',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#0EA5A3',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  kittenStripe: {
    position: 'absolute',
    width: 6,
    height: 14,
    borderRadius: 6,
    backgroundColor: '#0EA5A3',
    opacity: 0.55,
  },
  kittenEye: {
    position: 'absolute',
    width: 15,
    height: 18,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kittenPupil: {
    width: 8,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#172554',
  },
  kittenEyeShine: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    marginLeft: 2,
    marginTop: 1,
  },
  kittenSleepyEye: {
    width: 13,
    height: 3,
    borderRadius: 3,
    backgroundColor: '#0F172A',
  },
  kittenBrow: {
    position: 'absolute',
    top: '25%',
    width: 15,
    height: 3,
    borderRadius: 3,
    backgroundColor: '#0F172A',
  },
  kittenBrowLeft: {
    left: '25%',
    transform: [{ rotate: '18deg' }],
  },
  kittenBrowRight: {
    right: '25%',
    transform: [{ rotate: '-18deg' }],
  },
  kittenBlush: {
    position: 'absolute',
    width: 10,
    height: 6,
    borderRadius: 8,
    backgroundColor: '#F9A8D4',
    opacity: 0.9,
  },
  kittenNose: {
    position: 'absolute',
    left: '50%',
    width: 7,
    height: 5,
    marginLeft: -3.5,
    borderRadius: 5,
    backgroundColor: '#F97316',
  },
  kittenWhisker: {
    position: 'absolute',
    width: 17,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  kittenWhiskerLeftTop: {
    left: '13%',
    top: '56%',
    transform: [{ rotate: '8deg' }],
  },
  kittenWhiskerLeftBottom: {
    left: '14%',
    top: '64%',
    transform: [{ rotate: '-8deg' }],
  },
  kittenWhiskerRightTop: {
    right: '13%',
    top: '56%',
    transform: [{ rotate: '-8deg' }],
  },
  kittenWhiskerRightBottom: {
    right: '14%',
    top: '64%',
    transform: [{ rotate: '8deg' }],
  },
  kittenSmile: {
    position: 'absolute',
    left: '50%',
    width: 20,
    height: 10,
    marginLeft: -10,
    borderBottomWidth: 2,
    borderBottomColor: '#0F172A',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  kittenMouthO: {
    position: 'absolute',
    left: '50%',
    width: 9,
    height: 9,
    marginLeft: -4.5,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0F172A',
    backgroundColor: '#FFE7D6',
  },
  kittenMouthConcern: {
    position: 'absolute',
    left: '50%',
    width: 18,
    height: 9,
    marginLeft: -9,
    borderTopWidth: 2,
    borderTopColor: '#0F172A',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 30,
    backgroundColor: '#FFF8F0',
  },
  homeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFE7D6',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    shadowColor: '#F97316',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  homeHeroTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  homeBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  homeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7FFF5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 4,
  },
  homeStatusPillText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '800',
  },
  hello: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1E293B',
  },
  homeHeroSubtitle: {
    marginTop: 6,
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  homeHeroBadge: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  aiSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    shadowColor: '#F97316',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  aiSearchMascotDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#22C55E',
    borderWidth: 4,
    borderColor: '#DCFCE7',
  },
  aiSearchBarText: {
    flex: 1,
    marginHorizontal: 8,
    color: '#7C2D12',
    fontSize: 14,
    fontWeight: '800',
  },
  heroBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dateChipText: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EA580C',
  },
  progressLabel: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#F97316',
  },
  checkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    marginBottom: 14,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 12,
    marginBottom: 12,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  planSource: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '700',
  },
  planItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  planItemText: {
    marginLeft: 6,
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  checkItem: {
    backgroundColor: '#FFFFFF',
    width: '48.7%',
    minHeight: 82,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    marginRight: 9,
  },
  checkIconWrapActive: {
    backgroundColor: '#22C55E',
  },
  checkTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  checkTitle: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '800',
  },
  checkStatusText: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  checkStatusTextActive: {
    color: '#15803D',
  },
  carouselSection: {
    marginBottom: 16,
  },
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  feedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  carouselViewport: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  carouselCard: {
    height: 176,
  },
  carouselImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  carouselImageStyle: {
    borderRadius: 14,
  },
  carouselOverlay: {
    padding: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    gap: 5,
  },
  carouselBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(249, 115, 22, 0.9)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  carouselBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  carouselCardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  carouselCardSubtitle: {
    color: '#F8FAFC',
    fontSize: 12,
    lineHeight: 17,
  },
  carouselDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  carouselDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: '#CBD5E1',
  },
  carouselDotActive: {
    width: 18,
    backgroundColor: '#F97316',
  },
  question: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    color: '#0F172A',
  },
  moodText: {
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6,
    color: '#0F766E',
  },
  slider: {
    width: '100%',
    height: 38,
    marginTop: 4,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  labelText: {
    fontSize: 12,
    color: '#475569',
  },
  aiBox: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    color: '#0F172A',
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  openChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F97316',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  openChatButtonText: {
    marginLeft: 4,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  aiText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 21,
  },
  aiHintText: {
    marginTop: 8,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  aiModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
  },
  aiModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    flex: 1,
    marginTop: 44,
    borderWidth: 0,
  },
  aiModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  aiModalTitleWrap: {
    flex: 1,
    marginRight: 8,
  },
  aiModalTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  aiModalSubtitle: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  aiModalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiMascotPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1E6',
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  aiMascotTextWrap: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  aiMascotTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  aiMascotSubtitle: {
    marginTop: 3,
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  aiMessagesScroll: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  aiMessagesContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  aiMessageRow: {
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  aiMessageRowUser: {
    alignItems: 'flex-end',
  },
  aiBubble: {
    maxWidth: '84%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  aiBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#F97316',
    borderBottomRightRadius: 6,
  },
  aiBubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 6,
  },
  aiBubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  aiBubbleTextUser: {
    color: '#FFFFFF',
  },
  aiBubbleTextAssistant: {
    color: '#1E293B',
  },
  aiTypingRow: {
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  aiTypingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiTypingText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  aiQuickPromptsScroll: {
    flexGrow: 0,
    height: 52,
    maxHeight: 52,
    backgroundColor: '#FFFDF8',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  aiQuickPromptsRow: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiQuickPromptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginRight: 7,
  },
  aiQuickPromptText: {
    marginLeft: 5,
    color: '#EA580C',
    fontWeight: '700',
    fontSize: 12,
  },
  aiInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  aiInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 92,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 21,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#0F172A',
    fontSize: 14,
    textAlignVertical: 'top',
    backgroundColor: '#FFFDF8',
  },
  aiSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    marginLeft: 8,
  },
  aiSendButtonDisabled: {
    opacity: 0.55,
  },
});
