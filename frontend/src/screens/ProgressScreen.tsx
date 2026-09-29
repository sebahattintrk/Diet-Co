// frontend/src/screens/ProgressScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { api } from '@/api/client';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/theme/colors';

interface ProgressData {
  targets: {
    calorie_target: number;
    protein_target: number;
    carbs_target: number;
    fats_target: number;
    goal: string;
    name: string;
  };
  today: {
    totals: {
      total_calories: number;
      total_protein: number;
      total_carbs: number;
      total_fats: number;
    };
    meals: Array<{
      id: number;
      food_name: string;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fats_g: number;
      time: string;
    }>;
  };
  weeklyTrend: Array<{ log_date: string; calories: number; protein: number }>;
  monthlyStats: {
    logged_days: number;
    avg_daily_calories: number;
    avg_daily_protein: number;
  };
}

export function ProgressScreen() {
  const userId = useUserStore((s) => Number(s.user?.id) || 1);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<ProgressData | null>(null);

  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportLoading, setReportLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);

  const fetchProgress = useCallback(async (silent = false) => {
    try {
      const res = await api.get<ProgressData>(`/progress/${userId}`).catch(() => 
        api.get<ProgressData>(`/api/progress/${userId}`)
      );
      setData(res.data);
    } catch (err) {
      console.error('Progress fetch error:', err);
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId]);

  // Sayfa açıldığında ilk yükleme
  useEffect(() => {
    fetchProgress(false);
  }, [fetchProgress]);

  // Sekmeye her basıldığında veya ekrana dönüldüğünde arka planda sessizce taze veriyi çek
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchProgress(true);
      }
    }, [userId, fetchProgress])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProgress(false);
  };

  const handleDeleteMeal = async (mealId: number, foodName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Öğünü Kaldır',
      `Yanlış girdiğinizi düşünüyorsanız kaldırabilirsiniz öğünü.\n\n"${foodName}" öğününü kaldırmak istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            console.log('--- SİLME BAŞLADI ---');
            console.log('İstek atılan Base URL:', api.defaults.baseURL);
            console.log('Silinecek ID:', mealId);

            try {
              const res = await api.delete(`/api/progress/meal/${mealId}`);
              console.log('Silme başarılı yanıt:', res.data);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              fetchProgress(true);
            } catch (err: any) {
              console.log('Tam URL:', (err.config?.baseURL || '') + (err.config?.url || ''));
              console.log('Hata Kodu:', err?.response?.status);
              console.log('Sunucu Yanıtı:', err?.response?.data);
              Alert.alert('Hata', `404 Hatası! İstek atılan yer: ${(err.config?.baseURL || '') + (err.config?.url || '')}`);
            }
          },
        },
      ]
    );
  };

  const handleGenerateReport = async (period: 'daily' | 'weekly' | 'monthly') => {
    setReportPeriod(period);
    setReportLoading(true);
    setAiReport(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await api.post<{ report: string }>(`/progress/${userId}/ai-report`, { period }).catch(() =>
        api.post<{ report: string }>(`/api/progress/${userId}/ai-report`, { period })
      );
      setAiReport(res.data.report);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Rapor Hatası', 'AI raporu oluşturulamadı: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setReportLoading(false);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMid, marginTop: 12, fontSize: 13 }}>Veriler yükleniyor…</Text>
      </View>
    );
  }

  const totals = data?.today.totals || { total_calories: 0, total_protein: 0, total_carbs: 0, total_fats: 0 };
  const targets = data?.targets || { calorie_target: 2000, protein_target: 120, carbs_target: 250, fats_target: 60 };

  const currentEatenCal = Number(totals.total_calories || 0);
  const targetCal = Number(targets.calorie_target || 2000);
  const isCalExceeded = currentEatenCal > targetCal;
  const exceededAmount = currentEatenCal - targetCal;

  const calProgress = Math.min(100, Math.round((currentEatenCal / (targetCal || 1)) * 100));
  const proProgress = Math.min(100, Math.round((Number(totals.total_protein) / (targets.protein_target || 1)) * 100));

  const proteinDiff = Math.round(Number(targets.protein_target) - Number(totals.total_protein));
  const calDiff = Math.round(targetCal - currentEatenCal);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Üst Başlık */}
        <View style={styles.screenHeader}>
          <Text style={styles.screenHeaderSub}>GELİŞİM & RAPORLAR</Text>
          <Text style={styles.screenHeaderTitle}>Günlük İlerleme</Text>
        </View>

        {/* 1. Günün Kalori & Makro Durumu Kartı */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.liveIndicatorRow}>
              <View style={[styles.liveDot, isCalExceeded && { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.cardTagTitle, isCalExceeded && { color: '#EF4444' }]}>
                {isCalExceeded ? 'KALORİ HEDEFİ AŞILDI' : 'GÜNLÜK KALORİ DENGESİ'}
              </Text>
            </View>
            <Text style={[styles.percentTag, isCalExceeded && { color: '#EF4444' }]}>
              %{calProgress}
            </Text>
          </View>

          {/* Ortalı Kalori Alanı */}
          <View style={styles.primaryCalorieBox}>
            <Text style={[styles.primaryCalorieVal, isCalExceeded && { color: '#EF4444' }]}>
              {currentEatenCal.toLocaleString('tr-TR')}
            </Text>
            <Text style={styles.primaryCalorieSub}>
              / {targetCal.toLocaleString('tr-TR')} kcal tüketildi
            </Text>
          </View>

          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${calProgress}%`,
                  backgroundColor: isCalExceeded ? '#EF4444' : '#059669',
                },
              ]}
            />
          </View>

          {isCalExceeded ? (
            <View style={styles.exceededBadge}>
              <Ionicons name="alert-circle" size={15} color="#DC2626" />
              <Text style={styles.exceededBadgeText}>
                Günlük kalori hedefi {exceededAmount} kcal aşıldı!
              </Text>
            </View>
          ) : (
            <View style={styles.statusSubTextRow}>
              <Text style={styles.statusSubText}>
                {calDiff === 0 ? 'Hedefe tam ulaşıldı!' : `Hedefe ulaşmak için ${calDiff} kcal kaldı`}
              </Text>
            </View>
          )}

          {/* Makro Şeridi */}
          <View style={styles.macroStripContainer}>
            <View style={styles.macroItemCol}>
              <Text style={styles.macroItemLabel}>PROTEİN</Text>
              <Text style={[styles.macroItemVal, { color: '#059669' }]}>
                {Math.round(Number(totals.total_protein))}
                <Text style={styles.macroItemMax}>/{targets.protein_target}g</Text>
              </Text>
            </View>

            <View style={styles.macroDivider} />

            <View style={styles.macroItemCol}>
              <Text style={styles.macroItemLabel}>KARB</Text>
              <Text style={[styles.macroItemVal, { color: '#0284C7' }]}>
                {Math.round(Number(totals.total_carbs))}
                <Text style={styles.macroItemMax}>/{targets.carbs_target}g</Text>
              </Text>
            </View>

            <View style={styles.macroDivider} />

            <View style={styles.macroItemCol}>
              <Text style={styles.macroItemLabel}>SAĞLIKLI YAĞ</Text>
              <Text style={[styles.macroItemVal, { color: '#D97706' }]}>
                {Math.round(Number(totals.total_fats))}
                <Text style={styles.macroItemMax}>/{targets.fats_target}g</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* 2. AI Tarafından Kaydedilen Yemekler */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.liveIndicatorRow}>
              <Ionicons name="restaurant-outline" size={17} color="#059669" />
              <Text style={styles.cardTagTitle}>BUGÜN YENENLER (AI GÜNLÜK)</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{data?.today.meals.length || 0} Öğün</Text>
            </View>
          </View>

          {data?.today.meals && data.today.meals.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              {data.today.meals.map((m, idx) => (
                <View
                  key={m.id}
                  style={[
                    styles.mealItemRow,
                    idx === data.today.meals.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  {/* Kırmızı Yuvarlak Eksi Butonu */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    onPress={() => handleDeleteMeal(m.id, m.food_name)}
                    style={{
                      width: 22,
                      height: 22,
                      minWidth: 22,
                      minHeight: 22,
                      borderRadius: 11,
                      backgroundColor: '#EF4444',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                      flexShrink: 0,
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: 15,
                        fontWeight: '900',
                        lineHeight: 16,
                        textAlign: 'center',
                        marginTop: -2,
                      }}
                    >
                      -
                    </Text>
                  </TouchableOpacity>

                  {/* Yemek Başlığı ve Makro Detayları */}
                  <View style={styles.mealTextWrapper}>
                    <Text style={styles.mealItemTitle} numberOfLines={1}>{m.food_name}</Text>
                    <Text style={styles.mealItemMeta} numberOfLines={1}>
                      Saat {m.time} · {m.protein_g}g Protein · {m.carbs_g}g Karb
                    </Text>
                  </View>

                  {/* Sağ Kalori Rozeti */}
                  <View style={styles.badgeCal}>
                    <Text style={styles.badgeCalText}>+{m.calories} kcal</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyMealBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={32} color="#CBD5E1" />
              <Text style={styles.emptyMealTitle}>Bugün henüz bir öğün kaydetmedin.</Text>
              <Text style={styles.emptyMealSub}>
                AI Koç'a "150 gr tavuk pilav yedim" yaz, öğünün otomatik olarak buraya eklensin.
              </Text>
            </View>
          )}
        </View>

        {/* 3. AI Koç Dönemsel Raporu */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.liveIndicatorRow}>
              <Ionicons name="sparkles" size={17} color="#D97706" />
              <Text style={[styles.cardTagTitle, { color: '#B45309' }]}>AI KOÇ ANALİZ RAPORU</Text>
            </View>
          </View>

          <Text style={styles.reportIntroText}>
            Beslenme disiplinini net veriler ve kişiselleştirilmiş koçluk geri bildirimiyle incele.
          </Text>

          {/* Dönem Butonları */}
          <View style={styles.periodTabsRow}>
            <Pressable
              onPress={() => handleGenerateReport('daily')}
              disabled={reportLoading}
              style={[styles.periodTabBtn, reportPeriod === 'daily' && styles.periodTabBtnActive]}
            >
              <Text style={[styles.periodTabBtnText, reportPeriod === 'daily' && styles.periodTabBtnTextActive]}>
                Günlük Rapor
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleGenerateReport('weekly')}
              disabled={reportLoading}
              style={[styles.periodTabBtn, reportPeriod === 'weekly' && styles.periodTabBtnActive]}
            >
              <Text style={[styles.periodTabBtnText, reportPeriod === 'weekly' && styles.periodTabBtnTextActive]}>
                Haftalık Rapor
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleGenerateReport('monthly')}
              disabled={reportLoading}
              style={[styles.periodTabBtn, reportPeriod === 'monthly' && styles.periodTabBtnActive]}
            >
              <Text style={[styles.periodTabBtnText, reportPeriod === 'monthly' && styles.periodTabBtnTextActive]}>
                Aylık Rapor
              </Text>
            </Pressable>
          </View>

          {reportLoading && (
            <View style={styles.reportLoadingBox}>
              <ActivityIndicator size="small" color="#059669" />
              <Text style={styles.reportLoadingText}>
                AI Koç verilerini analiz edip tabloyu hazırlıyor…
              </Text>
            </View>
          )}

          {/* RAPOR VERİ TABLOSU VE İÇGÖRÜLER */}
          {aiReport && !reportLoading && (
            <View style={{ marginTop: 10 }}>
              <View style={styles.tableCard}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>METRİK</Text>
                  <Text style={styles.tableHeadCell}>HEDEF</Text>
                  <Text style={styles.tableHeadCell}>ALINAN</Text>
                  <Text style={[styles.tableHeadCell, { textAlign: 'right' }]}>DURUM</Text>
                </View>

                {/* Kalori */}
                <View style={styles.tableBodyRow}>
                  <Text style={[styles.tableBodyName, { flex: 1.2 }]}>🔥 Kalori</Text>
                  <Text style={styles.tableBodyVal}>{targetCal}</Text>
                  <Text style={styles.tableBodyVal}>{currentEatenCal}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <View style={[styles.statusPill, isCalExceeded ? styles.pillRed : styles.pillGreen]}>
                      <Text style={[styles.statusPillText, isCalExceeded ? styles.pillTextRed : styles.pillTextGreen]}>
                        {isCalExceeded ? `+${exceededAmount}` : calDiff === 0 ? 'Sınırda' : `${calDiff} kaldı`}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Protein */}
                <View style={styles.tableBodyRow}>
                  <Text style={[styles.tableBodyName, { flex: 1.2 }]}>🥩 Protein</Text>
                  <Text style={styles.tableBodyVal}>{targets.protein_target}g</Text>
                  <Text style={styles.tableBodyVal}>{Math.round(Number(totals.total_protein))}g</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <View style={[styles.statusPill, proteinDiff > 10 ? styles.pillAmber : styles.pillGreen]}>
                      <Text style={[styles.statusPillText, proteinDiff > 10 ? styles.pillTextAmber : styles.pillTextGreen]}>
                        {proteinDiff > 0 ? `-${proteinDiff}g` : 'Hedefte'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Karbonhidrat */}
                <View style={styles.tableBodyRow}>
                  <Text style={[styles.tableBodyName, { flex: 1.2 }]}>🌾 Karb</Text>
                  <Text style={styles.tableBodyVal}>{targets.carbs_target}g</Text>
                  <Text style={styles.tableBodyVal}>{Math.round(Number(totals.total_carbs))}g</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <View style={[styles.statusPill, styles.pillSlate]}>
                      <Text style={[styles.statusPillText, styles.pillTextSlate]}>
                        %{Math.round((totals.total_carbs / (targets.carbs_target || 1)) * 100)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Yağ */}
                <View style={[styles.tableBodyRow, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.tableBodyName, { flex: 1.2 }]}>🥑 Yağ</Text>
                  <Text style={styles.tableBodyVal}>{targets.fats_target}g</Text>
                  <Text style={styles.tableBodyVal}>{Math.round(Number(totals.total_fats))}g</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <View style={[styles.statusPill, totals.total_fats > targets.fats_target ? styles.pillRed : styles.pillSlate]}>
                      <Text style={[styles.statusPillText, totals.total_fats > targets.fats_target ? styles.pillTextRed : styles.pillTextSlate]}>
                        {totals.total_fats > targets.fats_target ? 'Yüksek' : 'Dengeli'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <ReportCardsViewer report={aiReport} />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportCardsViewer({ report }: { report: string }) {
  const cleanReport = report
    .replace(/^Selam.*?değerlendirmemiz:\s*/i, '')
    .trim();

  const rawSections = cleanReport.split(/\n(?=\s*[\*\-]\s*\*\*)/g);

  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      {rawSections.map((sec, idx) => {
        const titleMatch = sec.match(/[\*\-]\s*\*\*(.*?)\*\*:?/);
        const title = titleMatch ? titleMatch[1].replace(/:$/, '').trim() : '';
        let body = sec.replace(/[\*\-]\s*\*\*.*?\*\*:?/, '').trim();
        body = body.replace(/\*\*/g, '').replace(/^\s*[\*\-]\s*/gm, '• ');

        let iconName: any = 'bulb-outline';
        let cardBg = '#F8FAFC';
        let borderColor = '#E2E8F0';
        let badgeColor = '#059669';

        if (title.toLowerCase().includes('özet')) {
          iconName = 'analytics-outline';
          badgeColor = '#0284C7';
        } else if (title.toLowerCase().includes('ihtiyaç') || title.toLowerCase().includes('kalan')) {
          iconName = 'alert-circle-outline';
          badgeColor = '#D97706';
        } else if (title.toLowerCase().includes('öğün') || title.toLowerCase().includes('tavsiye')) {
          iconName = 'fast-food-outline';
          cardBg = '#F0FDF4';
          borderColor = '#A7F3D0';
          badgeColor = '#059669';
        } else if (title.toLowerCase().includes('hatırlatma') || title.toLowerCase().includes('kapanış')) {
          iconName = 'shield-checkmark-outline';
          badgeColor = '#6366F1';
        }

        return (
          <View key={idx} style={[styles.aiCard, { backgroundColor: cardBg, borderColor }]}>
            {title ? (
              <View style={styles.aiCardHeader}>
                <Ionicons name={iconName} size={15} color={badgeColor} />
                <Text style={[styles.aiCardTitle, { color: badgeColor }]}>{title.toUpperCase()}</Text>
              </View>
            ) : null}
            <Text style={styles.aiCardBody}>{body || sec}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  screenHeader: {
    paddingVertical: 6,
    marginBottom: 8,
  },
  screenHeaderSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  screenHeaderTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    marginTop: 2,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  cardTagTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  percentTag: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
  },

  primaryCalorieBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  primaryCalorieVal: {
    fontSize: 36,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },
  primaryCalorieSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 1,
  },
  progressBarBg: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  statusSubTextRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  statusSubText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  exceededBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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

  macroStripContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  macroItemCol: {
    flex: 1,
    alignItems: 'center',
  },
  macroItemLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  macroItemVal: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  macroItemMax: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  macroDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
  },

  countBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  mealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  mealTextWrapper: {
    flex: 1,
    marginRight: 8,
  },
  mealItemTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  mealItemMeta: {
    color: '#6B7280',
    fontSize: 11.5,
    marginTop: 2,
  },
  badgeCal: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  badgeCalText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyMealBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyMealTitle: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  emptyMealSub: {
    color: '#9CA3AF',
    fontSize: 11.5,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 16,
  },

  reportIntroText: {
    color: '#6B7280',
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 12,
  },
  periodTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  periodTabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTabBtnActive: {
    backgroundColor: '#059669',
  },
  periodTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  periodTabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  reportLoadingBox: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  reportLoadingText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },

  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableHeadCell: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableBodyName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#111827',
  },
  tableBodyVal: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#374151',
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  pillGreen: { backgroundColor: '#ECFDF5' },
  pillTextGreen: { color: '#059669' },
  pillRed: { backgroundColor: '#FEF2F2' },
  pillTextRed: { color: '#DC2626' },
  pillAmber: { backgroundColor: '#FFFBEB' },
  pillTextAmber: { color: '#D97706' },
  pillSlate: { backgroundColor: '#F3F4F6' },
  pillTextSlate: { color: '#4B5563' },

  aiCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  aiCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiCardBody: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
  },
});

export default ProgressScreen;