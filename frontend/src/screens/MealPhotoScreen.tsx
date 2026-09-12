import React, { useState } from 'react';
import {
  View, Text, ScrollView, Image, Pressable, Alert, TextInput, ActivityIndicator,
  RefreshControl, Modal, Dimensions, KeyboardAvoidingView, Platform, Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { useUserStore } from '@/store/userStore';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  useMealPhotos, useUploadMealPhoto, useCorrectMealPhoto, useDeleteMealPhoto,
  type MealPhotoRow, type MealPhotoUploadResponse,
} from '@/api/queries';
import { API_BASE_URL } from '@/api/client';

export function MealPhotoScreen() {
  const navigation = useNavigation();
  const userId = useUserStore((s) => s.userId);

  const list = useMealPhotos(userId);
  const upload = useUploadMealPhoto(userId);
  const correct = useCorrectMealPhoto(userId);
  const del = useDeleteMealPhoto(userId);

  const [lastUpload, setLastUpload] = useState<MealPhotoUploadResponse | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editKcal, setEditKcal] = useState('');
  const [editProtein, setEditProtein] = useState('');

  const screenWidth = Dimensions.get('window').width;
  const tileSize = (screenWidth - 32 - 8) / 2;

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
    await doUpload(result.assets[0].uri);
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
    await doUpload(result.assets[0].uri);
  };

  const doUpload = async (uri: string) => {
    try {
      const res = await upload.mutateAsync({ uri });
      setLastUpload(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Tekrar dene.');
    }
  };

  const openEditor = (row: MealPhotoRow) => {
    setEditingId(row.id);
    setEditLabel(row.user_label ?? row.ai_label ?? '');
    setEditKcal(String(row.user_kcal ?? row.estimated_kcal ?? ''));
    setEditProtein(String(row.user_protein_g ?? row.estimated_protein_g ?? ''));
  };
  const closeEditor = () => {
    Keyboard.dismiss();
    setEditingId(null);
    setEditLabel(''); setEditKcal(''); setEditProtein('');
  };
  const saveEdit = async () => {
    if (!editingId) return;
    Keyboard.dismiss();
    try {
      await correct.mutateAsync({
        id: editingId,
        user_label: editLabel.trim() || undefined,
        user_kcal: editKcal ? Number(editKcal) : undefined,
        user_protein_g: editProtein ? Number(editProtein) : undefined,
      });
      closeEditor();
    } catch (err: any) {
      Alert.alert('Kaydedilemedi', err?.message ?? 'Tekrar dene.');
    }
  };

  const confirmDelete = (row: MealPhotoRow) => {
    Alert.alert(
      'Fotoğrafı sil',
      'Bu öğün tahmini silinsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try { await del.mutateAsync(row.id); } catch { /* ignore */ }
          },
        },
      ]
    );
  };

  const photos = list.data ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ color: colors.textHi, fontSize: 22 }}>‹</Text>
        </Pressable>
        <View className="flex-row items-center" style={{ marginLeft: 8, flex: 1 }}>
          <Text style={{ color: colors.textHi, fontSize: 16, fontWeight: '700' }}>
            Fotoğraflı Öğün Tahmini
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
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={list.isFetching && !list.isLoading}
            onRefresh={list.refetch}
            tintColor={colors.textLow}
          />
        }
      >
        {/* Capture buttons */}
        <View className="flex-row" style={{ gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Galeriden Seç" variant="ghost" onPress={pickFromLibrary} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Foto Çek" onPress={takePhoto} />
          </View>
        </View>

        {/* Upload loading state */}
        {upload.isPending ? (
          <View
            style={{
              marginTop: 16, padding: 16,
              backgroundColor: colors.surface,
              borderRadius: 16, borderWidth: 1, borderColor: colors.border,
            }}
          >
            <View className="flex-row items-center">
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textMid, fontSize: 13, marginLeft: 12 }}>
                Yemek değerlendiriliyor…
              </Text>
            </View>
          </View>
        ) : null}

        {/* Last upload result */}
        {!upload.isPending && lastUpload ? (
          <View style={{ marginTop: 16 }}>
            <ResultCard
              data={lastUpload}
              onEdit={() => openEditor(lastUpload.row)}
              onClose={() => setLastUpload(null)}
            />
          </View>
        ) : null}

        {/* "Bu tahmindir" framing */}
        <View
          style={{
            marginTop: 16, padding: 12,
            backgroundColor: 'rgba(245,158,11,0.10)',
            borderRadius: 12, borderWidth: 1, borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>
            ⚠ NASIL ÇALIŞIR
          </Text>
          <Text style={{ color: colors.textMid, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
            Diet-Co tahmini değer üretir, kesin tartı değildir. Hassasiyet gerekiyorsa
            kendi düzeltmeni gir — sistem zamanla öğrenir.
          </Text>
        </View>

        {/* History */}
        {photos.length > 0 ? (
          <>
            <Text className="text-textHi text-base font-semibold mt-6 mb-3">Son Tahminler</Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {photos.map((p) => (
                <HistoryTile
                  key={p.id}
                  row={p}
                  size={tileSize}
                  onPress={() => openEditor(p)}
                  onDelete={() => confirmDelete(p)}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Edit modal */}
      <Modal
        visible={editingId != null}
        animationType="slide"
        transparent
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            onPress={closeEditor}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: 24, borderTopRightRadius: 24,
                  padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
                  borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0,
                }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 }} />
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-textHi text-base font-semibold">Düzeltme</Text>
                  <Pressable onPress={closeEditor} hitSlop={10}>
                    <Text style={{ color: colors.textLow, fontSize: 22 }}>×</Text>
                  </Pressable>
                </View>
                <Text style={{ color: colors.textLow, fontSize: 11, marginBottom: 14, lineHeight: 16 }}>
                  Eksik veya yanlış değerleri düzelt. Boş bırakılan alanlar AI tahminini
                  olduğu gibi tutar.
                </Text>

                <Label>Yemek adı</Label>
                <Field value={editLabel} onChangeText={setEditLabel} placeholder="örn. Tavuk dürüm" />
                <Label>Kalori (kcal)</Label>
                <Field value={editKcal} onChangeText={setEditKcal} keyboardType="decimal-pad" placeholder="580" />
                <Label>Protein (g)</Label>
                <Field value={editProtein} onChangeText={setEditProtein} keyboardType="decimal-pad" placeholder="38" />

                <View className="flex-row mt-4" style={{ gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton label="Vazgeç" variant="ghost" onPress={closeEditor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton label="Kaydet" onPress={saveEdit} loading={correct.isPending} />
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function ResultCard({
  data, onEdit, onClose,
}: {
  data: MealPhotoUploadResponse;
  onEdit: () => void;
  onClose: () => void;
}) {
  if (data.status !== 'ok' || !data.estimate) {
    return (
      <View
        style={{
          padding: 14,
          backgroundColor: 'rgba(245,158,11,0.10)',
          borderRadius: 16, borderWidth: 1, borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>
          AI TAHMİN ÜRETEMEDİ
        </Text>
        <Text style={{ color: colors.textMid, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
          {data.status === 'rate_limited'
            ? 'AI günlük kullanım limiti doldu. Birkaç saat sonra tekrar dene.'
            : data.status === 'ai_offline'
            ? 'AI şu an çevrimdışı.'
            : 'AI yemeği tanıyamadı. Daha net bir fotoğrafla tekrar dene veya manuel düzelt.'}
        </Text>
        <View className="flex-row mt-3" style={{ gap: 10 }}>
          <Pressable
            onPress={onEdit}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 12,
              borderWidth: 1, borderColor: colors.primary, alignItems: 'center',
              backgroundColor: 'rgba(124,77,255,0.15)',
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
              MANUEL GİR
            </Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 }}
          >
            <Text style={{ color: colors.textLow, fontSize: 12, fontWeight: '700' }}>
              Kapat
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const e = data.estimate;
  const confLabel = data.confidence === 'high' ? 'YÜKSEK GÜVEN'
                  : data.confidence === 'medium' ? 'ORTA GÜVEN'
                  : 'DÜŞÜK GÜVEN';
  const confColor = data.confidence === 'high' ? colors.success
                  : data.confidence === 'medium' ? colors.warning
                  : colors.textLow;

  return (
    <LinearGradient
      colors={['rgba(124,77,255,0.18)', 'rgba(18,24,38,0.5)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text style={{ color: colors.textLow, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' }}>
            TAHMİNİ DEĞERLER
          </Text>
          <View
            style={{
              paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderWidth: 1, borderColor: confColor,
            }}
          >
            <Text style={{ color: confColor, fontSize: 9, fontWeight: '800' }}>
              {confLabel}
            </Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textLow, fontSize: 18 }}>×</Text>
        </Pressable>
      </View>

      <Text style={{ color: colors.textHi, fontSize: 16, fontWeight: '700', marginTop: 2 }}>
        {e.label}
      </Text>

      <View className="flex-row mt-3" style={{ gap: 8 }}>
        <MacroBox label="KALORİ" value={`${e.calories}`} unit="kcal" />
        <MacroBox label="PROTEİN" value={`${Math.round(e.protein_g)}`} unit="g" />
        <MacroBox label="KARB"    value={`${Math.round(e.carbs_g)}`} unit="g" />
        <MacroBox label="YAĞ"     value={`${Math.round(e.fats_g)}`} unit="g" />
      </View>

      {e.notes ? (
        <View style={{
          marginTop: 12, paddingTop: 10,
          borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          <Text style={{ color: colors.textLow, fontSize: 10, letterSpacing: 1.4, fontWeight: '700' }}>
            NOTLAR
          </Text>
          <Text style={{ color: colors.textMid, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
            {e.notes}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={onEdit}
        style={{
          marginTop: 12, paddingVertical: 10,
          borderRadius: 12, alignItems: 'center',
          backgroundColor: colors.surface2,
          borderWidth: 1, borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.textHi, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>
          DOĞRULA / DÜZELT
        </Text>
      </Pressable>
    </LinearGradient>
  );
}

function MacroBox({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface2,
        borderRadius: 12,
        paddingVertical: 8, paddingHorizontal: 6,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: colors.textLow, fontSize: 9, letterSpacing: 1, fontWeight: '700' }}>
        {label}
      </Text>
      <Text style={{ color: colors.textHi, fontSize: 16, fontWeight: '800', marginTop: 2 }}>
        {value}
      </Text>
      <Text style={{ color: colors.textLow, fontSize: 9 }}>{unit}</Text>
    </View>
  );
}

function HistoryTile({
  row, size, onPress, onDelete,
}: { row: MealPhotoRow; size: number; onPress: () => void; onDelete: () => void }) {
  const label = row.user_label ?? row.ai_label ?? 'Tahmin yok';
  const kcal = row.user_kcal ?? row.estimated_kcal;
  const corrected = row.user_label || row.user_kcal != null;
  return (
    <View style={{ width: size, height: size }}>
      <Pressable
        onPress={onPress}
        style={{ width: '100%', height: '100%' }}
      >
        <Image
          source={{ uri: `${API_BASE_URL}/uploads/${row.file_path}` }}
          style={{ width: '100%', height: '100%', borderRadius: 12, backgroundColor: colors.surface2 }}
          resizeMode="cover"
        />
        <View
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: 8,
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}
          >
            {label}
          </Text>
          <Text style={{ color: '#ddd', fontSize: 10, marginTop: 1 }}>
            {kcal != null ? `~${kcal} kcal` : '—'}
            {corrected ? ' · ✓ düzeltildi' : ''}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onDelete}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: -6, right: -6,
          width: 26, height: 26, borderRadius: 13,
          backgroundColor: colors.danger,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: colors.bg,
          shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 }, elevation: 6,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900', marginTop: -1 }}>×</Text>
      </Pressable>
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: colors.textMid, fontSize: 11, letterSpacing: 0.5, marginBottom: 6, marginTop: 8 }}>
      {children}
    </Text>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={colors.textLow}
      {...props}
      style={[
        {
          backgroundColor: colors.surface2,
          borderColor: colors.border, borderWidth: 1, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 11,
          color: colors.textHi, fontSize: 15,
        },
        props.style,
      ]}
    />
  );
}
