// frontend/src/screens/PlanScreen.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Share,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Loader } from '@/components/Loader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { PaywallModal } from '@/components/PaywallModal';

import { useMealPlan, useRegeneratePlan } from '@/api/queries';
import { api } from '@/api/client';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/theme/colors';
import { SLOT_LABEL, SLOT_TIME } from '@/utils/turkish';

type Tab = 'plan' | 'shopping';

const SLOT_ICONS: Record<string, string> = {
  breakfast: '🍳',
  lunch: '🍗',
  dinner: '🍲',
  snack: '🍎',
};

interface NormalizedItem {
  key: string;
  displayName: string;
  amount: number;
  unit: string;
  category: 'manav' | 'kasap' | 'sut' | 'kuru' | 'temel';
  icon: string;
  mealName: string;
}

function normalizeIngredient(rawItem: any, mealSlotName: string): NormalizedItem {
  const text = (typeof rawItem === 'string' ? rawItem : rawItem?.name || '').trim();
  const lower = text.toLowerCase();

  const numMatch = lower.match(/(\d+(?:\.\d+)?)/);
  const detectedNum = numMatch ? parseFloat(numMatch[1]) : 0;

  if (lower.includes('domates')) {
    return { key: 'domates', displayName: 'Domates', amount: detectedNum || 1, unit: 'Adet', category: 'manav', icon: '🍅', mealName: mealSlotName };
  }
  if (lower.includes('salatalık')) {
    return { key: 'salatalik', displayName: 'Salatalık', amount: detectedNum || 1, unit: 'Adet', category: 'manav', icon: '🥒', mealName: mealSlotName };
  }
  if (lower.includes('biber')) {
    return { key: 'biber', displayName: 'Yeşil Biber', amount: detectedNum || 2, unit: 'Adet', category: 'manav', icon: '🫑', mealName: mealSlotName };
  }
  if (lower.includes('patates')) {
    return { key: 'patates', displayName: 'Patates', amount: detectedNum || 1, unit: 'Orta Boy', category: 'manav', icon: '🥔', mealName: mealSlotName };
  }
  if (lower.includes('limon')) {
    return { key: 'limon', displayName: 'Limon', amount: detectedNum || 1, unit: 'Adet', category: 'manav', icon: '🍋', mealName: mealSlotName };
  }
  if (lower.includes('muz')) {
    return { key: 'muz', displayName: 'Muz', amount: detectedNum || 1, unit: 'Adet', category: 'manav', icon: '🍌', mealName: mealSlotName };
  }
  if (lower.includes('elma')) {
    return { key: 'elma', displayName: 'Elma', amount: detectedNum || 1, unit: 'Adet', category: 'manav', icon: '🍎', mealName: mealSlotName };
  }
  if (lower.includes('roka') || lower.includes('yeşillik') || lower.includes('marul') || lower.includes('maydanoz')) {
    return { key: 'yesillik', displayName: 'Mevsim Yeşillikleri', amount: detectedNum || 1, unit: 'Demet', category: 'manav', icon: '🥬', mealName: mealSlotName };
  }

  if (lower.includes('tavuk')) {
    return { key: 'tavuk', displayName: 'Tavuk Göğsü', amount: detectedNum || 200, unit: 'g', category: 'kasap', icon: '🍗', mealName: mealSlotName };
  }
  if (lower.includes('somon') || lower.includes('balık') || lower.includes('ton balığı')) {
    return { key: 'somon', displayName: 'Somon / Balık Fileto', amount: detectedNum || 200, unit: 'g', category: 'kasap', icon: '🐟', mealName: mealSlotName };
  }
  if (lower.includes('kıyma') || lower.includes('dana') || lower.includes('köfte') || lower.includes('et')) {
    return { key: 'dana_eti', displayName: 'Yağsız Dana Kıyma / Et', amount: detectedNum || 180, unit: 'g', category: 'kasap', icon: '🥩', mealName: mealSlotName };
  }

  if (lower.includes('yumurta')) {
    return { key: 'yumurta', displayName: 'Yumurta', amount: detectedNum || 2, unit: 'Adet', category: 'sut', icon: '🥚', mealName: mealSlotName };
  }
  if (lower.includes('lor')) {
    return { key: 'lor', displayName: 'Lor Peyniri', amount: detectedNum || 100, unit: 'g', category: 'sut', icon: '🧀', mealName: mealSlotName };
  }
  if (lower.includes('beyaz peynir') || lower.includes('kaşar') || lower.includes('peynir')) {
    return { key: 'peynir', displayName: 'Peynir Çeşitleri', amount: detectedNum || 60, unit: 'g', category: 'sut', icon: '🧀', mealName: mealSlotName };
  }
  if (lower.includes('süt')) {
    return { key: 'sut', displayName: 'Süt / Bitkisel Süt', amount: detectedNum || 200, unit: 'ml', category: 'sut', icon: '🥛', mealName: mealSlotName };
  }
  if (lower.includes('yoğurt')) {
    return { key: 'yogurt', displayName: 'Süzme / Doğal Yoğurt', amount: detectedNum || 150, unit: 'g', category: 'sut', icon: '🥣', mealName: mealSlotName };
  }

  if (lower.includes('ekmek') || lower.includes('tam buğday')) {
    return { key: 'ekmek', displayName: 'Tam Buğday Ekmeği', amount: detectedNum || 2, unit: 'Dilim', category: 'kuru', icon: '🍞', mealName: mealSlotName };
  }
  if (lower.includes('yulaf')) {
    return { key: 'yulaf', displayName: 'Yulaf Ezmesi', amount: detectedNum || 60, unit: 'g', category: 'kuru', icon: '🥣', mealName: mealSlotName };
  }
  if (lower.includes('pirinç') || lower.includes('pilav')) {
    return { key: 'pirinc', displayName: 'Basmati Pirinç', amount: detectedNum || 70, unit: 'g', category: 'kuru', icon: '🍚', mealName: mealSlotName };
  }
  if (lower.includes('bulgur')) {
    return { key: 'bulgur', displayName: 'Pilavlık Bulgur', amount: detectedNum || 70, unit: 'g', category: 'kuru', icon: '🌾', mealName: mealSlotName };
  }
  if (lower.includes('makarna')) {
    return { key: 'makarna', displayName: 'Kepekli / Normal Makarna', amount: detectedNum || 80, unit: 'g', category: 'kuru', icon: '🍝', mealName: mealSlotName };
  }

  if (lower.includes('zeytinyağı')) {
    return { key: 'zeytinyagi', displayName: 'Zeytinyağı', amount: detectedNum || 1, unit: 'Yemek Kaşığı', category: 'temel', icon: '🫒', mealName: mealSlotName };
  }
  if (lower.includes('tereyağı')) {
    return { key: 'tereyagi', displayName: 'Tereyağı', amount: detectedNum || 1, unit: 'Tatlı Kaşığı', category: 'temel', icon: '🧈', mealName: mealSlotName };
  }
  if (lower.includes('fıstık ezmesi')) {
    return { key: 'fistik_ezmesi', displayName: 'Şekersiz Fıstık Ezmesi', amount: detectedNum || 1, unit: 'Yemek Kaşığı', category: 'temel', icon: '🥜', mealName: mealSlotName };
  }
  if (lower.includes('ceviz') || lower.includes('badem') || lower.includes('fındık')) {
    return { key: 'kuruyemis', displayName: 'Çiğ Kuruyemiş', amount: detectedNum || 25, unit: 'g', category: 'temel', icon: '🌰', mealName: mealSlotName };
  }

  const cleanFallback = text.replace(/^[\-\•\*\s]+/, '').trim();
  return {
    key: cleanFallback.toLowerCase().replace(/\s+/g, '_') || 'diger',
    displayName: cleanFallback ? cleanFallback.charAt(0).toUpperCase() + cleanFallback.slice(1) : 'Genel Besin',
    amount: detectedNum || 1,
    unit: detectedNum ? 'Adet' : 'Porsiyon',
    category: 'temel',
    icon: '🛒',
    mealName: mealSlotName,
  };
}

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  all: { label: 'Tümü', icon: '✨' },
  manav: { label: 'Manav', icon: '🥬' },
  kasap: { label: 'Kasap', icon: '🥩' },
  sut: { label: 'Şarküteri', icon: '🧀' },
  kuru: { label: 'Kuru Gıda', icon: '🌾' },
  temel: { label: 'Temel Gıda', icon: '🫒' },
};

