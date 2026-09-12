import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Image, Pressable, Alert, TextInput, ActivityIndicator,
  Dimensions, Modal, RefreshControl, KeyboardAvoidingView, Platform, Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { colors } from '@/theme/colors';
import { useUserStore } from '@/store/userStore';
import {
  useProgressPhotos, useUploadProgressPhoto, useDeleteProgressPhoto,
  useDashboard, usePhotoAnalysis,
  type ProgressPhoto,
} from '@/api/queries';
import { API_BASE_URL } from '@/api/client';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Card } from '@/components/Card';
import { LinearGradient } from 'expo-linear-gradient';

const COLUMNS = 3;
const GAP = 8;

export function ProgressPhotosScreen() {
  const navigation = useNavigation();
  const userId = useUserStore((s) => s.userId);
  const q = useProgressPhotos(userId);
  const dash = useDashboard(userId);
  const upload = useUploadProgressPhoto(userId);
  const del = useDeleteProgressPhoto(userId);

  const isPremium = !!dash.data?.user?.is_premium;
  const photoCount = q.data?.length ?? 0;
  const analysis = usePhotoAnalysis(userId, isPremium, photoCount);

  // Baseline waist from onboarding — used to compute a delta when the user only has
  // one photo so far (previous photo doesn't exist yet).
  const startingWaist = dash.data?.user?.starting_waist_cm != null
    ? Number(dash.data.user.starting_waist_cm) || null
    : null;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [waistInput, setWaistInput] = useState('');
  const [viewer, setViewer] = useState<ProgressPhoto | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const tileSize = (screenWidth - 32 - GAP * (COLUMNS - 1)) / COLUMNS;

  const photos = q.data ?? [];
  const latest = photos[0];
  const previous = photos[1];

  const pickFromLibrary = async () => {
    Haptics.selectionAsync();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Galeri erişimine izin vermelisin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled) return;
    setPendingUri(result.assets[0].uri);
    setPickerOpen(true);
  };

  const takePhoto = async () => {
    Haptics.selectionAsync();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Kamera erişimine izin vermelisin.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled) return;
    setPendingUri(result.assets[0].uri);
    setPickerOpen(true);
  };

  const closeUploadModal = () => {
    Keyboard.dismiss();
    setPickerOpen(false);
    setPendingUri(null);
    setWaistInput('');
  };

  const confirmUpload = async () => {
    if (!pendingUri) return;
    Keyboard.dismiss();
    try {
      const waistRaw = waistInput.trim();
      const waist = waistRaw ? Number(waistRaw) : undefined;
      if (waist != null && (!Number.isFinite(waist) || waist < 40 || waist > 200)) {
        Alert.alert('Geçersiz bel ölçüsü', 'Bel ölçüsü 40 – 200 cm arasında olmalı.');
        return;
      }
      await upload.mutateAsync({ uri: pendingUri, waist_cm: waist });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPickerOpen(false);
      setPendingUri(null);
      setWaistInput('');
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Lütfen tekrar dene.');
    }
  };

  const confirmDelete = (photo: ProgressPhoto) => {
    Alert.alert(
      'Fotoğrafı sil',
      `${formatDate(photo.photo_date)} tarihli fotoğraf silinsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await del.mutateAsync(photo.id);
              setViewer(null);
            } catch (err: any) {
              Alert.alert('Silinemedi', err?.message ?? 'Lütfen tekrar dene.');
            }
          },
        },
      ],
    );
  };

  const compareLine = useMemo(() => {
    if (!latest) return null;
    const a = Number(latest.waist_cm);
    if (!Number.isFinite(a)) return null;

    // Prefer comparison to previous photo. If there isn't one yet, fall back to the
    // onboarding baseline so the user gets feedback from upload #1.
    let baselineValue: number | null = null;
    let baselineLabel = '';
    if (previous) {
      const b = Number(previous.waist_cm);
      if (Number.isFinite(b)) { baselineValue = b; baselineLabel = 'son yüklemen'; }
    }
    if (baselineValue == null && startingWaist != null) {
      baselineValue = startingWaist;
      baselineLabel = 'başlangıcın';
    }
    if (baselineValue == null) return null;

    const delta = a - baselineValue;
    if (Math.abs(delta) < 0.05) return `Bel ölçün ${baselineLabel}la aynı.`;
    const sign = delta < 0 ? 'azalmış' : 'artmış';
    return `Bel ölçün ${baselineLabel}a göre ${Math.abs(delta).toFixed(1)} cm ${sign}.`;
  }, [latest, previous, startingWaist]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ color: colors.textHi, fontSize: 22, fontWeight: '600' }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <View className="flex-row items-center">
            <Text style={{ color: colors.textHi, fontSize: 16, fontWeight: '700' }}>
              Bel Görsel Takibi
            </Text>
            <View
              style={{
                marginLeft: 8,
                paddingHorizontal: 8, paddingVertical: 2,
                borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.15)',
                borderWidth: 1, borderColor: colors.warning,
              }}
            >
              <Text style={{ color: colors.warning, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }}>
                PREMIUM
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.textLow, fontSize: 11, marginTop: 1 }}>
            Görsel ilerleme — yağ oranı ölçümü değil
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 130, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={q.refetch} tintColor={colors.textLow} />
        }
      >
        {/* Recent comparison */}
        {latest ? (
          <Card>
            <Text className="text-textLow text-[10px] uppercase tracking-widest mb-2">
              EN SON YÜKLEMEN
            </Text>
            <View className="flex-row items-center">
              <Image
                source={{ uri: photoUri(latest) }}
                style={{ width: 84, height: 110, borderRadius: 12, backgroundColor: colors.surface2 }}
                resizeMode="cover"
              />
              <View style={{ flex: 1, paddingLeft: 14 }}>
                <Text className="text-textHi text-base font-semibold">
                  {formatDate(latest.photo_date)}
                </Text>
                {latest.waist_cm != null ? (
                  <Text className="text-textMid text-sm mt-1">
                    Bel: <Text style={{ color: colors.textHi, fontWeight: '700' }}>{Number(latest.waist_cm)} cm</Text>
                  </Text>
                ) : null}
                {compareLine ? (
                  <Text className="text-textMid text-xs mt-2" style={{ lineHeight: 16 }}>
                    {compareLine}
                  </Text>
                ) : (
                  <Text className="text-textLow text-xs mt-2" style={{ lineHeight: 16 }}>
                    İkinci yüklemenden sonra karşılaştırma açılacak.
                  </Text>
                )}
              </View>
            </View>
          </Card>
        ) : (
          <Card>
            <Text className="text-textHi text-base font-semibold">İlk fotoğrafını yükle</Text>
            <Text className="text-textMid text-sm mt-2" style={{ lineHeight: 18 }}>
              Aynı ışık, aynı açı, mümkünse aynı kıyafet — haftada bir kez yükle.
              Karar motoru kilo ve bel verisiyle birlikte değerlendirir.
            </Text>
          </Card>
        )}

        {/* AI Vision comment card — premium */}
        {photoCount > 0 ? (
          <View className="mt-4">
            {isPremium ? (
              <AnalysisCard
                loading={analysis.isLoading}
                text={analysis.data?.analysis ?? null}
                cached={!!analysis.data?.cached}
                status={analysis.data?.status ?? null}
                statusMessage={analysis.data?.message ?? null}
              />
            ) : (
              <LockedAnalysisCard />
            )}
          </View>
        ) : null}

        {/* Action row */}
        <View className="flex-row mt-4" style={{ gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Galeriden Seç" onPress={pickFromLibrary} variant="ghost" />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Fotoğraf Çek" onPress={takePhoto} />
          </View>
        </View>

        {/* Gallery */}
        {photos.length > 0 ? (
          <>
            <Text className="text-textHi text-base font-semibold mt-6 mb-3">
              {photos.length > 1 ? 'Geçmiş' : 'Yüklediklerin'}
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: GAP }}>
              {photos.map((p) => (
                <View key={p.id} style={{ width: tileSize, height: tileSize * 1.25 }}>
                  {/* Image (tap to zoom) */}
                  <Pressable
                    onPress={() => setViewer(p)}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <Image
                      source={{ uri: photoUri(p) }}
                      style={{
                        width: '100%', height: '100%', borderRadius: 12,
                        backgroundColor: colors.surface2,
                      }}
                      resizeMode="cover"
                    />
                    <View
                      style={{
                        position: 'absolute', bottom: 6, left: 6, right: 6,
                        paddingHorizontal: 6, paddingVertical: 2,
                        borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
                        {formatDateShort(p.photo_date)}
                        {p.waist_cm != null ? ` · ${Number(p.waist_cm)}cm` : ''}
                      </Text>
                    </View>
                  </Pressable>

                  {/* × delete button — top-right overlay */}
                  <Pressable
                    onPress={() => confirmDelete(p)}
                    hitSlop={8}
                    style={{
                      position: 'absolute',
                      top: -6, right: -6,
                      width: 26, height: 26, borderRadius: 13,
                      backgroundColor: colors.danger,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2, borderColor: colors.bg,
                      shadowColor: '#000',
                      shadowOpacity: 0.4,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 6,
                    }}
                  >
                    <Text style={{
                      color: '#fff', fontSize: 14, fontWeight: '900', marginTop: -1,
                    }}>
                      ×
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Privacy / framing note */}
        <View className="mt-6">
          <Card>
            <Text className="text-textLow text-[10px] uppercase tracking-widest mb-2">NASIL ÇALIŞIR</Text>
            <Text className="text-textMid text-sm" style={{ lineHeight: 18 }}>
              Diet-Co "yağ oranın şu" gibi tıbbi iddia yapmaz. Fotoğrafların, kilo + bel ölçüsü + uyum
              verisiyle birlikte AI Karar Motoru'na sinyal verir — örn. "Kilon sabit ama bel ölçün ve görsel
              değişim olumlu, recomp sinyali" gibi.
            </Text>
          </Card>
        </View>
      </ScrollView>

      {/* Upload confirm modal — keyboard-aware + tap-outside-to-close */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={closeUploadModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Backdrop — tap closes BOTH keyboard and modal */}
          <Pressable
            onPress={closeUploadModal}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          >
            {/* Sheet — tapping the sheet itself dismisses keyboard but keeps modal open */}
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: 24, borderTopRightRadius: 24,
                  padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
                  borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0,
                }}
              >
                {/* Drag handle */}
                <View
                  style={{
                    width: 36, height: 4, borderRadius: 2,
                    backgroundColor: colors.border,
                    alignSelf: 'center', marginBottom: 12,
                  }}
                />
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-textHi text-base font-semibold">Yüklemeyi onayla</Text>
                  <Pressable onPress={closeUploadModal} hitSlop={10}>
                    <Text style={{ color: colors.textLow, fontSize: 22 }}>×</Text>
                  </Pressable>
                </View>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {pendingUri ? (
                    <Image
                      source={{ uri: pendingUri }}
                      style={{
                        width: '100%', height: 200, borderRadius: 14,
                        backgroundColor: colors.surface2,
                      }}
                      resizeMode="cover"
                    />
                  ) : null}
                  <Text className="text-textMid text-xs mt-3 mb-2">Bel ölçün (opsiyonel)</Text>
                  <TextInput
                    value={waistInput}
                    onChangeText={setWaistInput}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={Keyboard.dismiss}
                    placeholder="84"
                    placeholderTextColor={colors.textLow}
                    style={{
                      backgroundColor: colors.surface2,
                      borderColor: colors.border, borderWidth: 1, borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 12,
                      color: colors.textHi, fontSize: 15,
                    }}
                  />
                  <View className="flex-row mt-4" style={{ gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton label="Vazgeç" variant="ghost" onPress={closeUploadModal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        label={upload.isPending ? 'Yorumlanıyor…' : 'Yükle'}
                        onPress={confirmUpload}
                        loading={upload.isPending}
                      />
                    </View>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full-screen viewer with delete */}
      <Modal visible={!!viewer} animationType="fade" transparent onRequestClose={() => setViewer(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <View className="flex-row items-center justify-between px-4 pt-2">
              <Pressable
                onPress={() => setViewer(null)}
                hitSlop={12}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 }}>×</Text>
              </Pressable>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                {viewer ? formatDate(viewer.photo_date) : ''}
              </Text>
              <Pressable
                onPress={() => viewer && confirmDelete(viewer)}
                hitSlop={12}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: 'rgba(239,68,68,0.25)',
                  borderWidth: 1, borderColor: colors.danger,
                }}
              >
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
                  SİL
                </Text>
              </Pressable>
            </View>
            {viewer ? (
              <View className="flex-1 items-center justify-center px-4">
                <Image
                  source={{ uri: photoUri(viewer) }}
                  style={{ width: '100%', height: '80%', borderRadius: 16 }}
                  resizeMode="contain"
                />
                {viewer.waist_cm != null ? (
                  <Text style={{ color: '#fff', marginTop: 16, fontSize: 14 }}>
                    Bel: {Number(viewer.waist_cm)} cm
                  </Text>
                ) : null}
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AnalysisCard({
  loading, text, cached, status, statusMessage,
}: {
  loading: boolean;
  text: string | null;
  cached: boolean;
  status: 'rate_limited' | 'unavailable' | 'no_analysis_yet' | null;
  statusMessage: string | null;
}) {
  const isWarning = status === 'rate_limited' || status === 'unavailable' || status === 'no_analysis_yet';
  return (
    <LinearGradient
      colors={isWarning
        ? ['rgba(245,158,11,0.18)', 'rgba(18,24,38,0.4)']
        : ['rgba(124,77,255,0.20)', 'rgba(245,158,11,0.08)']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: colors.border,
      }}
    >
      <View className="flex-row items-center mb-2">
        <View
          style={{
            width: 8, height: 8, borderRadius: 8,
            backgroundColor: isWarning ? colors.warning : colors.primary,
            marginRight: 8,
          }}
        />
        <Text style={{ color: colors.textLow, fontSize: 10, letterSpacing: 1.4, fontWeight: '700' }}>
          AI GÖRSEL YORUMU
        </Text>
        <View
          style={{
            marginLeft: 8,
            paddingHorizontal: 7, paddingVertical: 2,
            borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.15)',
            borderWidth: 1, borderColor: colors.warning,
          }}
        >
          <Text style={{ color: colors.warning, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 }}>
            PREMIUM
          </Text>
        </View>
        {cached && !isWarning ? (
          <Text style={{ color: colors.textLow, fontSize: 9, marginLeft: 'auto' }}>cache</Text>
        ) : null}
      </View>
      {loading ? (
        <View className="flex-row items-center" style={{ paddingVertical: 6 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.textMid, fontSize: 13, marginLeft: 10 }}>
            Görsel değerlendiriliyor…
          </Text>
        </View>
      ) : isWarning ? (
        <View className="flex-row items-start">
          <Text style={{ fontSize: 16, marginRight: 8, marginTop: -1 }}>
            {status === 'no_analysis_yet' ? '📸' : '⏳'}
          </Text>
          <Text style={{ color: colors.textMid, fontSize: 13, lineHeight: 19, flex: 1 }}>
            {statusMessage ||
              (status === 'rate_limited'
                ? 'AI günlük kullanım limiti doldu. Yarın tekrar dene.'
              : status === 'no_analysis_yet'
                ? 'Bu fotoğraf için AI yorumu henüz hazır değil. Yeni fotoğraf yüklediğinde otomatik üretilecek.'
                : 'AI yorumu şu an üretilemedi. Birazdan tekrar dene.')}
          </Text>
        </View>
      ) : text ? (
        <Text style={{ color: colors.textHi, fontSize: 14, lineHeight: 20 }}>{text}</Text>
      ) : (
        <Text style={{ color: colors.textLow, fontSize: 12, lineHeight: 18 }}>
          Yorum henüz hazır değil. Birazdan tekrar dene.
        </Text>
      )}
    </LinearGradient>
  );
}

function LockedAnalysisCard() {
  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border,
        padding: 16,
        overflow: 'hidden',
      }}
    >
      <View className="flex-row items-center mb-2">
        <Text style={{ fontSize: 16, marginRight: 8 }}>🔒</Text>
        <Text style={{ color: colors.textHi, fontSize: 14, fontWeight: '700' }}>
          AI Görsel Yorumu — Premium
        </Text>
      </View>
      <Text style={{ color: colors.textMid, fontSize: 12.5, lineHeight: 18 }}>
        AI, yüklediğin fotoğrafları ve bel ölçünü birlikte değerlendirip görsel değişim hakkında
        Türkçe kısa bir yorum üretir. Bu özellik, iOS aboneliği başladığında otomatik açılır.
      </Text>
    </View>
  );
}

function photoUri(p: ProgressPhoto) {
  return `${API_BASE_URL}/uploads/${p.file_path}`;
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}
function formatDateShort(s: string) {
  try {
    return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  } catch { return s; }
}
