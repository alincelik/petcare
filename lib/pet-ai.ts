type PetSnapshot = {
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

type OwnerSnapshot = {
  fullName: string;
  username: string;
  city: string;
  bio: string;
};

type RoutineSnapshot = {
  waterTime: string;
  foodTimes: string[];
  source: 'saved' | 'auto';
};

type DailySnapshot = {
  water: boolean;
  food: boolean;
  play: boolean;
  toilet: boolean;
  mood: number;
};

type LogSnapshot = DailySnapshot & {
  date: string;
};

type VetHistoryItem = {
  date: string;
  note: string;
};

export type PetAiRequest = {
  userMessage: string;
  pet: PetSnapshot | null;
  owner: OwnerSnapshot | null;
  routinePlan: RoutineSnapshot | null;
  todayLog: DailySnapshot;
  recentLogs: LogSnapshot[];
  vetHistory: VetHistoryItem[];
  memoryNotes: string[];
};

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() || '';
const OPENAI_MODEL = process.env.EXPO_PUBLIC_PET_AI_MODEL?.trim() || 'gpt-4o-mini';

export const remotePetAiEnabled = OPENAI_API_KEY.length > 0;

type OpenAiMessage = {
  role: 'system' | 'user';
  content: string;
};

type OpenAiChatResponse = {
  choices?: {
    message?: {
      content?: string | null;
    };
  }[];
  error?: {
    message?: string;
  };
};

const buildSystemPrompt = (): string => {
  return [
    'Sen PetCare uygulamasinin pet sagligi ve bakimi konusunda cok guclu bilgiye sahip AI asistani olarak gorev yapiyorsun.',
    'Veteriner hekim hassasiyetinde, bilimsel ve mantikli konus; ancak tani koyma ve ilac dozu verme.',
    'Yaniti daima Turkce ver.',
    'Kullanicinin sordugu soruya dogrudan cevap ver; gereksiz ozur, selamlama veya genel giris yazma.',
    'Kullanicinin pet profili, gunluk bakim gecmisi, saglik notlari ve sahibin verdigi ozel notlara gore cevap ver.',
    'Belirti belirsizse cevap uydurma; once 2-3 netlestirici soru sor.',
    'Cevabin kisa, net, sakin ve uygulanabilir olsun. 4 cumleyi ya da 3 maddeyi gecme.',
    'Hazir buton metinlerini, onceki cevaplari veya ayni uyarilari tekrar etme. Her cevapta sadece soruyla ilgili bilgi ver.',
    'Tani koyma, ilac dozu verme veya acil durumlarda gecikmeye yol acacak yorum yapma.',
    'Acil belirti supheleniyorsan acikca "veterinere hemen basvur" de ama bunu sadece gerekli oldugunda kullan.',
    'Kirmizi bayrak yoksa kullaniciyi otomatik olarak klinik, ucretli gorusme veya randevu sistemine yonlendirme.',
    'Cevap bicimi: bir kisa ozet cumlesi ve gerekiyorsa en fazla 3 madde eylem plani.',
    'Herhangi bir etiket, teknik kod veya özel işaret yazma.',
  ].join(' ');
};

const buildUserPrompt = (request: PetAiRequest): string => {
  return JSON.stringify(
    {
      soru: request.userMessage,
      pet: request.pet,
      sahip: request.owner,
      bugun: request.todayLog,
      rutin: request.routinePlan,
      sonGunlukKayitlar: request.recentLogs.slice(0, 14),
      veterinerGecmisi: request.vetHistory.slice(0, 10),
      kullanicidanOgrenilenNotlar: request.memoryNotes.slice(0, 15),
    },
    null,
    2
  );
};

export const generateVeterinaryAssistantReply = async (
  request: PetAiRequest
): Promise<{ text: string; source: 'remote' | 'fallback'; error?: string }> => {
  if (!remotePetAiEnabled) {
    return {
      text: 'OpenAI anahtari tanimli degil. Simdilik yerel AI ile devam ediyorum.',
      source: 'fallback',
      error: 'missing_api_key',
    };
  }

  const messages: OpenAiMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(request) },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.15,
        max_tokens: 260,
        messages,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as OpenAiChatResponse;
    if (!response.ok) {
      const errorMessage = payload.error?.message || `HTTP_${response.status}`;
      return {
        text: 'Uzak AI servisine su an ulasilamadi. Yerel ozet modunda devam ediyorum.',
        source: 'fallback',
        error: errorMessage,
      };
    }

    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return {
        text: 'AI yaniti bos dondu. Soruyu biraz daha netlestirip tekrar deneyelim.',
        source: 'fallback',
        error: 'empty_response',
      };
    }

    return { text, source: 'remote' };
  } catch (error) {
    return {
      text: 'AI baglantisinda gecici bir sorun olustu. Yerel yorum ile devam ediyorum.',
      source: 'fallback',
      error: error instanceof Error ? error.message : 'request_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
};