export function PlanScreen() {
  const user = useUserStore((s) => s.user);
  const userId = Number(user?.id) || 1;
  const setPremium = useUserStore((s) => s.setPremium);
  const q = useMealPlan(userId);
  const regenerate = useRegeneratePlan(userId);

  const [dashboardData, setDashboardData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('plan');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [instantMeal, setInstantMeal] = useState('');
  const [instantLogging, setInstantLogging] = useState(false);
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [updatingSlot, setUpdatingSlot] = useState<string | null>(null);

  const isUserPro = Boolean(user?.is_premium || q.data?.isPro);
  const trialDaysLeft = q.data?.trialDaysLeft !== undefined ? q.data.trialDaysLeft : 14;

  const todayKey = new Date().toISOString().split('T')[0];
  const SHOPPING_STORAGE_KEY = `@fitintel_shopping_v2_${todayKey}_${userId}`;
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const fetchDashboard = useCallback(async () => {
  if (!userId) return;
  try {
    const res = await api.get(`/api/dashboard?userId=${userId}`);
    setDashboardData(res.data);
  } catch (err) {
    console.error('PlanScreen dashboard hatası:', err);
  }
}, [userId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SHOPPING_STORAGE_KEY);
        if (saved) setCheckedItems(JSON.parse(saved));
      } catch (e) {
        console.error('Alışveriş listesi yüklenemedi:', e);
      }
    })();
  }, [SHOPPING_STORAGE_KEY]);

  const meals = useMemo(() => {
    if (!q.data) return [];
    if (Array.isArray(q.data.meals) && q.data.meals.length > 0) {
      return q.data.meals;
    }

    const slots = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
    const list: any[] = [];

    slots.forEach((slot) => {
      const snap = q.data[`${slot}_snapshot`];
      if (snap && typeof snap === 'object') {
        list.push({
          id: snap.id || `${q.data.id || 'plan'}-${slot}`,
          slot: snap.slot || slot,
          name: snap.name || 'Öğün',
          description: snap.description || '',
          calories: Number(snap.calories) || 0,
          protein_g: Number(snap.protein_g) || 0,
          carbs_g: Number(snap.carbs_g) || 0,
          fats_g: Number(snap.fats_g) || 0,
          serving_size_g: snap.serving_size_g,
          prep_time_min: snap.prep_time_min,
          ingredients: Array.isArray(snap.ingredients)
            ? snap.ingredients
            : typeof snap.ingredients === 'string'
            ? snap.ingredients.split(',').map((s: string) => s.trim())
            : [],
          rationale: snap.rationale || '',
          done: Boolean(q.data[`${slot}_done`]),
        });
      }
    });

    return list;
  }, [q.data]);

  const plannedTotals = useMemo(() => {
    return {
      calories: meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0),
      protein: meals.reduce((acc, m) => acc + (Number(m.protein_g) || 0), 0),
      carbs: meals.reduce((acc, m) => acc + (Number(m.carbs_g) || 0), 0),
      fats: meals.reduce((acc, m) => acc + (Number(m.fats_g) || 0), 0),
    };
  }, [meals]);

  const toggleShoppingItem = async (key: string) => {
    try {
      Haptics.selectionAsync();
    } catch (_) {}
    const updated = { ...checkedItems, [key]: !checkedItems[key] };
    setCheckedItems(updated);
    try {
      await AsyncStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Alışveriş listesi kaydedilemedi:', e);
    }
  };

  const consolidatedShoppingList = useMemo(() => {
    const aggregator: Record<
      string,
      {
        key: string;
        displayName: string;
        totalAmount: number;
        unit: string;
        category: 'manav' | 'kasap' | 'sut' | 'kuru' | 'temel';
        icon: string;
        meals: Set<string>;
      }
    > = {};

    meals.forEach((meal) => {
      const slotName = SLOT_LABEL[meal.slot] || meal.slot;
      const rawIngredients =
        Array.isArray(meal.ingredients) && meal.ingredients.length > 0
          ? meal.ingredients
          : [meal.name];

      rawIngredients.forEach((ing: any) => {
        const item = normalizeIngredient(ing, slotName);
        if (!aggregator[item.key]) {
          aggregator[item.key] = {
            key: item.key,
            displayName: item.displayName,
            totalAmount: item.amount,
            unit: item.unit,
            category: item.category,
            icon: item.icon,
            meals: new Set([item.mealName]),
          };
        } else {
          aggregator[item.key].totalAmount += item.amount;
          aggregator[item.key].meals.add(item.mealName);
        }
      });
    });

    return Object.values(aggregator).map((item) => ({
      ...item,
      mealsArray: Array.from(item.meals),
    }));
  }, [meals]);

  const filteredShoppingList = useMemo(() => {
    if (selectedCategory === 'all') return consolidatedShoppingList;
    return consolidatedShoppingList.filter((item) => item.category === selectedCategory);
  }, [consolidatedShoppingList, selectedCategory]);

  const totalCount = consolidatedShoppingList.length;
  const checkedCount = consolidatedShoppingList.filter((i) => checkedItems[i.key]).length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const handleShareShoppingList = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
    let text = `🛒 Diet-Co Günlük Akıllı Alışveriş Listem (${new Date().toLocaleDateString('tr-TR')}):\n\n`;

    consolidatedShoppingList.forEach((item) => {
      const check = checkedItems[item.key] ? '✅' : '▫️';
      text += `${check} ${item.icon} ${item.displayName} - ${item.totalAmount} ${item.unit} (${item.mealsArray.join(', ')})\n`;
    });

    try {
      await Share.share({ message: text });
    } catch (_) {}
  };

  const handleResetShoppingList = () => {
    Alert.alert('Sepeti Sıfırla', 'Tüm işaretlemeler kaldırılacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sıfırla',
        style: 'destructive',
        onPress: async () => {
          setCheckedItems({});
          await AsyncStorage.removeItem(SHOPPING_STORAGE_KEY);
        },
      },
    ]);
  };

  const handleUpgradeSuccess = async () => {
    try {
      await api.post('/api/auth/upgrade', { userId });
      await setPremium();
      Alert.alert('Tebrikler! 🎉', 'Diet-Co PRO aktif edildi. Tüm özellikler sınırsız!');
      await q.refetch();
      await fetchDashboard();
    } catch (e: any) {
      Alert.alert('Hata', 'Üyelik yükseltilemedi: ' + (e?.message || ''));
    }
  };

  const handleInstantMealSubmit = async () => {
    const meal = instantMeal.trim();
    if (!meal || instantLogging) return;

    setInstantLogging(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}

    try {
      const res = await api.post('/api/chat', {
        message: `${meal} yedim, bunu günlüğüme ekle`,
        userId,
      });

      setInstantMeal('');
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}
      Alert.alert(
        '✅ Günlüğe Eklendi',
        res.data?.loggedItem
          ? `${res.data.loggedItem.food_name} (+${res.data.loggedItem.calories} kcal) başarıyla kaydedildi!`
          : 'Yediğin öğün günlüğüne kaydedildi.'
      );
      await fetchDashboard();
      await q.refetch();
    } catch (err: any) {
      if (err?.response?.data?.code === 'LIMIT_REACHED' || err?.response?.data?.code === 'TRIAL_EXPIRED') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch (_) {}
        setPaywallVisible(true);
        return;
      }
      Alert.alert('Hata', 'Öğün kaydedilemedi: ' + (err?.response?.data?.error || err?.message || 'Bilinmeyen hata'));
    } finally {
      setInstantLogging(false);
    }
  };

  const handleCustomizeMeal = async (slot: string) => {
    const raw = customInputs[slot]?.trim();
    if (!raw) {
      Alert.alert('Malzeme Yazmadın', 'Lütfen elinde olan malzemeleri virgülle ayırarak yaz.');
      return;
    }

    setUpdatingSlot(slot);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}

    try {
      await api.post(`/api/meal-plan/${userId}/custom-slot`, {
        slot,
        ingredients: raw,
      });

      setCustomInputs((prev) => ({ ...prev, [slot]: '' }));
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}
      await q.refetch();
      await fetchDashboard();
      Alert.alert('✨ Harika!', 'Koçun elindeki malzemelerle bu öğünü hedeflerine uygun şekilde yeniden tasarladı.');
    } catch (err: any) {
      if (err?.response?.data?.code === 'LIMIT_REACHED' || err?.response?.data?.code === 'TRIAL_EXPIRED') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch (_) {}
        setPaywallVisible(true);
        return;
      }
      Alert.alert('Hata', 'Öğün uyarlanamadı: ' + (err?.response?.data?.error || err?.message || 'Bilinmeyen hata'));
    } finally {
      setUpdatingSlot(null);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([q.refetch(), fetchDashboard()]);
  };

  const consumedCal = Number(dashboardData?.caloriesConsumed) || 0;
  const targetCal = Number(dashboardData?.caloriesTarget || user?.calorie_target) || 2226;
  const isExceeded = consumedCal > targetCal;
  const exceededAmount = consumedCal - targetCal;
  const remainingCal = Math.max(0, targetCal - consumedCal);
  const calPercent = Math.min(100, Math.round((consumedCal / (targetCal || 1)) * 100));

  const proteinConsumed = Number(dashboardData?.proteinConsumed) || 0;
  const proteinTarget = Number(dashboardData?.proteinTarget || user?.protein_target) || 216;
  const carbsConsumed = Number(dashboardData?.carbsConsumed) || 0;
  const carbsTarget = Number(dashboardData?.carbsTarget || user?.carbs_target) || 201;
  const fatConsumed = Number(dashboardData?.fatConsumed) || 0;
  const fatTarget = Number(dashboardData?.fatTarget || user?.fats_target) || 62;

  const plannedCal = Math.round(Number(plannedTotals.calories));

  if (q.isLoading) {
    return <Loader label="Günün AI beslenme planı yükleniyor…" />;
  }

  // 🛑 DENEME SÜRESİ DOLAN KULLANICI İÇİN ÖĞÜNLERİ VE YENİLEMEYİ TAMAMEN KİLİTLE
  const isTrialExpired = (!isUserPro && trialDaysLeft === 0) || (q.error as any)?.response?.data?.code === 'TRIAL_EXPIRED';

  if (isTrialExpired) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ScreenHeader subtitle="Süre Doldu" title="AI Beslenme Planım" />
        <View style={styles.centerBox}>
          <View style={styles.expiredLockIcon}>
            <Ionicons name="lock-closed" size={42} color="#DC2626" />
          </View>
          <Text style={styles.errorTitle}>14 Günlük Deneme Süreniz Bitti</Text>
          <Text style={styles.errorSub}>
            Ücretsiz deneme süreniz tamamlandığı için yeni öğün planları ve dolap uyarlamaları kilitlenmiştir. Günlük kişiselleştirilmiş menüler için PRO üyeliğe geçin.
          </Text>
          <TouchableOpacity
            style={styles.proUpgradeFullBtn}
            onPress={() => setPaywallVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            <Text style={styles.proUpgradeFullBtnText}>PRO Üyeliğe Geç (Kilidi Aç)</Text>
          </TouchableOpacity>
        </View>

        <PaywallModal
          visible={paywallVisible}
          onClose={() => setPaywallVisible(false)}
          onSuccess={handleUpgradeSuccess}
        />
      </SafeAreaView>
    );
  }

  if (q.isError || !q.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>Plan alınamadı</Text>
          <Text style={styles.errorSub}>API'ye ulaşılamıyor — yenilemek için sayfayı aşağı çek.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching && !q.isLoading}
              onRefresh={handleRefresh}
              tintColor={colors.textLow}
            />
          }
        >
          <ScreenHeader subtitle="Bugüne özel" title="AI Beslenme Planım" />

          {/* ⚡ PRO OLMAYANLAR İÇİN EN ÜST DENEME BİLGİLENDİRME BANDI */}
          {!isUserPro && (
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <View style={[styles.trialBanner, trialDaysLeft === 0 && styles.trialBannerExpired]}>
                <View style={styles.trialBannerLeft}>
                  <View style={[styles.trialIconWrap, trialDaysLeft === 0 && { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons
                      name={trialDaysLeft > 0 ? "sparkles" : "lock-closed"}
                      size={16}
                      color={trialDaysLeft > 0 ? "#059669" : "#DC2626"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.trialTitle, trialDaysLeft === 0 && { color: '#991B1B' }]}>
                      {trialDaysLeft > 0
                        ? `Ücretsiz Deneme: ${trialDaysLeft} Gün Kaldı`
                        : 'Deneme Süresi Doldu'}
                    </Text>
                    <Text style={styles.trialSub}>
                      {trialDaysLeft > 0
                        ? '14 gün sonra günlük AI öğün yenilemeleri PRO üyelik isteyecektir.'
                        : 'Öğün yenilemeleri ve koçluk için PRO üyeliğe geçin.'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.proUpgradeBtn, trialDaysLeft === 0 && styles.proUpgradeBtnExpired]}
                  onPress={() => setPaywallVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.proUpgradeBtnText}>PRO'ya Geç</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ paddingHorizontal: 20 }}>
            <SegmentedControl<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'plan', label: 'Planım' },
                { value: 'shopping', label: 'Alışveriş' },
              ]}
            />
          </View>

          {tab === 'plan' && (
            <>
              <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[styles.liveDot, isExceeded && { backgroundColor: '#EF4444' }]} />
                      <Text style={[styles.sectionCaption, isExceeded && { color: '#EF4444' }]}>
                        {isExceeded ? 'KALORİ HEDEFİ AŞILDI' : 'GÜNLÜK KALORİ DENGESİ'}
                      </Text>
                    </View>
                    <Text style={[{ color: colors.textLow, fontSize: 13, fontWeight: '800' }, isExceeded && { color: '#EF4444' }]}>
                      %{calPercent}
                    </Text>
                  </View>

                  <Text style={[styles.targetCaloriesText, isExceeded && { color: '#EF4444' }]}>
                    {targetCal.toLocaleString('tr-TR')}{' '}
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textLow }}>kcal hedef</Text>
                  </Text>

                  <View style={styles.progressBg}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(4, calPercent)}%`,
                          backgroundColor: isExceeded ? '#EF4444' : colors.primary,
                        },
                      ]}
                    />
                  </View>

                  {isExceeded ? (
                    <View style={styles.exceededBadge}>
                      <Ionicons name="alert-circle" size={15} color="#DC2626" />
                      <Text style={styles.exceededBadgeText}>
                        Günlük kalori bütçesi {exceededAmount} kcal aşıldı! ({consumedCal} kcal alındı)
                      </Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <Text style={{ color: colors.textLow, fontSize: 12, fontWeight: '600' }}>
                        {consumedCal} / {targetCal.toLocaleString('tr-TR')} kcal alındı ({remainingCal} kcal kaldı)
                      </Text>
                      {plannedCal > 0 && (
                        <Text style={{ color: '#059669', fontSize: 11, fontWeight: '800' }}>
                          Menü: {plannedCal} kcal
                        </Text>
                      )}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
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
                </Card>
              </View>

              <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
                <View style={styles.instantMealCard}>
                  <View style={styles.instantMealHeader}>
                    <Ionicons name="flash" size={17} color="#059669" />
                    <Text style={styles.instantMealTitle}>ANLIK NE YEDİN?</Text>
                  </View>
                  <Text style={styles.instantMealSub}>
                    Plandan farklı bir şey mi yedin? Buraya yaz, AI makrolarını günlüğüne ve gelişimine eklesin.
                  </Text>

                  <View style={styles.instantMealInputRow}>
                    <TextInput
                      style={styles.instantMealInput}
                      placeholder="Örn: 1 tabak makarna, 1 kase yoğurt..."
                      placeholderTextColor="#9CA3AF"
                      value={instantMeal}
                      onChangeText={setInstantMeal}
                      editable={!instantLogging}
                      onSubmitEditing={handleInstantMealSubmit}
                    />
                    <TouchableOpacity
                      style={[
                        styles.instantMealBtn,
                        (!instantMeal.trim() || instantLogging) && styles.instantMealBtnDisabled,
                      ]}
                      onPress={handleInstantMealSubmit}
                      disabled={!instantMeal.trim() || instantLogging}
                    >
                      {instantLogging ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={{ paddingHorizontal: 20, marginTop: 22, marginBottom: 8 }}>
                <Text style={{ color: colors.textHi, fontSize: 17, fontWeight: '800' }}>
                  Bugünkü Öğün Planın
                </Text>
              </View>

              <View style={{ paddingHorizontal: 20, gap: 18 }}>
                {meals.map((m) => {
                  const key = `${m.slot}-${m.id}`;
                  const ingredients = Array.isArray(m.ingredients) ? m.ingredients : [];
                  const isThisSlotUpdating = updatingSlot === m.slot;

                  return (
                    <View key={key} style={styles.mealCard}>
                      <View style={styles.mealCardTop}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 18 }}>{SLOT_ICONS[m.slot] || '🍽️'}</Text>
                          <Text style={styles.slotTitle}>
                            {(SLOT_LABEL[m.slot] ?? m.slot).toUpperCase()}
                          </Text>
                        </View>
                        {SLOT_TIME[m.slot] ? (
                          <View style={styles.timeBadge}>
                            <Text style={styles.timeBadgeText}>{SLOT_TIME[m.slot]}</Text>
                          </View>
                        ) : null}
                      </View>

                      <Text style={styles.mealName}>{m.name}</Text>

                      {m.description ? (
                        <Text style={styles.mealDescription}>{m.description}</Text>
                      ) : null}

                      <View style={styles.macroPillsRow}>
                        <View style={[styles.badge, styles.badgeCal]}>
                          <Text style={styles.badgeCalText}>{m.calories} kcal</Text>
                        </View>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{Math.round(Number(m.protein_g))}g Protein</Text>
                        </View>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{Math.round(Number(m.carbs_g || 0))}g Karb</Text>
                        </View>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{Math.round(Number(m.fats_g || 0))}g Yağ</Text>
                        </View>
                        {m.serving_size_g ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>~{Math.round(Number(m.serving_size_g))}g</Text>
                          </View>
                        ) : null}
                        {m.prep_time_min ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>⏱ {m.prep_time_min} dk</Text>
                          </View>
                        ) : null}
                      </View>

                      {ingredients.length > 0 && (
                        <View style={styles.ingredientsContainer}>
                          <Text style={styles.ingredientsHeader}>İÇİNDEKİLER / MALZEMELER</Text>
                          <View style={styles.ingredientsRow}>
                            {ingredients.map((ing: string, idx: number) => (
                              <View key={idx} style={styles.ingredientChip}>
                                <Text style={styles.ingredientChipText}>{ing}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {m.rationale ? (
                        <View style={styles.rationaleBox}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <Ionicons name="sparkles" size={13} color="#059669" />
                            <Text style={styles.rationaleTitle}>Diet-Co AI Notu</Text>
                          </View>
                          <Text style={styles.rationaleText}>{m.rationale}</Text>
                        </View>
                      ) : null}

                      <View style={styles.customizeContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Ionicons name="sparkles-outline" size={15} color="#059669" />
                          <Text style={styles.customizeTitle}>Dolabında bunlar yok mu?</Text>
                        </View>
                        <Text style={styles.customizeSub}>
                          Dolabındaki malzemeleri <Text style={{ fontWeight: '700', color: '#059669' }}>virgülle ayırarak</Text> yaz; koçun hedefine uygun olarak bu öğünü hemen yeniden tasarlasın.
                        </Text>

                        <View style={styles.customizeInputRow}>
                          <TextInput
                            style={styles.customizeInput}
                            placeholder="Örn: 2 yumurta, lor peyniri, domates..."
                            placeholderTextColor="#9CA3AF"
                            value={customInputs[m.slot] || ''}
                            onChangeText={(text) =>
                              setCustomInputs((prev) => ({ ...prev, [m.slot]: text }))
                            }
                            editable={!isThisSlotUpdating}
                          />
                          <Pressable
                            onPress={() => handleCustomizeMeal(m.slot)}
                            disabled={isThisSlotUpdating || !customInputs[m.slot]?.trim()}
                            style={[
                              styles.customizeBtn,
                              (!customInputs[m.slot]?.trim() || isThisSlotUpdating) &&
                              styles.customizeBtnDisabled,
                            ]}
                          >
                            {isThisSlotUpdating ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="sync" size={13} color="#FFFFFF" />
                                <Text style={styles.customizeBtnText}>Uyarla</Text>
                              </View>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {tab === 'shopping' && (
            <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
              <View style={styles.shoppingHeroCard}>
                <View style={styles.shoppingHeroTop}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={styles.liveDot} />
                      <Text style={styles.shoppingHeroSub}>BÜTÜNLEŞİK GÜNLÜK İHTİYAÇ</Text>
                    </View>
                    <Text style={styles.shoppingHeroTitle}>Akıllı Pazar Sepetim</Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={handleShareShoppingList}
                      hitSlop={8}
                      style={styles.shoppingActionCircle}
                    >
                      <Ionicons name="share-outline" size={18} color="#059669" />
                    </Pressable>
                    {checkedCount > 0 && (
                      <Pressable
                        onPress={handleResetShoppingList}
                        hitSlop={8}
                        style={styles.shoppingActionCircle}
                      >
                        <Ionicons name="refresh-outline" size={18} color="#64748B" />
                      </Pressable>
                    )}
                  </View>
                </View>

                <View style={{ marginTop: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMid }}>
                      Sepete Eklenen Ürünler
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>
                      {checkedCount} / {totalCount} (%{progressPercent})
                    </Text>
                  </View>
                  <View style={styles.shoppingProgressTrack}>
                    <View
                      style={[
                        styles.shoppingProgressFill,
                        { width: `${progressPercent}%` },
                      ]}
                    />
                  </View>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryFilterRow}
              >
                {Object.entries(CATEGORY_META).map(([key, meta]) => {
                  const isSelected = selectedCategory === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => {
                        try {
                          Haptics.selectionAsync();
                        } catch (_) {}
                        setSelectedCategory(key);
                      }}
                      style={[
                        styles.categoryFilterPill,
                        isSelected && styles.categoryFilterPillActive,
                      ]}
                    >
                      <Text style={{ fontSize: 13 }}>{meta.icon}</Text>
                      <Text
                        style={[
                          styles.categoryFilterText,
                          isSelected && styles.categoryFilterTextActive,
                        ]}
                      >
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ gap: 10, marginTop: 4 }}>
                {filteredShoppingList.map((item) => {
                  const isChecked = !!checkedItems[item.key];

                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => toggleShoppingItem(item.key)}
                      style={({ pressed }) => [
                        styles.consolidatedItemCard,
                        isChecked && styles.consolidatedItemCardChecked,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View
                          style={[
                            styles.appleCircleCheckbox,
                            isChecked && styles.appleCircleCheckboxChecked,
                          ]}
                        >
                          {isChecked && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                        </View>

                        <View style={styles.itemEmojiBox}>
                          <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                        </View>

                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <Text
                            style={[
                              styles.consolidatedItemTitle,
                              isChecked && styles.consolidatedItemTitleChecked,
                            ]}
                            numberOfLines={1}
                          >
                            {item.displayName}
                          </Text>

                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                            {item.mealsArray.map((mName, mIdx) => (
                              <View key={mIdx} style={styles.mealUsageBadge}>
                                <Text style={styles.mealUsageBadgeText}>{mName}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.consolidatedAmountBadge,
                          isChecked && styles.consolidatedAmountBadgeChecked,
                        ]}
                      >
                        <Text
                          style={[
                            styles.consolidatedAmountValue,
                            isChecked && styles.consolidatedAmountValueChecked,
                          ]}
                        >
                          {item.totalAmount}
                        </Text>
                        <Text
                          style={[
                            styles.consolidatedAmountUnit,
                            isChecked && styles.consolidatedAmountUnitChecked,
                          ]}
                        >
                          {item.unit}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                {filteredShoppingList.length === 0 && (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <Text style={{ color: colors.textLow, fontSize: 13, fontWeight: '600' }}>
                      Bu reyonda alınacak ürün bulunamadı.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onSuccess={handleUpgradeSuccess}
      />
    </SafeAreaView>
  );
}

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
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errorTitle: { color: colors.textHi, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorSub: { color: colors.textMid, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 19 },
  expiredLockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FECACA',
  },
  proUpgradeFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginTop: 24,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  proUpgradeFullBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' },
  sectionCaption: { color: colors.textLow, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  targetCaloriesText: { color: colors.textHi, fontSize: 32, fontWeight: '900', marginTop: 4 },
  progressBg: { height: 8, marginTop: 12, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 8 },
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
    marginTop: 10,
  },
  exceededBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  macroPill: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  macroPillLabel: { color: colors.textLow, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  macroPillValue: { color: colors.textHi, fontSize: 12, fontWeight: '800', marginTop: 2 },

  trialBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  trialBannerExpired: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  trialBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  trialIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  trialSub: {
    fontSize: 10.5,
    color: '#4B5563',
    marginTop: 1,
    lineHeight: 14,
  },
  proUpgradeBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  proUpgradeBtnExpired: {
    backgroundColor: '#DC2626',
  },
  proUpgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },

  instantMealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  instantMealHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  instantMealTitle: { fontSize: 11, fontWeight: '800', color: '#059669', letterSpacing: 0.8 },
  instantMealSub: { fontSize: 12, color: '#6B7280', marginBottom: 12, lineHeight: 17 },
  instantMealInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  instantMealInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 13,
    color: '#111827',
  },
  instantMealBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instantMealBtnDisabled: { backgroundColor: '#9CA3AF' },

  mealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  mealCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  slotTitle: { fontSize: 12, fontWeight: '800', color: colors.textLow, letterSpacing: 0.8 },
  timeBadge: { backgroundColor: colors.surface2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  timeBadgeText: { fontSize: 10, fontWeight: '700', color: colors.textMid },
  mealName: { fontSize: 17, fontWeight: '800', color: colors.textHi, lineHeight: 23 },
  mealDescription: { fontSize: 13, color: colors.textMid, lineHeight: 18, marginTop: 5 },
  macroPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: { backgroundColor: colors.surface2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.textMid },
  badgeCal: { backgroundColor: '#ECFDF5' },
  badgeCalText: { fontSize: 11, fontWeight: '800', color: '#059669' },
  ingredientsContainer: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.surface2 },
  ingredientsHeader: { fontSize: 10, fontWeight: '700', color: colors.textLow, letterSpacing: 0.8, marginBottom: 6 },
  ingredientsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ingredientChip: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ingredientChipText: { fontSize: 11, color: '#374151', fontWeight: '500' },
  rationaleBox: {
    marginTop: 12,
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: '#059669',
    borderRadius: 10,
    padding: 10,
  },
  rationaleTitle: { fontSize: 11, fontWeight: '800', color: '#059669' },
  rationaleText: { fontSize: 12, color: '#166534', lineHeight: 17 },
  customizeContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    marginHorizontal: -18,
    marginBottom: -18,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  customizeTitle: { fontSize: 12, fontWeight: '800', color: '#059669' },
  customizeSub: { fontSize: 11, color: '#6B7280', lineHeight: 16, marginBottom: 10 },
  customizeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customizeInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    fontSize: 12,
    color: '#111827',
  },
  customizeBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customizeBtnDisabled: { backgroundColor: '#9CA3AF' },
  customizeBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  shoppingHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 14,
  },
  shoppingHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shoppingHeroSub: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.8,
  },
  shoppingHeroTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  shoppingActionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoppingProgressTrack: {
    height: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 3.5,
    overflow: 'hidden',
  },
  shoppingProgressFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 3.5,
  },
  categoryFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  categoryFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryFilterPillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  categoryFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryFilterTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  consolidatedItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  consolidatedItemCardChecked: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.55,
  },
  appleCircleCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleCircleCheckboxChecked: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  itemEmojiBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  consolidatedItemTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  consolidatedItemTitleChecked: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  mealUsageBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mealUsageBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  consolidatedAmountBadge: {
    alignItems: 'flex-end',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 72,
  },
  consolidatedAmountBadgeChecked: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  consolidatedAmountValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
  },
  consolidatedAmountValueChecked: {
    color: '#94A3B8',
  },
  consolidatedAmountUnit: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: -1,
  },
  consolidatedAmountUnitChecked: {
    color: '#94A3B8',
  },
});

export default PlanScreen;