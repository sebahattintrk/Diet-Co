// frontend/src/screens/HomeScreen.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { api } from '../api/client';
import { useUserStore } from '../store/userStore';
import DietCoLogo from '../components/DietCoLogo';
import { colors } from '../theme/colors';

const { width, height } = Dimensions.get('window');

function SoftAmbientBackground() {
  const fadeAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.65, duration: 6000, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0.4, duration: 6000, useNativeDriver: true }),
      ])
    ).start();
  }, [fadeAnim]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={['#F6FAF8', '#FFFFFF', '#F1F7F4']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[styles.softGlowOrb, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={['rgba(16, 185, 129, 0.12)', 'rgba(5, 150, 105, 0.03)', 'transparent']}
          locations={[0, 0.5, 1]}
          style={{ flex: 1, borderRadius: width }}
        />
      </Animated.View>
    </View>
  );
}

export const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useUserStore((s) => s.user);
  const userId = Number(user?.id) || 1;

  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);

  // 💧 Canlı Su Takip State'i
  const [waterMl, setWaterMl] = useState<number>(0);
  const [waterAdding, setWaterAdding] = useState(false);

  // 🍽️ Hızlı Öğün & Gram State'leri
  const [quickMeal, setQuickMeal] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [mealLogging, setMealLogging] = useState(false);

  // 🌟 Motivasyon Sözleri
  const MOTIVATION_QUOTES = [
    'Disiplin, motivasyonun bittiği yerde başlar.',
    'Küçük adımlar, büyük zaferler getirir.',
    'Bugün attığın her adım geleceğin için.',
    'Vücudun senin tek kalıcı evin, ona iyi bak.',
    'Zor olan başlamaktır, tempoyu koru!',
    'Kendine verdiğin sözü tutma vakti.',
    'Mükemmel olmana gerek yok, istikrarlı ol yeter.',
    'Bugün de hedefine bir adım daha yaklaştın.',
    'Erteleme, bugünün enerjisini hisset!',
    'Sağlıklı tercihler, güçlü yarınlar yaratır.',
  ];

  const dailyMotivation = useMemo(() => {
    const dayOfYear = Math.floor(
      (new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    return MOTIVATION_QUOTES[dayOfYear % MOTIVATION_QUOTES.length];
  }, []);

  // 🔥 Streak Takibi
  const [streakCount, setStreakCount] = useState<number>(1);

  useEffect(() => {
    const updateStreak = async () => {
      try {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const STREAK_KEY = `@dietco_streak_${userId}`;
        const LAST_LOGIN_KEY = `@dietco_last_login_${userId}`;

        const lastLogin = await AsyncStorage.getItem(LAST_LOGIN_KEY);
        const savedStreak = await AsyncStorage.getItem(STREAK_KEY);
        let currentStreak = savedStreak ? parseInt(savedStreak, 10) : 1;

        if (!lastLogin) {
          currentStreak = 1;
          await AsyncStorage.setItem(LAST_LOGIN_KEY, todayStr);
          await AsyncStorage.setItem(STREAK_KEY, '1');
        } else if (lastLogin === todayStr) {
          currentStreak = Math.max(1, currentStreak);
        } else {
          const [lastY, lastM, lastD] = lastLogin.split('-').map(Number);
          const [todayY, todayM, todayD] = todayStr.split('-').map(Number);

          const lastDateUtc = Date.UTC(lastY, lastM - 1, lastD);
          const todayDateUtc = Date.UTC(todayY, todayM - 1, todayD);
          const diffDays = Math.round((todayDateUtc - lastDateUtc) / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            currentStreak += 1;
          } else if (diffDays > 1) {
            currentStreak = 1;
          }

          await AsyncStorage.setItem(LAST_LOGIN_KEY, todayStr);
          await AsyncStorage.setItem(STREAK_KEY, currentStreak.toString());
        }

        setStreakCount(currentStreak);
      } catch (e) {
        console.error('Streak hesaplama hatası:', e);
      }
    };

    updateStreak();
  }, [userId]);

  // 💧 Kilo Bazlı Su Hedefi
  const aiWaterTargetLiters = useMemo(() => {
    const weight = Number(user?.weight_kg || (user as any)?.weight) || 75;
    let base = (weight * 35) / 1000;

    if (user?.goal === 'weight_gain' || user?.goal === 'muscle_gain') {
      base += 0.5;
    } else if (user?.goal === 'fat_loss') {
      base += 0.3;
    }

    return Math.round(base * 10) / 10;
  }, [user?.weight_kg, (user as any)?.weight, user?.goal]);

  const aiWaterTargetMl = Math.round(aiWaterTargetLiters * 1000);

  // Saate Göre Sıradaki Öğün
  const nextMeal = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 6 && h < 11) return { name: 'Kahvaltı', time: '08:30', icon: 'sunny-outline' };
    if (h >= 11 && h < 15) return { name: 'Öğle Yemeği', time: '12:45', icon: 'restaurant-outline' };
    if (h >= 15 && h < 18) return { name: 'Ara Öğün', time: '16:30', icon: 'nutrition-outline' };
    return { name: 'Akşam Yemeği', time: '19:30', icon: 'moon-outline' };
  }, []);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!userId) return;

    try {
      const res = await api.get(`/api/dashboard?userId=${userId}`);
      if (res?.data) {
        setData(res.data);
        if (res.data.waterConsumed !== undefined) {
          setWaterMl(Number(res.data.waterConsumed));
        }

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        await AsyncStorage.setItem(`@dietco_dashboard_cache_${userId}`, JSON.stringify(res.data));
        await AsyncStorage.setItem(`@dietco_dashboard_date_${userId}`, todayStr);
      }
    } catch (err) {
      console.error('Dashboard senkronizasyon hatası:', err);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    const initData = async () => {
      if (!userId) return;

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const CACHE_DATE_KEY = `@dietco_dashboard_date_${userId}`;

      try {
        const cachedDate = await AsyncStorage.getItem(CACHE_DATE_KEY);
        const cached = await AsyncStorage.getItem(`@dietco_dashboard_cache_${userId}`);

        // Eğer önbellek dünden kalmaysa su sayacını sıfırdan başlat
        if (cachedDate === todayStr && cached) {
          const parsed = JSON.parse(cached);
          setData(parsed);
          if (parsed?.waterConsumed !== undefined) {
            setWaterMl(Number(parsed.waterConsumed));
          }
        } else {
          setWaterMl(0); // Yeni güne geçilmiş, anında 0 yap
        }
      } catch (_) {}

      fetchDashboard(true);
    };

    initData();
  }, [userId, fetchDashboard]);

  // 2. ⚡ KESİNTİSİZ SENKRONİZASYON (Sekmeye her tıklandığında anında güncelle)
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchDashboard(true);
      }
    }, [userId, fetchDashboard])
  );

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    fetchDashboard(false);
  };

  const handleAddWater = async () => {
    if (waterAdding) return;
    setWaterAdding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ⚡ İyimser (Optimistic) Anında Güncelleme: Kullanıcı hiç beklemesin
    const prevWater = waterMl;
    const optimisticWater = prevWater + 250;
    setWaterMl(optimisticWater);

    try {
      const res = await api.post('/api/water/add', {
        userId,
        amount: 250,
      });

      // Sunucudan gelen kesin miktarı eşitle (dashboard çağrısı beklemeye gerek yok)
      if (res.data?.waterConsumed !== undefined) {
        const finalWater = Number(res.data.waterConsumed);
        setWaterMl(finalWater);
        
        // Cache'i de hemen güncelle
        setData((prev: any) => ({
          ...prev,
          waterConsumed: finalWater,
        }));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      // Hata olursa eski değere geri al
      setWaterMl(prevWater);
      console.log('Su kaydedilemedi:', err);
    } finally {
      // Her durumda kilidi kaldır
      setWaterAdding(false);
    }
  };

  const handleQuickMealSubmit = async () => {
    const meal = quickMeal.trim();
    if (!meal || mealLogging) return;

    setMealLogging(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const fullMessage = quickAmount.trim()
      ? `${quickAmount.trim()} gram ${meal} yedim, bunu günlüğüme ekle`
      : `${meal} yedim, bunu günlüğüme ekle`;

    try {
      const res = await api.post('/api/chat', {
        message: fullMessage,
        userId,
      });

      // ⚡ Optimistic Anında Güncelleme (Gelen kalori varsa anında state'e ekle, sayfa hemen güncellensin)
      if (res.data?.loggedItem) {
        const addedCal = Number(res.data.loggedItem.calories) || 0;
        const addedProtein = Number(res.data.loggedItem.protein_g) || 0;
        const addedCarbs = Number(res.data.loggedItem.carbs_g) || 0;
        const addedFats = Number(res.data.loggedItem.fats_g) || 0;

        setData((prev: any) => ({
          ...prev,
          caloriesConsumed: (Number(prev?.caloriesConsumed) || 0) + addedCal,
          proteinConsumed: (Number(prev?.proteinConsumed) || 0) + addedProtein,
          carbsConsumed: (Number(prev?.carbsConsumed) || 0) + addedCarbs,
          fatConsumed: (Number(prev?.fatConsumed) || 0) + addedFats,
        }));
      }

      setQuickMeal('');
      setQuickAmount('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '✅ Günlüğe Eklendi',
        res.data?.loggedItem
          ? `${res.data.loggedItem.food_name} (+${res.data.loggedItem.calories} kcal) eklendi!`
          : 'Öğününüz işlendi.'
      );
      
      // Arkada sunucudan taze toplamları çek
      fetchDashboard(true);
    } catch (err: any) {
      Alert.alert('Hata', 'Öğün eklenemedi: ' + (err?.message || 'Hata oluştu'));
    } finally {
      setMealLogging(false);
    }
  };

  const consumedCal = Number(data?.caloriesConsumed) || 0;
  const targetCal = Number(data?.caloriesTarget || user?.calorie_target) || 2200;
  const isExceeded = consumedCal > targetCal;
  const exceededAmount = consumedCal - targetCal;
  const remainingCal = Math.max(0, targetCal - consumedCal);
  const calPercent = Math.min(100, Math.round((consumedCal / (targetCal || 1)) * 100));

  const proteinConsumed = Number(data?.proteinConsumed) || 0;
  const proteinTarget = Number(data?.proteinTarget || user?.protein_target) || 120;
  const carbsConsumed = Number(data?.carbsConsumed) || 0;
  const carbsTarget = Number(data?.carbsTarget || user?.carbs_target) || 250;
  const fatConsumed = Number(data?.fatConsumed) || 0;
  const fatTarget = Number(data?.fatTarget || user?.fats_target) || 70;

  const waterPercent = Math.min(100, Math.round((waterMl / (aiWaterTargetMl || 1)) * 100));
  const waterLitersConsumed = (waterMl / 1000).toFixed(2);
  const isWaterLow = waterPercent < 40 && new Date().getHours() >= 14;

  return (
    <View style={styles.root}>
      <SoftAmbientBackground />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{
            paddingTop: insets.top + 8,
            paddingBottom: 110,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />
          }
        >
          {/* Üst Bar */}
          <View style={styles.customHeaderRow}>
            <View style={styles.headerLeftCol}>
              <View style={styles.motivationBadge}>
                <Ionicons name="sparkles" size={10} color="#059669" />
                <Text style={styles.motivationBadgeText}>GÜNÜN SÖZÜ</Text>
              </View>
              <Text style={styles.motivationQuoteText} numberOfLines={2}>
                "{dailyMotivation}"
              </Text>
            </View>

            <View style={styles.headerCenterCol} pointerEvents="none">
              <DietCoLogo size={70} width={70} height={70} />
            </View>

            <View style={styles.headerRightCol}>
              <View style={styles.streakCard}>
                <Ionicons name="flame" size={18} color="#F97316" />
                <View>
                  <Text style={styles.streakNumber}>{streakCount}</Text>
                  <Text style={styles.streakSub}>GÜN SERİ</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 1. Hero Widget: Kalori & Makro Dengesi */}
          <View style={styles.appleHeroWidget}>
            <View style={styles.heroHeader}>
              <View style={styles.liveIndicatorRow}>
                <View style={[styles.liveDot, isExceeded && { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.sectionCaption, isExceeded && { color: '#EF4444' }]}>
                  {isExceeded ? 'KALORİ HEDEFİ AŞILDI' : 'GÜNLÜK KALORİ DENGESİ'}
                </Text>
              </View>
              <Text style={[styles.heroPercentage, isExceeded && { color: '#EF4444' }]}>
                %{calPercent}
              </Text>
            </View>

            <View style={styles.primaryCalorieDisplay}>
              <Text style={[styles.targetCaloriesText, isExceeded && { color: '#EF4444' }]}>
                {isExceeded ? `+${exceededAmount.toLocaleString('tr-TR')}` : remainingCal.toLocaleString('tr-TR')}
              </Text>
              <Text style={[styles.remainingCalorieLabel, isExceeded && { color: '#DC2626' }]}>
                {isExceeded ? 'kcal aşıldı' : 'kcal kaldı'}
              </Text>
            </View>

            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(4, calPercent)}%`,
                    backgroundColor: isExceeded ? '#EF4444' : '#059669',
                  },
                ]}
              />
            </View>

            {isExceeded && (
              <View style={styles.exceededBadge}>
                <Ionicons name="alert-circle" size={15} color="#DC2626" />
                <Text style={styles.exceededBadgeText}>
                  Günlük kalori bütçesi {exceededAmount} kcal aşıldı!
                </Text>
              </View>
            )}

            <View style={styles.bottomStatsRow}>
              <View style={styles.bottomStatCol}>
                <Text style={[styles.bottomStatValue, isExceeded && { color: '#EF4444' }]}>
                  {consumedCal.toLocaleString('tr-TR')}
                </Text>
                <Text style={styles.bottomStatTitle}>Alınan kcal</Text>
              </View>
              <View style={styles.statSeparator} />
              <View style={styles.bottomStatCol}>
                <Text style={styles.bottomStatValue}>{targetCal.toLocaleString('tr-TR')}</Text>
                <Text style={styles.bottomStatTitle}>Hedef kcal</Text>
              </View>
            </View>

            <View style={styles.macroStrip}>
              <MacroPill
                label="Protein"
                value={`${Math.round(proteinConsumed)} / ${proteinTarget}g`}
                highlight={proteinConsumed >= proteinTarget}
              />
              <MacroPill
                label="Karb"
                value={`${Math.round(carbsConsumed)} / ${carbsTarget}g`}
              />
              <MacroPill
                label="Yağ"
                value={`${Math.round(fatConsumed)} / ${fatTarget}g`}
                danger={fatConsumed > fatTarget}
              />
            </View>
          </View>

          {/* 2. Bento Grid: İnteraktif Su Takibi & Sıradaki Öğün */}
          <View style={styles.bentoRow}>
            <View style={styles.bentoSquare}>
              <View style={styles.bentoSquareHeader}>
                <View style={styles.waterIconContainer}>
                  <Ionicons name="water" size={18} color="#0284C7" />
                </View>
                
                <TouchableOpacity
                  onPress={handleAddWater}
                  disabled={waterAdding}
                  activeOpacity={0.6}
                  style={[styles.addWaterBtn, waterAdding && { opacity: 0.6 }]}
                >
                  <Ionicons name="add" size={14} color="#0284C7" />
                  <Text style={styles.addWaterBtnText}>250 ml</Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={styles.waterTargetAmount}>{waterLitersConsumed} L</Text>
                  <Text style={styles.waterTargetSub}>/ {aiWaterTargetLiters.toFixed(1)} L</Text>
                </View>
                
                <View style={styles.waterProgressTrack}>
                  <View style={[styles.waterProgressFill, { width: `${Math.max(6, waterPercent)}%` }]} />
                </View>
                <Text style={styles.waterGlassCountText}>
                  {Math.round(waterMl / 250)} bardak içildi (%{waterPercent})
                </Text>
              </View>

              <View style={styles.waterFooterRow}>
                <Ionicons
                  name={isWaterLow ? 'warning' : 'checkmark-circle'}
                  size={12}
                  color={isWaterLow ? '#EA580C' : '#0284C7'}
                />
                <Text style={[styles.waterFooterText, isWaterLow && { color: '#EA580C' }]}>
                  {isWaterLow ? 'Su tüketimin çok az!' : 'Hedef: ' + aiWaterTargetLiters + ' Litre'}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => navigation.navigate('Plan')}
              style={({ pressed }) => [styles.bentoSquare, pressed && styles.cardPressed]}
            >
              <View style={styles.bentoSquareHeader}>
                <Ionicons name={nextMeal.icon as any} size={20} color="#059669" />
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </View>

              <View style={{ marginTop: 14 }}>
                <Text style={styles.bentoSquareTitle}>{nextMeal.name}</Text>
                <Text style={styles.bentoSquareSub}>Saat {nextMeal.time}</Text>
              </View>

              <Text style={styles.bentoActionTag}>Planı İncele</Text>
            </Pressable>
          </View>

          {/* 3. Hızlı Eylem Çubuğu: Anlık Ne Yedin */}
          <View style={styles.quickActionCard}>
            <View style={styles.foodIconBtn}>
              <Ionicons name="restaurant" size={18} color="#059669" />
            </View>

            <TextInput
              style={styles.quickInput}
              placeholder="Ne yedin? (Tavuk pilav...)"
              placeholderTextColor="#9CA3AF"
              value={quickMeal}
              onChangeText={setQuickMeal}
              editable={!mealLogging}
            />

            <View style={styles.amountInputWrap}>
              <TextInput
                style={styles.amountInput}
                placeholder="Gram"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={quickAmount}
                onChangeText={setQuickAmount}
                editable={!mealLogging}
                onSubmitEditing={handleQuickMealSubmit}
              />
              <Text style={styles.amountSuffix}>g</Text>
            </View>

            <TouchableOpacity
              onPress={handleQuickMealSubmit}
              disabled={!quickMeal.trim() || mealLogging}
              style={[
                styles.sendActionBtn,
                (!quickMeal.trim() || mealLogging) && styles.sendActionBtnDisabled,
              ]}
            >
              {mealLogging ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="arrow-up" size={17} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* 4. AI Koç Notu */}
          <Pressable
            style={({ pressed }) => [styles.coachBanner, pressed && styles.cardPressed]}
            onPress={() => {
              Haptics.selectionAsync();
              navigation.navigate('Chat');
            }}
          >
            <View style={styles.coachHeaderRow}>
              <View style={styles.coachBadge}>
                <Ionicons name="sparkles" size={13} color="#059669" />
                <Text style={styles.coachBadgeText}>DIET-CO AI</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="#059669" />
            </View>

            <Text style={styles.coachNoteText} numberOfLines={2}>
              {data?.aiRecommendation ||
                (isWaterLow
                  ? `Bugün hedeflenen su miktarının gerisindesin (${waterLitersConsumed} L). Metabolizmanı canlı tutmak için hemen bir bardak su iç! 💧`
                  : isExceeded
                  ? `Bugün kalori bütçeni ${exceededAmount} kcal aştın. Kalan sürede bol su tüketip dinlenmeye odaklan!`
                  : `Bugün hedefine ulaşmak için ${remainingCal} kcal kaldı. Su dengeni koruyarak tempoyu sürdür!`)}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

function MacroPill({
  label,
  value,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <View
      style={[
        styles.macroPill,
        highlight && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1 },
        danger && { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1 },
      ]}
    >
      <Text style={[styles.macroPillLabel, highlight && { color: '#059669' }, danger && { color: '#DC2626' }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.macroPillValue, highlight && { color: '#059669' }, danger && { color: '#DC2626' }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  softGlowOrb: {
    position: 'absolute',
    top: -height * 0.08,
    right: -width * 0.2,
    width: width * 1.2,
    height: width * 1.2,
  },

  customHeaderRow: {
    position: 'relative',
    height: 74,
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerCenterCol: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  headerLeftCol: {
    position: 'absolute',
    left: 0,
    right: '50%',
    marginRight: 44,
    top: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 2,
  },
  motivationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  motivationBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  motivationQuoteText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 14,
    textAlign: 'right',
  },
  headerRightCol: {
    position: 'absolute',
    left: '50%',
    right: 0,
    marginLeft: 44,
    top: 0,
    bottom: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  streakNumber: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#EA580C',
    lineHeight: 15,
  },
  streakSub: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#9A3412',
    letterSpacing: 0.3,
  },

  appleHeroWidget: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 14,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  sectionCaption: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  heroPercentage: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
  },
  primaryCalorieDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  targetCaloriesText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  remainingCalorieLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },
  progressBg: {
    height: 8,
    marginTop: 4,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 8,
  },
  exceededBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  exceededBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  bottomStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F9FAFB',
    marginBottom: 12,
  },
  bottomStatCol: {
    alignItems: 'center',
  },
  bottomStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  bottomStatTitle: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 2,
  },
  statSeparator: {
    width: 1,
    height: 22,
    backgroundColor: '#F3F4F6',
  },
  macroStrip: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  macroPill: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  macroPillLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  macroPillValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },

  bentoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  bentoSquare: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    justifyContent: 'space-between',
    minHeight: 145,
  },
  bentoSquareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waterIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addWaterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 2,
  },
  addWaterBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0284C7',
  },
  waterTargetAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0284C7',
  },
  waterTargetSub: {
    fontSize: 11.5,
    color: '#6B7280',
    fontWeight: '600',
  },
  waterProgressTrack: {
    height: 6,
    backgroundColor: '#F0F9FF',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  waterProgressFill: {
    height: '100%',
    backgroundColor: '#0284C7',
    borderRadius: 3,
  },
  waterGlassCountText: {
    fontSize: 10.5,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 4,
  },
  waterFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  waterFooterText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },

  bentoSquareTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  bentoSquareSub: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 1,
  },
  bentoActionTag: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
    marginTop: 10,
  },

  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    marginBottom: 14,
    gap: 8,
  },
  foodIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    paddingVertical: 4,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 68,
  },
  amountInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    padding: 0,
  },
  amountSuffix: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    marginLeft: 2,
  },
  sendActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendActionBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },

  coachBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  coachHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  coachBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  coachBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.8,
  },
  coachNoteText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18.5,
    fontWeight: '500',
  },
});

export default HomeScreen;