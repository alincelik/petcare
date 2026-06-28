import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MESSAGES_KEY = 'petCommunityMessagesV1';
const OWNER_PROFILE_KEY = 'petOwnerProfileV1';

type OwnerProfile = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  city: string;
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
  videoUri?: string;
  createdAt: string;
  senderType: 'visitor' | 'owner';
};

type Conversation = {
  id: string;
  participantName: string;
  username: string;
  contact: string;
  presenceLabel: string;
  online: boolean;
  messages: CommunityMessage[];
  lastMessage: CommunityMessage;
  unread: boolean;
};

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeMessage = (input: unknown): CommunityMessage | null => {
  if (!input || typeof input !== 'object') return null;
  const record = input as Partial<CommunityMessage>;
  const id = getString(record.id);
  const text = getString(record.text);
  const senderName = getString(record.senderName);
  if (!id || !text || !senderName) return null;

  return {
    id,
    listingId: getString(record.listingId) || 'community',
    conversationId: getString(record.conversationId),
    senderName,
    senderUsername: getString(record.senderUsername),
    senderContact: getString(record.senderContact),
    text,
    imageUri: getString(record.imageUri),
    videoUri: getString(record.videoUri),
    createdAt: getString(record.createdAt) || new Date().toISOString(),
    senderType: record.senderType === 'owner' ? 'owner' : 'visitor',
  };
};

const defaultOwnerProfile: OwnerProfile = {
  fullName: '',
  username: '',
  email: '',
  phone: '',
  city: '',
};

const seedMessages: CommunityMessage[] = [
  {
    id: 'seed-message-sima-1',
    listingId: 'demo',
    conversationId: 'demo-sima',
    senderName: 'Şima',
    senderUsername: 'sima.pati',
    senderContact: 'sima@example.com',
    text: 'Selam, Elsa için açtığın paylaşımı gördüm. Çok tatlı duruyor, birkaç detay sorabilir miyim?',
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    senderType: 'visitor',
  },
  {
    id: 'seed-message-sima-2',
    listingId: 'demo',
    conversationId: 'demo-sima',
    senderName: 'Sen',
    senderUsername: 'ben',
    senderContact: '',
    text: 'Tabii, buradan yazabilirsin.',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    senderType: 'owner',
  },
  {
    id: 'seed-message-arya-1',
    listingId: 'demo',
    conversationId: 'demo-arya',
    senderName: 'Arya',
    senderUsername: 'aryaninpatileri',
    senderContact: 'arya@example.com',
    text: 'Merhaba, pazar günkü pati buluşmasına katılmayı düşünüyor musunuz?',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    senderType: 'visitor',
  },
  {
    id: 'seed-message-mert-1',
    listingId: 'demo',
    conversationId: 'demo-mert',
    senderName: 'Mert',
    senderUsername: 'mertveleo',
    senderContact: 'mert@example.com',
    text: 'Leo da aynı mamayı kullanıyor. Geçiş sürecini nasıl yaptınız?',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    senderType: 'visitor',
  },
];

const formatMessageTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Şimdi';

  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }).format(date);
};

const getConversationAvatarColor = (name: string): string => {
  const palette = ['#38BDF8', '#60A5FA', '#F472B6', '#34D399', '#FBBF24'];
  const sum = name.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[sum % palette.length];
};

const getPresence = (conversationId: string): { label: string; online: boolean } => {
  if (conversationId.includes('sima')) return { label: 'çevrim içi', online: true };
  if (conversationId.includes('arya')) return { label: 'son görülme 2 saat önce', online: false };
  if (conversationId.includes('mert')) return { label: 'son görülme dün', online: false };
  return { label: 'son görülme kısa süre önce', online: false };
};

