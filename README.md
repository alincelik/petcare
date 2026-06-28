# PetCare

## Proje Bilgileri

- **Proje adı:** PetCare
- **Öğrenci adı soyadı:** Alin Çelik
- **Öğrenci numarası:** 24010501096
- **GitHub proje bağlantısı:** https://github.com/alincelik/petcare

## Projenin Amacı ve Kısa Açıklaması

PetCare, evcil hayvan sahiplerinin günlük bakım rutinlerini takip etmesini, pet profillerini düzenlemesini ve yapay zeka destekli bakım önerileri almasını sağlayan mobil uygulama projesidir. Uygulama Expo Go ile çalışacak şekilde React Native ve Expo Router kullanılarak geliştirilmiştir.

Uygulamada su yenileme, mama verme, oyun, tuvalet durumu, ruh hali takibi, kişiselleştirilmiş pet profili, yapay zeka sohbeti, bakım takvimi, sosyal keşif alanı, ilan paylaşımı ve mesajlaşma özellikleri bulunmaktadır. Amaç, evcil hayvan bakımını daha düzenli, kişisel ve kullanıcı dostu hale getirmektir.

## Temel Özellikler

- Günlük bakım kontrol listesi: su, mama, oyun ve tuvalet takibi.
- Ruh hali seçimi ve günlük bakım yüzdesi.
- Pet bilgilerine göre kişiselleştirilen AI bakım yorumu.
- AI sohbet ekranı: mama, su, rutin, davranış ve sağlık belirtileri hakkında Türkçe destek.
- Birden fazla pet profili oluşturma, düzenleme ve silme.
- Pet profil fotoğrafı ve kapak fotoğrafı ekleme.
- İnsan profili, kullanıcı adı, şehir ve kısa profil bilgileri.
- Petler arasında arkadaş, kardeş veya sevgili bağlantısı oluşturma.
- Keşfet akışı: gönderi paylaşma, fotoğraf/video ekleme, beğeni, yorum ve yorum beğenme.
- İlanlar: yuva arama, kayıp pet ve eş arama ilanları.
- Mesajlar: kullanıcı arama, sohbet, takip etme, engelleme ve raporlama.
- Takvim: veteriner ziyareti, aşı, yıllık aşı, iç-dış parazit ve kontrol kayıtları.
- Yakındaki pati dostları alanı: konum izni mantığı ve örnek sosyal keşif görünümü.
- Supabase ile kimlik doğrulama altyapısı.
- OpenAI API anahtarı tanımlanırsa uzaktan AI yanıt desteği.

## Kullanılan Teknolojiler ve Kütüphaneler

- **React Native:** Mobil uygulama arayüzü geliştirme.
- **Expo:** Expo Go ile geliştirme ve test ortamı.
- **Expo Router:** Sayfa ve tab yönlendirme yapısı.
- **TypeScript:** Tip güvenliği.
- **React Navigation:** Tab navigasyon altyapısı.
- **AsyncStorage:** Yerel veri saklama.
- **Supabase:** Kullanıcı girişi, kayıt ve profil senkronizasyonu için backend altyapısı.
- **OpenAI API:** Yapay zeka destekli pet bakım asistanı.
- **Expo Image Picker:** Galeri ve kamera üzerinden fotoğraf/video seçme.
- **Expo AV:** Ses ve video oynatma.
- **Expo Notifications:** Hatırlatıcı/bildirim altyapısı.
- **Expo Haptics:** Tab geçişlerinde dokunsal geri bildirim.
- **@expo/vector-icons:** Uygulama ikonları.

## Proje Klasör Yapısı

```text
petcare/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Alt tab navigasyonu
│   │   ├── index.tsx            # Ana sayfa, günlük bakım ve AI sohbet
│   │   ├── explore.tsx          # Sosyal akış, ilanlar, takvim, yakın dostlar
│   │   ├── messages.tsx         # Mesajlaşma ekranı
│   │   └── profile.tsx          # Pet ve insan profili
│   ├── _layout.tsx              # Uygulama ana layout yapısı
│   ├── index.tsx                # Başlangıç yönlendirmesi
│   ├── onboarding.tsx           # Hızlı kurulum ekranı
│   └── sign-in.tsx              # Giriş/kayıt ekranı
├── assets/
│   ├── images/                  # Uygulama ikonları ve görseller
│   ├── meow.mp3                 # Ses dosyası
│   └── meow.wav                 # Ses dosyası
├── components/                  # Ortak arayüz bileşenleri
├── constants/                   # Tema sabitleri
├── hooks/                       # Auth, tema ve onboarding hookları
├── lib/
│   ├── pet-ai.ts                # AI asistan istek ve fallback mantığı
│   └── supabase.ts              # Supabase istemcisi
├── supabase/
│   └── schema.sql               # Supabase tablo şeması
├── package.json                 # Bağımlılıklar ve komutlar
├── app.json                     # Expo uygulama ayarları
└── README.md                    # Proje dokümantasyonu
```

