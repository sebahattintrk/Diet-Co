// frontend/src/screens/ChatScreen.tsx
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  Easing,
  LayoutChangeEvent,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import { useUserStore } from '@/store/userStore';
import { useChat, type ChatMessage } from '@/api/queries';
import { PaywallModal } from '@/components/PaywallModal';
import { api } from '@/api/client';

const { width, height } = Dimensions.get('window');

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

const GOAL_SUGGESTIONS: Record<string, string[]> = {
  weight_gain: [
    'İştahım yokken temiz kalori nasıl artırabilirim?',
    'Gece yatmadan önce ne yemem kilo aldırır?',
    'Bütçemi yormayacak yüksek kalorili ara öğün öner',
  ],
  fat_loss: [
    'Kilo verirken kas kaybetmemek için ne yapmalıyım?',
    'Tatlı krizlerini bastırmak için pratik ara öğün',
    'Açlık hissettiğimde kalorisi sıfıra yakın ne yiyebilirim?',
  ],
  muscle_gain: [
    'Bugün pratik ve yüksek proteinli ne yiyebilirim?',
    'Antrenmandan hemen önce ve sonra ne tüketmeliyim?',
    'Kas kütlemi artırırken yağlanmayı nasıl önlerim?',
  ],
  maintain: [
    'Hafta sonu kaçamağı yaptım, bugün nasıl dengelemeliyim?',
    'Bütçeme uygun dengeli bir gün menüsü önerir misin?',
    'Günlük su ve lif ihtiyacımı nasıl tamamlarım?',
  ],
};

function DynamicAmbientBackground() {
  const orbAnim1 = useRef(new Animated.Value(0)).current;
  const orbAnim2 = useRef(new Animated.Value(0)).current;
  const orbAnim3 = useRef(new Animated.Value(0)).current;
  const orbAnim4 = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createLoop = (anim: Animated.Value, duration: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = createLoop(orbAnim1, 9500);
    const anim2 = createLoop(orbAnim2, 12000);
    const anim3 = createLoop(orbAnim3, 14000);
    const anim4 = createLoop(orbAnim4, 17000);
    const sweep = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    anim1.start();
    anim2.start();
    anim3.start();
    anim4.start();
    sweep.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
      anim4.stop();
      sweep.stop();
    };
  }, [orbAnim1, orbAnim2, orbAnim3, orbAnim4, sweepAnim]);

  const orb1Style = {
    transform: [
      { translateX: orbAnim1.interpolate({ inputRange: [0, 1], outputRange: [20, -45] }) },
      { translateY: orbAnim1.interpolate({ inputRange: [0, 1], outputRange: [-30, 40] }) },
      { scale: orbAnim1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] }) },
    ],
  };

  const orb2Style = {
    transform: [
      { translateX: orbAnim2.interpolate({ inputRange: [0, 1], outputRange: [-40, 35] }) },
      { translateY: orbAnim2.interpolate({ inputRange: [0, 1], outputRange: [10, -50] }) },
      { scale: orbAnim2.interpolate({ inputRange: [0, 1], outputRange: [1.15, 0.9] }) },
    ],
  };

  const orb3Style = {
    transform: [
      { translateX: orbAnim3.interpolate({ inputRange: [0, 1], outputRange: [30, -25] }) },
      { translateY: orbAnim3.interpolate({ inputRange: [0, 1], outputRange: [40, -20] }) },
      { scale: orbAnim3.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.2] }) },
    ],
  };

  const orb4Style = {
    transform: [
      { translateX: orbAnim4.interpolate({ inputRange: [0, 1], outputRange: [-15, 25] }) },
      { translateY: orbAnim4.interpolate({ inputRange: [0, 1], outputRange: [-20, 15] }) },
      { scale: orbAnim4.interpolate({ inputRange: [0, 1], outputRange: [1.05, 0.85] }) },
    ],
  };

  const sweepStyle = {
    transform: [
      {
        translateX: sweepAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-width, width],
        }),
      },
      { rotate: '18deg' },
    ],
  };

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={['#F0FDF4', '#F8FAFC', '#F0FDFA', '#FFFFFF']}
        locations={[0, 0.4, 0.75, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[styles.auroraOrb, styles.orbTopRight, orb1Style]}>
        <LinearGradient
          colors={['rgba(16, 185, 129, 0.34)', 'rgba(52, 211, 153, 0.15)', 'transparent']}
          locations={[0, 0.55, 1]}
          style={styles.fillRounded}
        />
      </Animated.View>
      <Animated.View style={[styles.auroraOrb, styles.orbMidLeft, orb2Style]}>
        <LinearGradient
          colors={['rgba(6, 182, 212, 0.26)', 'rgba(20, 184, 166, 0.12)', 'transparent']}
          locations={[0, 0.6, 1]}
          style={styles.fillRounded}
        />
      </Animated.View>
      <Animated.View style={[styles.auroraOrb, styles.orbBottomRight, orb3Style]}>
        <LinearGradient
          colors={['rgba(74, 222, 128, 0.3)', 'rgba(167, 243, 208, 0.1)', 'transparent']}
          locations={[0, 0.5, 1]}
          style={styles.fillRounded}
        />
      </Animated.View>
      <Animated.View style={[styles.auroraOrb, styles.orbCenterSmall, orb4Style]}>
        <LinearGradient
          colors={['rgba(217, 249, 157, 0.28)', 'rgba(190, 242, 100, 0.08)', 'transparent']}
          locations={[0, 0.5, 1]}
          style={styles.fillRounded}
        />
      </Animated.View>

      <Animated.View style={[styles.lightSweep, sweepStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.5)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      <LinearGradient
        colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.5)']}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

function RotatingGlowRing() {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.rotatingRing, { transform: [{ rotate }] }]}>
      <LinearGradient
        colors={['#059669', 'transparent', 'transparent', '#10B981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.rotatingRingGradient}
      />
    </Animated.View>
  );
}