export default function MessagesScreen() {
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(defaultOwnerProfile);
  const [storedMessages, setStoredMessages] = useState<CommunityMessage[]>([]);
  const [query, setQuery] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [followedConversations, setFollowedConversations] = useState<Record<string, boolean>>({});
  const [blockedConversations, setBlockedConversations] = useState<Record<string, boolean>>({});
  const [reportedConversations, setReportedConversations] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const [draftImageUri, setDraftImageUri] = useState('');
  const [draftVideoUri, setDraftVideoUri] = useState('');
  const inputRef = useRef<TextInputType | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [ownerRaw, messagesRaw] = await Promise.all([
        AsyncStorage.getItem(OWNER_PROFILE_KEY),
        AsyncStorage.getItem(MESSAGES_KEY),
      ]);

      if (ownerRaw) {
        const parsedOwner = JSON.parse(ownerRaw) as Partial<OwnerProfile>;
        setOwnerProfile({
          fullName: getString(parsedOwner.fullName),
          username: getString(parsedOwner.username),
          email: getString(parsedOwner.email),
          phone: getString(parsedOwner.phone),
          city: getString(parsedOwner.city),
        });
      } else {
        setOwnerProfile(defaultOwnerProfile);
      }

      const parsedMessages = messagesRaw ? (JSON.parse(messagesRaw) as unknown[]) : [];
      setStoredMessages(parsedMessages.map(normalizeMessage).filter((item): item is CommunityMessage => Boolean(item)));
    } catch (error) {
      console.log('Mesaj verisi okunamadı:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const saveMessages = async (nextMessages: CommunityMessage[]) => {
    setStoredMessages(nextMessages);
    try {
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(nextMessages));
    } catch (error) {
      console.log('Mesaj kaydedilemedi:', error);
    }
  };

  const conversations = useMemo<Conversation[]>(() => {
    const map = new Map<string, CommunityMessage[]>();
    [...seedMessages, ...storedMessages].forEach((message) => {
      const id = message.conversationId || `${message.listingId}-${message.senderContact || message.senderName}`;
      map.set(id, [...(map.get(id) || []), message]);
    });

    return Array.from(map.entries())
      .map(([id, messages]) => {
        const sorted = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const lastMessage = sorted[sorted.length - 1];
        const visitorMessage = [...sorted].reverse().find((message) => message.senderType === 'visitor') || lastMessage;
        return {
          id,
          participantName: visitorMessage.senderName,
          username: visitorMessage.senderUsername || 'pati.dostu',
          contact: visitorMessage.senderContact,
          presenceLabel: getPresence(id).label,
          online: getPresence(id).online,
          messages: sorted,
          lastMessage,
          unread: lastMessage.senderType === 'visitor',
        };
      })
      .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  }, [storedMessages]);

  const filteredConversations = useMemo(() => {
    const visibleConversations = conversations.filter((conversation) => !blockedConversations[conversation.id]);
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR').replace(/^@+/, '');
    if (!normalizedQuery) return visibleConversations;

    return visibleConversations.filter((conversation) => {
      const haystack = [
        conversation.participantName,
        conversation.username,
        conversation.lastMessage.text,
        conversation.contact,
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return haystack.includes(normalizedQuery);
    });
  }, [blockedConversations, conversations, query]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) || null;

  const sendMessage = async () => {
    if (!selectedConversation || (!draft.trim() && !draftImageUri && !draftVideoUri)) return;

    const ownerName = ownerProfile.fullName.trim() || 'Sen';
    const fallbackText = draftVideoUri ? 'Video gönderildi' : 'Fotoğraf gönderildi';
    const nextMessage: CommunityMessage = {
      id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      listingId: selectedConversation.lastMessage.listingId || 'community',
      conversationId: selectedConversation.id,
      senderName: ownerName,
      senderUsername: ownerProfile.username.trim() || 'ben',
      senderContact: ownerProfile.email || ownerProfile.phone,
      text: draft.trim() || fallbackText,
      imageUri: draftImageUri,
      videoUri: draftVideoUri,
      createdAt: new Date().toISOString(),
      senderType: 'owner',
    };

    await saveMessages([...storedMessages, nextMessage]);
    setDraft('');
    setDraftImageUri('');
    setDraftVideoUri('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('İzin gerekli', 'Fotoğraf eklemek için izin vermelisin.');
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.75,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.75,
            });

      if (!result.canceled && result.assets[0]?.uri) {
        setDraftImageUri(result.assets[0].uri);
        setDraftVideoUri('');
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } catch (error) {
      console.log('Mesaj fotoğrafı seçilemedi:', error);
    }
  };

  const pickVideo = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('İzin gerekli', 'Video eklemek için galeri izni vermelisin.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setDraftVideoUri(result.assets[0].uri);
        setDraftImageUri('');
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } catch (error) {
      console.log('Mesaj videosu seçilemedi:', error);
    }
  };

  const closeChat = () => {
    setSelectedConversationId('');
    setDraft('');
    setDraftImageUri('');
    setDraftVideoUri('');
  };

  const toggleFollow = (conversationId: string) => {
    setFollowedConversations((current) => ({
      ...current,
      [conversationId]: !current[conversationId],
    }));
  };

  const blockConversation = (conversation: Conversation) => {
    Alert.alert('Kullanıcı engellensin mi?', `${conversation.participantName} artık mesaj listende görünmez.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: () => {
          setBlockedConversations((current) => ({ ...current, [conversation.id]: true }));
          closeChat();
        },
      },
    ]);
  };

  const openConversationMenu = (conversation: Conversation) => {
    Alert.alert(conversation.participantName, 'Sohbet için işlem seç.', [
      {
        text: reportedConversations[conversation.id] ? 'Rapor alındı' : 'Kullanıcıyı bildir',
        onPress: () => {
          if (reportedConversations[conversation.id]) return;
          setReportedConversations((current) => ({ ...current, [conversation.id]: true }));
          Alert.alert('Rapor alındı', 'Bu kullanıcı inceleme listesine eklendi.');
        },
      },
      {
        text: 'Kullanıcıyı engelle',
        style: 'destructive',
        onPress: () => blockConversation(conversation),
      },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Pati topluluğu</Text>
            <Text style={styles.title}>Mesajlar</Text>
          </View>
          <View style={styles.headerMascot}>
            <MaterialIcons name="pets" size={24} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#64748B" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Kullanıcı, pet adı veya mesaj ara"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>

        <ScrollView style={styles.threadList} contentContainerStyle={styles.threadListContent} keyboardShouldPersistTaps="handled">
          {filteredConversations.map((conversation) => (
            <Pressable
              key={conversation.id}
              style={styles.threadCard}
              onPress={() => {
                setSelectedConversationId(conversation.id);
                requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
              }}
            >
              <Avatar name={conversation.participantName} size={54} />
              <View style={styles.threadBody}>
                <View style={styles.threadTopRow}>
                  <Text style={styles.threadName}>{conversation.participantName}</Text>
                  <Text style={styles.threadTime}>{formatMessageTime(conversation.lastMessage.createdAt)}</Text>
                </View>
                <Text style={styles.threadUsername}>@{conversation.username}</Text>
                <View style={styles.presenceRow}>
                  <View style={[styles.presenceDot, conversation.online ? styles.presenceDotOnline : styles.presenceDotAway]} />
                  <Text style={styles.presenceText}>{conversation.presenceLabel}</Text>
                </View>
                <Text numberOfLines={1} style={styles.threadPreview}>
                  {conversation.lastMessage.senderType === 'owner' ? 'Sen: ' : ''}
                  {conversation.lastMessage.text}
                </Text>
                {followedConversations[conversation.id] ? <Text style={styles.followedLabel}>Takip ediliyor</Text> : null}
              </View>
              {conversation.unread ? <View style={styles.unreadDot} /> : null}
            </Pressable>
          ))}

          {filteredConversations.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="chat-bubble-outline" size={24} color="#F97316" />
              </View>
              <Text style={styles.emptyTitle}>Sohbet bulunamadı</Text>
              <Text style={styles.emptyText}>Kullanıcı adı, pet adı veya mesaj içeriğiyle tekrar ara.</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <Modal visible={Boolean(selectedConversation)} animationType="slide" onRequestClose={closeChat}>
        <SafeAreaView style={styles.chatSafeArea} edges={['top']}>
          <KeyboardAvoidingView
            style={styles.chatKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
          >
            <View style={styles.chatHeader}>
              <Pressable style={styles.backButton} onPress={closeChat}>
                <MaterialIcons name="arrow-back" size={22} color="#0F172A" />
              </Pressable>
              <Avatar name={selectedConversation?.participantName || 'Pati'} size={38} />
              <View style={styles.chatHeaderText}>
                <Text style={styles.chatName}>{selectedConversation?.participantName}</Text>
                <Text style={styles.chatUsername}>
                  @{selectedConversation?.username || 'pati.dostu'} • {selectedConversation?.presenceLabel || 'son görülme kısa süre önce'}
                </Text>
              </View>
              <Pressable
                style={styles.moreButton}
                onPress={() => {
                  if (selectedConversation) openConversationMenu(selectedConversation);
                }}
              >
                <MaterialIcons name="more-horiz" size={22} color="#334155" />
              </Pressable>
            </View>

            {selectedConversation ? (
              <View style={styles.chatActionRow}>
                <Pressable style={styles.chatActionButton} onPress={() => toggleFollow(selectedConversation.id)}>
                  <MaterialIcons
                    name={followedConversations[selectedConversation.id] ? 'check-circle' : 'person-add'}
                    size={16}
                    color={followedConversations[selectedConversation.id] ? '#0F766E' : '#F97316'}
                  />
                  <Text
                    style={[
                      styles.chatActionText,
                      followedConversations[selectedConversation.id] ? styles.chatActionTextGreen : null,
                    ]}
                  >
                    {followedConversations[selectedConversation.id] ? 'Takip ediliyor' : 'Takip et'}
                  </Text>
                </Pressable>
                <Pressable style={styles.chatActionButton} onPress={() => blockConversation(selectedConversation)}>
                  <MaterialIcons name="block" size={16} color="#E11D48" />
                  <Text style={[styles.chatActionText, styles.chatActionTextRose]}>Engelle</Text>
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={styles.chatScroll}
              contentContainerStyle={styles.chatContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {selectedConversation?.messages.map((message) => {
                const isMine = message.senderType === 'owner';
                return (
                  <View key={message.id} style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : undefined]}>
                    <View style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                      {message.imageUri ? <Image source={{ uri: message.imageUri }} style={styles.messageImage} /> : null}
                      {message.videoUri ? (
                        <Video
                          source={{ uri: message.videoUri }}
                          style={styles.messageVideo}
                          resizeMode={ResizeMode.COVER}
                          useNativeControls
                        />
                      ) : null}
                      <Text style={[styles.messageText, isMine ? styles.messageTextMine : undefined]}>{message.text}</Text>
                      <View style={styles.messageMetaRow}>
                        <Text style={[styles.messageTime, isMine ? styles.messageTimeMine : undefined]}>
                          {formatMessageTime(message.createdAt)}
                        </Text>
                        {isMine ? <MaterialIcons name="done-all" size={13} color="#FED7AA" /> : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {draftImageUri ? (
              <View style={styles.imageDraftRow}>
                <Image source={{ uri: draftImageUri }} style={styles.imageDraft} />
                <Pressable style={styles.imageDraftRemove} onPress={() => setDraftImageUri('')}>
                  <MaterialIcons name="close" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : null}

            {draftVideoUri ? (
              <View style={styles.videoDraftRow}>
                <View style={styles.videoDraftCard}>
                  <MaterialIcons name="play-circle" size={23} color="#F97316" />
                  <Text style={styles.videoDraftText}>Video eklendi</Text>
                </View>
                <Pressable style={styles.imageDraftRemove} onPress={() => setDraftVideoUri('')}>
                  <MaterialIcons name="close" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : null}

            <View style={styles.composer}>
              <Pressable style={styles.composerIconButton} onPress={() => void pickImage(Platform.OS === 'web' ? 'gallery' : 'camera')}>
                <MaterialIcons name="camera-alt" size={21} color="#F97316" />
              </Pressable>
              <Pressable style={styles.composerIconButton} onPress={() => void pickImage('gallery')}>
                <MaterialIcons name="image" size={21} color="#0F766E" />
              </Pressable>
              <Pressable style={styles.composerIconButton} onPress={() => void pickVideo()}>
                <MaterialIcons name="videocam" size={21} color="#BE123C" />
              </Pressable>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder="Mesaj yaz"
                placeholderTextColor="#94A3B8"
                style={styles.composerInput}
                multiline
              />
              <Pressable
                style={[
                  styles.sendButton,
                  !draft.trim() && !draftImageUri && !draftVideoUri ? styles.sendButtonDisabled : undefined,
                ]}
                onPress={() => void sendMessage()}
                disabled={!draft.trim() && !draftImageUri && !draftVideoUri}
              >
                <MaterialIcons name="send" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Avatar({ name, size }: { name: string; size: number }) {
  const initial = name.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'P';
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: getConversationAvatarColor(name),
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: Math.max(16, size * 0.38) }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 14,
  },
  eyebrow: {
    color: '#F97316',
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: '#0F172A',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 2,
  },
  headerMascot: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    borderWidth: 4,
    borderColor: '#FED7AA',
  },
  searchBar: {
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 10,
    shadowColor: '#F97316',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  threadList: {
    flex: 1,
  },
  threadListContent: {
    paddingBottom: 92,
    gap: 10,
  },
  threadCard: {
    minHeight: 80,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#F97316',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  threadBody: {
    flex: 1,
    marginLeft: 11,
    minWidth: 0,
  },
  threadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  threadName: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
  },
  threadTime: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
  },
  threadUsername: {
    marginTop: 1,
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '800',
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  presenceDotOnline: {
    backgroundColor: '#22C55E',
  },
  presenceDotAway: {
    backgroundColor: '#F59E0B',
  },
  presenceText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
  },
  threadPreview: {
    marginTop: 5,
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  followedLabel: {
    marginTop: 5,
    alignSelf: 'flex-start',
    color: '#0F766E',
    backgroundColor: '#ECFDF5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
    fontSize: 10,
    fontWeight: '900',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F472B6',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7ED',
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  chatSafeArea: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  chatKeyboard: {
    flex: 1,
  },
  chatHeader: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  chatHeaderText: {
    flex: 1,
    marginLeft: 9,
    minWidth: 0,
  },
  chatName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  chatUsername: {
    marginTop: 1,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  moreButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F7FF',
  },
  chatActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
  },
  chatActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chatActionText: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '900',
  },
  chatActionTextGreen: {
    color: '#0F766E',
  },
  chatActionTextRose: {
    color: '#E11D48',
  },
  chatScroll: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  chatContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
  },
  bubbleRow: {
    alignSelf: 'stretch',
    marginBottom: 9,
  },
  bubbleRowMine: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  messageBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#DDEBFF',
  },
  messageBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#F97316',
    borderBottomRightRadius: 6,
  },
  messageText: {
    color: '#172554',
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextMine: {
    color: '#FFFFFF',
  },
  messageImage: {
    width: 190,
    height: 145,
    borderRadius: 15,
    marginBottom: 7,
    backgroundColor: '#FFE7D6',
  },
  messageVideo: {
    width: 210,
    height: 150,
    borderRadius: 15,
    marginBottom: 7,
    backgroundColor: '#0F172A',
  },
  messageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  messageTime: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  messageTimeMine: {
    color: '#FFEDD5',
  },
  imageDraftRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageDraft: {
    width: 62,
    height: 62,
    borderRadius: 14,
    backgroundColor: '#FFE7D6',
  },
  imageDraftRemove: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -12,
    marginTop: -38,
  },
  videoDraftRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
  },
  videoDraftCard: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  videoDraftText: {
    color: '#EA580C',
    fontSize: 13,
    fontWeight: '900',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 11,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#FED7AA',
  },
  composerIconButton: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7ED',
  },
  composerInput: {
    flex: 1,
    minHeight: 39,
    maxHeight: 104,
    borderRadius: 20,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#D5E6FB',
    paddingHorizontal: 13,
    paddingVertical: 9,
    color: '#0F172A',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