## Kurulum Adımları

1. Projeyi bilgisayara klonlayın. GitHub reposunda `Code > HTTPS` bağlantısını kopyalayıp aşağıdaki komutta kullanın:

```bash
git clone https://github.com/alincelik/petcare.git
cd petcare
```

2. Bağımlılıkları yükleyin:

```bash
npm install
```

3. Ortam değişkenleri dosyasını hazırlayın:

```bash
cp .env.example .env
```

4. `.env` dosyasında gerekli alanları doldurun:

```text
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_OPENAI_API_KEY=
EXPO_PUBLIC_PET_AI_MODEL=gpt-4o-mini
```

Not: Supabase ve OpenAI bilgileri boş bırakılırsa uygulamanın bazı uzak servis özellikleri sınırlı çalışır. Yerel bakım takibi ve arayüz özellikleri AsyncStorage ile çalışmaya devam eder.

## Çalıştırma ve Kullanım Talimatları

Projeyi başlatmak için:

```bash
npm start
```

veya:

```bash
npx expo start
```

Kullanım:

1. Terminalde çıkan QR kodu Expo Go uygulaması ile okutun.
2. İlk açılışta giriş/kayıt veya hızlı kurulum ekranını tamamlayın.
3. Profil sekmesinden pet bilgilerini ve insan profilini doldurun.
4. Ana sayfadan günlük bakım görevlerini işaretleyin ve ruh hali seçin.
5. AI sohbet alanına pet hakkında soru yazın.
6. Keşfet sekmesinden sosyal akış, ilanlar, takvim ve yakın dostlar alanlarını kullanın.
7. Mesajlar sekmesinden kullanıcılarla sohbet akışını test edin.

Web üzerinden test etmek için:

```bash
npm run web
```

## Test ve Kontrol

Teslimden önce proje aşağıdaki kontrollerle çalıştırılabilir:

```bash
npx tsc --noEmit
npx expo lint
npm start
```

Bu kontroller TypeScript hatalarını, temel lint uyarılarını ve Expo geliştirme sunucusunun çalışıp çalışmadığını görmek için kullanılır.

## Ekran Görüntüleri

Ekran görüntüleri teslimden önce GitHub reposuna eklenebilir. Önerilen klasör:

```text
docs/screenshots/
```

Önerilen ekran görüntüleri:

- Ana sayfa ve günlük bakım ekranı
- AI sohbet ekranı
- Profil ekranı
- Keşfet sosyal akışı
- Takvim ekranı
- Mesajlaşma ekranı

## GitHub Proje Bağlantısı

```text
https://github.com/alincelik/petcare
```

## Geliştirici

- **Ad soyad:** Alin Çelik
- **Öğrenci numarası:** 24010501096
- **GitHub:** https://github.com/alincelik
- **Proje reposu:** https://github.com/alincelik/petcare

## GitHub'a Yüklerken Dikkat Edilecekler

- `.env` dosyası GitHub'a yüklenmemelidir. Bu dosyada API anahtarları ve proje gizli bilgileri bulunabilir.
- `node_modules/` klasörü GitHub'a yüklenmemelidir. Bağımlılıklar `npm install` ile tekrar kurulabilir.
- `package.json` ve `package-lock.json` dosyaları yüklenmelidir.
- `README.md` dosyasında GitHub bağlantısı mutlaka çalışır halde bulunmalıdır.
- Repo herkese açık olacaksa bağlantı test edilmelidir. Repo gizli kalacaksa öğretmene erişim izni verilmelidir.

## Kaynakça ve Yararlanılan Bağlantılar

- Expo dokümantasyonu: https://docs.expo.dev/
- React Native dokümantasyonu: https://reactnative.dev/
- Expo Router dokümantasyonu: https://docs.expo.dev/router/introduction/
- Supabase dokümantasyonu: https://supabase.com/docs
- OpenAI API dokümantasyonu: https://platform.openai.com/docs
- AsyncStorage dokümantasyonu: https://react-native-async-storage.github.io/async-storage/
- Expo Image Picker: https://docs.expo.dev/versions/latest/sdk/imagepicker/
- Expo Notifications: https://docs.expo.dev/versions/latest/sdk/notifications/

## Teslim Notu

Hocanın istediği teslim formatına göre ödev yükleme alanına verilecek arşiv adı şu şekilde olmalıdır:

```text
24010501096_petcare.rar
```

Arşivin içindeki Markdown dosyası öğrenci numarası ile adlandırılmalıdır:

```text
24010501096.md
```

Bu proje için teslim dosyası:

```text
24010501096_petcare.rar
24010501096.md
```

Teslimden önce GitHub bağlantısının çalıştığı mutlaka kontrol edilmelidir.
Hocanın uyarısına göre arşivin içindeki `.md` dosyası yalnızca öğrenci numarasıyla adlandırılmış dosya olmalıdır.