function SuggestionCard({ text, onPress }: { text: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, friction: 6 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.heroSuggestionCard}
      >
        <LinearGradient
          colors={['#059669', '#10B981']}
          style={styles.suggestionAccentBar}
        />
        <View style={styles.suggestionSparkleDot}>
          <Ionicons name="sparkles" size={12} color="#059669" />
        </View>
        <Text style={styles.heroSuggestionText}>{text}</Text>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </Pressable>
    </Animated.View>
  );
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useUserStore((s: any) => s.user);
  const setUser = useUserStore((s: any) => s.setUser);
  const userId = useUserStore((s: any) => Number(s.user?.id) || 1);
  const setPremium = useUserStore((s: any) => s.setPremium);
  const chat = useChat(userId);

  const SESSIONS_STORAGE_KEY = `@fitintel_chat_sessions_${userId}`;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const firstName = useMemo(() => {
    if (!user?.name) return 'Dostum';
    return user.name.trim().split(' ')[0];
  }, [user?.name]);

  const suggestions = useMemo(() => {
    return GOAL_SUGGESTIONS[user?.goal || ''] || GOAL_SUGGESTIONS.muscle_gain;
  }, [user?.goal]);

  const currentSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const messages = currentSession ? currentSession.messages : [];

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
        if (saved) {
          const parsed: ChatSession[] = JSON.parse(saved);
          if (parsed.length > 0) {
            setSessions(parsed);
            setActiveSessionId(parsed[0].id);
            return;
          }
        }
        startNewChat();
      } catch (e) {
        console.log('Oturum yükleme hatası:', e);
      }
    })();
  }, [userId]);

  const saveSessionsToStorage = async (updatedSessions: ChatSession[]) => {
    setSessions(updatedSessions);
    try {
      await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updatedSessions));
    } catch (e) {
      console.log('Oturum kaydetme hatası:', e);
    }
  };

  const startNewChat = () => {
    try {
      Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}

    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'Yeni Sohbet',
      createdAt: Date.now(),
      messages: [],
    };
    const updated = [newSession, ...sessions.filter((s) => s.messages.length > 0)];
    saveSessionsToStorage(updated);
    setActiveSessionId(newSession.id);
    setHistoryModalVisible(false);
  };

  const deleteSession = (sessionId: string) => {
    Alert.alert('Sohbeti Sil', 'Bu sohbet kaydı kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          const filtered = sessions.filter((s) => s.id !== sessionId);
          saveSessionsToStorage(filtered);
          if (activeSessionId === sessionId) {
            if (filtered.length > 0) {
              setActiveSessionId(filtered[0].id);
            } else {
              startNewChat();
            }
          }
        },
      },
    ]);
  };

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, chat?.isPending, isSending]);

  const handleUpgradeSuccess = async () => {
    try {
      await api.post('/api/auth/upgrade', { userId });
      if (typeof setPremium === 'function') {
        await setPremium();
      }
      useUserStore.setState((prev: any) => ({
        user: { ...prev.user, is_premium: true },
      }));
      Alert.alert('Tebrikler! 🎉', 'Diet-Co PRO aktif edildi. Tüm koçluk özellikleri sınırsız!');
    } catch (e: any) {
      Alert.alert('Hata', 'Üyelik yükseltilemedi: ' + (e?.message || ''));
    }
  };

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || isSending) return;

    try {
      Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}

    const userMsg: ChatMessage = { role: 'user', content };
    const currentMsgs = currentSession ? currentSession.messages : [];
    const newMessages = [...currentMsgs, userMsg];

    const sessionTitle =
      currentMsgs.length === 0
        ? content.slice(0, 24) + (content.length > 24 ? '…' : '')
        : currentSession?.title || 'Sohbet';

    const updatedSessions = sessions.map((s) =>
      s.id === activeSessionId
        ? { ...s, title: sessionTitle, messages: newMessages }
        : s
    );
    saveSessionsToStorage(updatedSessions);
    setDraft('');
    setIsSending(true);

    try {
      const response = await api.post('/api/chat', {
        message: content,
        userId,
        history: currentMsgs,
      });
      const res = response.data;

      try {
        Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}

      if (res?.user) {
        try {
          if (typeof setUser === 'function') setUser(res.user);
          useUserStore.setState({ user: res.user });
        } catch (_) {}
      }

      const replyContent = res?.reply || 'Öğününüzü kaydettim. Afiyet olsun. 💪';
      const withAssistant = [...newMessages, { role: 'assistant', content: replyContent } as ChatMessage];

      const finalizedSessions = updatedSessions.map((s) =>
        s.id === activeSessionId ? { ...s, messages: withAssistant } : s
      );
      saveSessionsToStorage(finalizedSessions);
    } catch (err: any) {
      const status = err?.response?.status;
      const errCode = err?.response?.data?.code;
      const errMsg = err?.response?.data?.error;

      // 🛑 429 Günlük Limit veya 403 Süre Dolumu Kontrolü
      if (
        status === 429 ||
        errCode === 'DAILY_LIMIT_REACHED' ||
        status === 403 ||
        errCode === 'TRIAL_EXPIRED' ||
        errCode === 'LIMIT_REACHED'
      ) {
        // İletilemeyen kullanıcı mesajını oturumdan geri çıkar
        saveSessionsToStorage(
          sessions.map((s) => (s.id === activeSessionId ? { ...s, messages: currentMsgs } : s))
        );
        setDraft(content);

        try {
          Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Warning);
        } catch (_) {}

        

        setPaywallVisible(true);
        return;
      }

      console.log('🔴 Chat Hatası:', err?.message);

      const rawError = JSON.stringify(err?.response?.data || err?.message || '');
      let friendlyNote = 'Şu an bağlantıda kısa bir gecikme oldu. Lütfen 10-15 saniye sonra tekrar dene.';
      if (rawError.includes('quota') || rawError.includes('RESOURCE_EXHAUSTED')) {
        friendlyNote = 'AI Koçun kısa bir mola veriyor. Birkaç saniye sonra tekrar sorabilirsin! ⚡';
      }

      const withError = [...newMessages, { role: 'assistant', content: friendlyNote } as ChatMessage];
      saveSessionsToStorage(
        updatedSessions.map((s) => (s.id === activeSessionId ? { ...s, messages: withError } : s))
      );
    } finally {
      setIsSending(false);
    }
  };

  const isCoachThinking = chat?.isPending || isSending;

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    setHeaderHeight(e.nativeEvent.layout.height);
  }, []);

  return (
    <View style={styles.rootContainer}>
      <DynamicAmbientBackground />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.headerShadowWrap} onLayout={onHeaderLayout}>
          <BlurView intensity={55} tint="light" style={styles.headerGlass}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => setHistoryModalVisible(true)}
                hitSlop={12}
                style={styles.headerCircleBtn}
              >
                <Ionicons name="menu" size={22} color="#0F172A" />
              </Pressable>

              <View style={styles.modelBadgeGlass}>
                <View style={styles.onlinePulsingDot} />
                <Text style={styles.modelBadgeText}>Diet-Co AI 3.6</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={startNewChat}
                hitSlop={10}
                style={styles.newChatGlassBtn}
              >
                <Ionicons name="add" size={18} color="#059669" />
                <Text style={styles.newChatGlassText}>Yeni</Text>
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate('Profile')}
                hitSlop={10}
                style={styles.avatarGlow}
              >
                <Text style={styles.avatarText}>{firstName.charAt(0)}</Text>
              </Pressable>
            </View>
          </BlurView>
          <LinearGradient
            colors={['transparent', '#A7F3D0', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerAccentLine}
          />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={{ flex: 1 }}>
            {messages.length === 0 ? (
              <ScrollView
                contentContainerStyle={styles.heroScrollContainer}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.heroCenterContainer}>
                  <View style={styles.heroGlowWrapper}>
                    <View style={styles.glowHaloSoft} />
                    <RotatingGlowRing />
                    <View style={styles.heroCoreStar}>
                      <Ionicons name="sparkles" size={28} color="#059669" />
                    </View>
                  </View>

                  <Text style={styles.heroGreetingText}>
                    Sorabilirsiniz, {firstName}.
                  </Text>
                  <Text style={styles.heroSubText}>
                    Beslenme hedefin, kalori dengesi veya pratik tarifler hakkında konuşalım.
                  </Text>

                  <View style={styles.heroSuggestions}>
                    {suggestions.map((s, idx) => (
                      <SuggestionCard key={idx} text={s} onPress={() => send(s)} />
                    ))}
                  </View>
                </View>
              </ScrollView>
            ) : (
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.messagesScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {messages.map((m, i) => (
                  <AnimatedMessageBubble key={`${i}-${m.role}`} role={m.role} content={m.content} />
                ))}

                {isCoachThinking && (
                  <View style={styles.loadingRow}>
                    <View style={styles.loadingGlassBox}>
                      <ActivityIndicator size="small" color="#059669" />
                      <Text style={styles.loadingText}>Koç hazırlıyor…</Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}
          </View>

          <View style={[styles.inputWrapper, { paddingBottom: isKeyboardVisible ? 6 : 100 }]}>
            <BlurView intensity={70} tint="light" style={styles.floatingInputBar}>
              <TextInput
                placeholder="Diet-Co AI'a bir şey sor…"
                placeholderTextColor="#94A3B8"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => send()}
                multiline
                style={styles.inputField}
                editable={!isCoachThinking}
              />

              <Pressable
                onPress={() => send()}
                disabled={!draft.trim() || isCoachThinking}
                style={[styles.sendButtonGlow, (!draft.trim() || isCoachThinking) && { opacity: 0.5 }]}
              >
                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
              </Pressable>
            </BlurView>
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={historyModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setHistoryModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sohbet Geçmişi</Text>
              <Pressable
                onPress={() => setHistoryModalVisible(false)}
                hitSlop={12}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color="#334155" />
              </Pressable>
            </View>

            <Pressable onPress={startNewChat} style={styles.modalNewChatBtn}>
              <Ionicons name="add-circle" size={22} color="#059669" />
              <Text style={styles.modalNewChatText}>Yeni Sohbet Başlat</Text>
            </Pressable>

            <ScrollView style={{ flex: 1, marginTop: 14 }}>
              {sessions.map((sess) => {
                const isSelected = sess.id === activeSessionId;
                return (
                  <View
                    key={sess.id}
                    style={[
                      styles.historyItem,
                      isSelected && styles.historyItemSelected,
                    ]}
                  >
                    <Pressable
                      onPress={() => {
                        setActiveSessionId(sess.id);
                        setHistoryModalVisible(false);
                      }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={18}
                        color={isSelected ? '#059669' : '#64748B'}
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.historyItemTitle,
                          isSelected && { color: '#059669', fontWeight: '700' },
                        ]}
                      >
                        {sess.title || 'İsimsiz Sohbet'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => deleteSession(sess.id)}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="trash-outline" size={17} color="#94A3B8" />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Modal>

        <PaywallModal
          visible={paywallVisible}
          onClose={() => setPaywallVisible(false)}
          onSuccess={handleUpgradeSuccess}
        />
      </SafeAreaView>
    </View>
  );
}

function AnimatedMessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';

  const slideAnim = useRef(new Animated.Value(isUser ? 14 : 18)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 75,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 75,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacityAnim, slideAnim, scaleAnim]);

  if (isUser) {
    return (
      <Animated.View
        style={[
          styles.userBubbleWrapper,
          {
            opacity: opacityAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={['#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.userBubbleGradient}
        >
          <Text style={styles.userBubbleText}>{content}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  const safeContent = content || '';
  const paragraphs = safeContent.split('\n').filter((p) => p.trim().length > 0);

  return (
    <Animated.View
      style={[
        styles.assistantCardWrapper,
        {
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        },
      ]}
    >
      <View style={styles.assistantCard}>
        <LinearGradient
          colors={['#A7F3D0', '#6EE7B7', '#A7F3D0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.assistantTopAccent}
        />
        <View style={styles.assistantHeader}>
          <View style={styles.assistantIconGlow}>
            <Ionicons name="sparkles" size={13} color="#059669" />
          </View>
          <Text style={styles.assistantBadgeText}>Diet-Co AI</Text>
        </View>

        <View style={{ gap: 8 }}>
          {paragraphs.map((para, idx) => {
            const isBullet = para.trim().startsWith('* ') || para.trim().startsWith('- ');
            const cleanText = para.replace(/^[\*\-\•]\s*/, '').trim();

            return (
              <View key={idx} style={isBullet ? styles.bulletRow : null}>
                {isBullet && <Text style={styles.bulletSymbol}>•</Text>}
                <Text style={styles.assistantBodyText}>
                  {renderFormattedText(cleanText)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('***') && part.endsWith('***')) {
      return (
        <Text key={index} style={styles.highlightText}>
          {part.slice(3, -3)}
        </Text>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={index} style={styles.boldText}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part.replace(/\*/g, '');
  });
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  auroraOrb: { position: 'absolute', borderRadius: 999 },
  fillRounded: { flex: 1, borderRadius: 999 },
  orbTopRight: { top: -height * 0.12, right: -width * 0.25, width: width * 1.35, height: width * 1.35 },
  orbMidLeft: { top: height * 0.28, left: -width * 0.35, width: width * 1.25, height: width * 1.25 },
  orbBottomRight: { bottom: -height * 0.1, right: -width * 0.2, width: width * 1.2, height: width * 1.2 },
  orbCenterSmall: { top: height * 0.42, left: width * 0.2, width: width * 0.7, height: width * 0.7 },
  lightSweep: { position: 'absolute', top: 0, bottom: 0, width: width * 0.5 },

  headerShadowWrap: {
    zIndex: 100,
    elevation: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  headerGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
    overflow: 'hidden',
  },
  headerAccentLine: { height: 1.5, width: '100%' },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modelBadgeGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  onlinePulsingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  modelBadgeText: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  newChatGlassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 3,
  },
  newChatGlassText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  avatarGlow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  heroScrollContainer: { flexGrow: 1, justifyContent: 'center', paddingBottom: 20 },
  heroCenterContainer: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 10, zIndex: 1 },
  heroGlowWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 18, width: 100, height: 100 },
  glowHaloSoft: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    transform: [{ scale: 1.3 }],
  },
  rotatingRing: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
  },
  rotatingRingGradient: {
    flex: 1,
    borderRadius: 39,
    opacity: 0.55,
  },
  heroCoreStar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  heroGreetingText: { fontSize: 25, fontWeight: '700', color: '#0F172A', textAlign: 'center', letterSpacing: -0.4 },
  heroSubText: { fontSize: 13.5, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 20, paddingHorizontal: 12 },
  heroSuggestions: { width: '100%', marginTop: 22, gap: 10 },
  heroSuggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 15,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
    gap: 10,
    overflow: 'hidden',
  },
  suggestionAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  suggestionSparkleDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  heroSuggestionText: { color: '#334155', fontSize: 13, fontWeight: '600', flex: 1 },
  messagesScroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, zIndex: 1 },
  userBubbleWrapper: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 6 },
  userBubbleGradient: {
    maxWidth: '82%',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderTopRightRadius: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
  },
  userBubbleText: { color: '#FFFFFF', fontSize: 15, lineHeight: 22, fontWeight: '500' },
  assistantCardWrapper: { marginVertical: 6, maxWidth: '90%' },
  assistantCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderTopLeftRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    overflow: 'hidden',
  },
  assistantTopAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
  assistantIconGlow: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  assistantBadgeText: { fontSize: 11, fontWeight: '800', color: '#059669', letterSpacing: 0.8 },
  assistantBodyText: { fontSize: 15, color: '#1E293B', lineHeight: 23, flex: 1 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 4 },
  bulletSymbol: { fontSize: 16, color: '#059669', lineHeight: 22 },
  boldText: { fontWeight: '800', color: '#0F172A' },
  highlightText: { fontWeight: '800', color: '#059669' },
  loadingRow: { flexDirection: 'row', marginVertical: 8 },
  loadingGlassBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadingText: { fontSize: 13, color: '#475569', fontWeight: '500' },

  inputWrapper: { paddingHorizontal: 14, backgroundColor: 'transparent' },
  floatingInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  inputField: { flex: 1, fontSize: 15, color: '#0F172A', paddingHorizontal: 4, maxHeight: 90, minHeight: 24 },
  sendButtonGlow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC', paddingHorizontal: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitle: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  modalCloseBtn: { padding: 6 },
  modalNewChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  modalNewChatText: { fontSize: 15, fontWeight: '700', color: '#059669' },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginVertical: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyItemSelected: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
  historyItemTitle: { fontSize: 14.5, color: '#334155', fontWeight: '500' },
});

export default ChatScreen;