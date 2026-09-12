// frontend/src/screens/ProgressScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  const fetchProgress = useCallback(async () => {
    try {
      const res = await api.get<ProgressData>(`/api/progress/${userId}`);
      setData(res.data);
    } catch (err) {
      console.error('Progress fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProgress();
  };

  const handleGenerateReport = async (period: 'daily' | 'weekly' | 'monthly') => {
    setReportPeriod(period);
    setReportLoading(true);
    setAiReport(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await api.post<{ report: string }>(`/api/progress/${userId}/ai-report`, { period });
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

  // Tablo İçin Durum Rozetleri
  const proteinDiff = Math.round(Number(targets.protein_target) - Number(totals.total_protein));
  const calDiff = Math.round(targetCal - currentEatenCal);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 170 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Başlık */}
        <View style={{ marginBottom: 18 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textLow, letterSpacing: 1 }}>GELİŞİM & RAPORLAR</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.textHi, marginTop: 2 }}>Günlük İlerleme</Text>
        </View>

        {/* Günün Makro Durumu */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <Text style={styles.cardTitle}>BUGÜNÜN KALORİ ÖZETİ</Text>
            <Text style={[{ color: colors.textMid, fontSize: 13, fontWeight: '600' }, isCalExceeded && { color: '#EF4444', fontWeight: '800' }]}>
              {currentEatenCal} / {targetCal} kcal
            </Text>
          </View>

          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${calProgress}%`,
                  backgroundColor: isCalExceeded ? '#EF4444' : colors.primary,
                },
              ]}
            />
          </View>

          {isCalExceeded && (
            <View style={styles.exceededBadge}>
              <Ionicons name="alert-circle" size={15} color="#DC2626" />
              <Text style={styles.exceededBadgeText}>
                Günlük kalori hedefi {exceededAmount} kcal aşıldı!
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textHi }}>Protein Alımı</Text>
            <Text style={{ color: colors.textMid, fontSize: 13, fontWeight: '600' }}>
              {totals.total_protein} / {targets.protein_target}g (%{proProgress})
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${proProgress}%`, backgroundColor: '#38BDF8' }]} />
          </View>

          <View style={{ flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 12 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.textLow, fontSize: 11, fontWeight: '600' }}>Karbonhidrat</Text>
              <Text style={{ color: colors.textHi, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{totals.total_carbs}g</Text>
            </View>
            <View style={{ width: 1, height: '100%', backgroundColor: colors.border }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.textLow, fontSize: 11, fontWeight: '600' }}>Sağlıklı Yağ</Text>
              <Text style={{ color: colors.textHi, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{totals.total_fats}g</Text>
            </View>
          </View>
        </View>

        {/* AI Tarafından Kaydedilen Yemekler */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="restaurant-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>BUGÜN YENENLER (AI GÜNLÜK)</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.textLow }}>{data?.today.meals.length || 0} Öğün</Text>
          </View>

          {data?.today.meals && data.today.meals.length > 0 ? (
            data.today.meals.map((m) => (
              <View key={m.id} style={styles.mealItem}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textHi, fontSize: 14, fontWeight: '700' }}>{m.food_name}</Text>
                  <Text style={{ color: colors.textLow, fontSize: 12, marginTop: 2 }}>
                    Saat {m.time} · {m.protein_g}g Protein · {m.carbs_g}g Karb
                  </Text>
                </View>
                <View style={styles.badgeCal}>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>+{m.calories} kcal</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={{ paddingVertical: 18, alignItems: 'center' }}>
              <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.textLow} />
              <Text style={{ color: colors.textMid, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                Bugün henüz bir şey yazmadın.
              </Text>
              <Text style={{ color: colors.textLow, fontSize: 11, marginTop: 2, textAlign: 'center' }}>
                AI Koç'a "150 gr tavuk pilav yedim" yaz, otomatik buraya eklensin.
              </Text>
            </View>
          )}
        </View>

        {/* AI Koç Dönemsel Raporu */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Ionicons name="sparkles" size={18} color="#F59E0B" />
            <Text style={[styles.cardTitle, { color: '#B45309' }]}>AI KOÇ ANALİZ RAPORU</Text>
          </View>

          <Text style={{ color: colors.textMid, fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
            Beslenme disiplinini net veriler ve stratejik koçluk geri bildirimiyle incele.
          </Text>

          {/* Dönem Butonları */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <Pressable
              onPress={() => handleGenerateReport('daily')}
              disabled={reportLoading}
              style={[styles.reportBtn, reportPeriod === 'daily' && styles.reportBtnActive]}
            >
              <Text style={[styles.reportBtnText, reportPeriod === 'daily' && styles.reportBtnTextActive]}>
                Günlük Rapor
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleGenerateReport('weekly')}
              disabled={reportLoading}
              style={[styles.reportBtn, reportPeriod === 'weekly' && styles.reportBtnActive]}
            >
              <Text style={[styles.reportBtnText, reportPeriod === 'weekly' && styles.reportBtnTextActive]}>
                Haftalık Rapor
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleGenerateReport('monthly')}
              disabled={reportLoading}
              style={[styles.reportBtn, reportPeriod === 'monthly' && styles.reportBtnActive]}
            >
              <Text style={[styles.reportBtnText, reportPeriod === 'monthly' && styles.reportBtnTextActive]}>
                Aylık Rapor
              </Text>
            </Pressable>
          </View>

          {reportLoading && (
            <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textMid, fontSize: 13, fontWeight: '600' }}>
                AI Koç verilerini analiz edip tabloyu hazırlıyor…
              </Text>
            </View>
          )}

          {/* ⚡ RAPOR AÇILDIĞINDA GÖRÜNEN YENİ UI / UX BÖLÜMÜ */}
          {aiReport && !reportLoading && (
            <View style={{ marginTop: 6 }}>
              {/* 1. NET DURUM TABLOSU */}
              <View style={styles.tableCard}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>METRİK</Text>
                  <Text style={styles.tableHeadCell}>HEDEF</Text>
                  <Text style={styles.tableHeadCell}>ALINAN</Text>
                  <Text style={[styles.tableHeadCell, { textAlign: 'right' }]}>DURUM</Text>
                </View>

                {/* Kalori Satırı */}
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

                {/* Protein Satırı */}
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

                {/* Karbonhidrat Satırı */}
                <View style={styles.tableBodyRow}>
                  <Text style={[styles.tableBodyName, { flex: 1.2 }]}>🌾 Karb</Text>
                  <Text style={styles.tableBodyVal}>{targets.carbs_target}g</Text>
                  <Text style={styles.tableBodyVal}>{Math.round(Number(totals.total_carbs))}g</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <View style={[styles.statusPill, styles.pillSlate]}>
                      <Text style={[styles.statusPillText, styles.pillTextSlate]}>%{Math.round((totals.total_carbs / (targets.carbs_target || 1)) * 100)}</Text>
                    </View>
                  </View>
                </View>

                {/* Yağ Satırı */}
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

              {/* 2. OKUNABİLİR KOÇ İÇGÖRÜ KARTLARI */}
              <ReportCardsViewer report={aiReport} />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ⚡ Ham Metni Ayrıştırıp Modern UI Kartlarına Çeviren Bileşen
function ReportCardsViewer({ report }: { report: string }) {
  const cleanReport = report
    .replace(/^Selam.*?değerlendirmemiz:\s*/i, '')
    .trim();

  // Maddeleri böl
  const rawSections = cleanReport.split(/\n(?=\s*[\*\-]\s*\*\*)/g);

  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      {rawSections.map((sec, idx) => {
        const titleMatch = sec.match(/[\*\-]\s*\*\*(.*?)\*\*:?/);
        const title = titleMatch ? titleMatch[1].replace(/:$/, '').trim() : '';
        let body = sec.replace(/[\*\-]\s*\*\*.*?\*\*:?/, '').trim();

        // Fazla markdown işaretlerini temizle
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
                <Ionicons name={iconName} size={16} color={badgeColor} />
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 11, fontWeight: '800', color: colors.textLow, letterSpacing: 0.8 },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', borderRadius: 4 },
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
  mealItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface2,
  },
  badgeCal: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reportBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reportBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textMid,
  },
  reportBtnTextActive: {
    color: '#FFFFFF',
  },

  // ⚡ Tablo Tasarımı
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHeadCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableBodyName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  tableBodyVal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pillGreen: { backgroundColor: '#ECFDF5' },
  pillTextGreen: { color: '#059669' },
  pillRed: { backgroundColor: '#FEF2F2' },
  pillTextRed: { color: '#DC2626' },
  pillAmber: { backgroundColor: '#FFFBEB' },
  pillTextAmber: { color: '#D97706' },
  pillSlate: { backgroundColor: '#F1F5F9' },
  pillTextSlate: { color: '#475569' },

  // ⚡ Koç İçgörü Kartları
  aiCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  aiCardTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiCardBody: {
    fontSize: 13.5,
    color: '#334155',
    lineHeight: 20.5,
  },
});

export default ProgressScreen;