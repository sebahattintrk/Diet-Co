// frontend/src/screens/ProfileScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { useUserStore } from '../store/userStore';
import { api } from '../api/client';

const calculateDynamicAge = (birthDateString?: string, fallbackAge?: number): number => {
  if (!birthDateString) return fallbackAge || 20;
  const birth = new Date(birthDateString);
  if (isNaN(birth.getTime())) return fallbackAge || 20;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age > 0 ? age : (fallbackAge || 20);
};

export const ProfileScreen = () => {
  const user = useUserStore((state: any) => state.user);
  const setUser = useUserStore((state: any) => state.setUser);
  const clearUser = useUserStore((state: any) => state.clearUser);
  const deleteAccount = useUserStore((state: any) => state.deleteAccount);

  const currentUserId = Number(user?.id);

  const [dbUser, setDbUser] = useState<any>(user || null);
  const [loadingFresh, setLoadingFresh] = useState(false);

  // ⚡ VERİTABANINDAN (USERS TABLOSUNDAN) DOĞRUDAN CANLI PROFİL ÇEKME
  const fetchLiveProfile = useCallback(async () => {
    if (!currentUserId) return;

    try {
      setLoadingFresh(true);
      // Doğrudan kullanıcının users tablosundaki en güncel satırını istiyoruz
      const res = await api.get(`/api/dashboard?userId=${currentUserId}`);
      
      const freshUserData = res.data?.user || res.data;
      if (freshUserData && (freshUserData.weight_kg !== undefined || freshUserData.weight !== undefined || freshUserData.name)) {
        setDbUser(freshUserData);
        if (typeof setUser === 'function') {
          setUser(freshUserData);
        }
        useUserStore.setState({ user: freshUserData });
      }
    } catch (e) {
      console.log('Profil canlı veri çekme hatası:', e);
    } finally {
      setLoadingFresh(false);
    }
  }, [currentUserId, setUser]);

  useFocusEffect(
    useCallback(() => {
      fetchLiveProfile();
    }, [fetchLiveProfile])
  );

  const activeUser = dbUser || user || {};
  const currentAge = calculateDynamicAge(activeUser?.birth_date, activeUser?.age);
  
  // 🎯 VERİTABANINDAKİ users.weight_kg DEĞERİNİ DOĞRUDAN YANSIT
  const rawWeight = activeUser?.weight_kg ?? activeUser?.weight ?? user?.weight_kg ?? user?.weight;
  const currentWeight = rawWeight !== undefined && rawWeight !== null ? parseFloat(rawWeight) : 55.0;
  
  const rawHeight = activeUser?.height_cm ?? activeUser?.height ?? user?.height_cm ?? user?.height;
  const currentHeight = rawHeight !== undefined && rawHeight !== null ? parseFloat(rawHeight) : 180.0;

  // Vücut Ölçüleri Modalı State'leri
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [waist, setWaist] = useState('');
  const [arm, setArm] = useState('');
  const [shoulder, setShoulder] = useState('');
  const [rightLeg, setRightLeg] = useState('');
  const [leftLeg, setLeftLeg] = useState('');
  const [workoutDays, setWorkoutDays] = useState('0');

  const handleOpenEditModal = () => {
    try {
      Haptics.selectionAsync();
    } catch (_) {}

    setWaist(activeUser?.waist_cm ? String(activeUser.waist_cm) : '');
    setArm(activeUser?.arm_cm ? String(activeUser.arm_cm) : '');
    setShoulder(activeUser?.shoulder_cm ? String(activeUser.shoulder_cm) : '');
    setRightLeg(activeUser?.right_leg_cm ? String(activeUser.right_leg_cm) : '');
    setLeftLeg(activeUser?.left_leg_cm ? String(activeUser.left_leg_cm) : '');
    setWorkoutDays(
      activeUser?.workout_days_per_week !== undefined && activeUser?.workout_days_per_week !== null
        ? String(activeUser.workout_days_per_week)
        : '0'
    );
    setModalVisible(true);
  };

  const handleSaveMeasurements = async () => {
    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}

    try {
      const res = await api.put('/api/auth/measurements', {
        userId: activeUser?.id || currentUserId,
        waist_cm: waist,
        arm_cm: arm,
        shoulder_cm: shoulder,
        right_leg_cm: rightLeg,
        left_leg_cm: leftLeg,
        workout_days_per_week: workoutDays,
      });

      if (res.data?.user) {
        setDbUser(res.data.user);
        if (typeof setUser === 'function') setUser(res.data.user);
        useUserStore.setState({ user: res.data.user });
      }

      setModalVisible(false);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}
      Alert.alert('Harika! 🎉', 'Vücut ölçülerin ve haftalık aktivite durumun güncellendi.');
    } catch (e: any) {
      Alert.alert('Hata', 'Ölçüler kaydedilemedi: ' + (e?.response?.data?.error || e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const getGoalTitle = (goal?: string) => {
    switch (goal) {
      case 'weight_loss':
      case 'fat_loss':
        return 'Kilo Verme';
      case 'weight_gain':
        return 'Kilo Alma';
      case 'muscle_gain':
        return 'Kas Kazanımı';
      default:
        return 'Sağlıklı Yaşam';
    }
  };

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkış yapmak istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: () => clearUser() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Hesabını ve Verilerini Sil',
      'Tüm beslenme geçmişin, makro hedeflerin ve kişisel verilerin kalıcı olarak silinecektir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kalıcı Olarak Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              Alert.alert('Hesap Silindi', 'Hesabınız başarıyla temizlendi.');
            } catch (e: any) {
              Alert.alert('Hata', e?.message || 'Bilinmeyen hata');
            }
          },
        },
      ]
    );
  };

  const userInitial = activeUser?.name ? activeUser.name.trim().charAt(0).toUpperCase() : 'S';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.subHeader}>KİŞİSEL PROFİL</Text>
            <Text style={styles.title}>Hesap & Durum</Text>
          </View>
          <View style={styles.memberBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#059669" />
            <Text style={styles.memberBadgeText}>{activeUser?.is_premium ? 'PRO ÜYE' : 'AKTİF HESAP'}</Text>
          </View>
        </View>

        {/* Profil Hero Kartı */}
        <View style={styles.profileHeroCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{userInitial}</Text>
            </View>
            <View style={styles.onlineRing} />
          </View>

          <View style={styles.profileDetails}>
            <Text style={styles.userName}>{activeUser?.name || 'Sebahattin Türk'}</Text>
            <Text style={styles.userEmail}>{activeUser?.email || 'kullanici@dietco.app'}</Text>

            <View style={styles.heroPillRow}>
              <View style={styles.goalPill}>
                <Ionicons name="flame" size={12} color="#059669" />
                <Text style={styles.goalPillText}>{getGoalTitle(activeUser?.goal)}</Text>
              </View>
              {activeUser?.occupation && (
                <View style={styles.workPill}>
                  <Ionicons name="briefcase-outline" size={12} color="#64748B" />
                  <Text style={styles.workPillText}>{activeUser.occupation}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Canlı İstatistik Kutuları */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>BOY</Text>
            <Text style={styles.statNumber}>
              {currentHeight.toFixed(0)} <Text style={styles.statSub}>cm</Text>
            </Text>
          </View>

          <View style={[styles.statBox, styles.statBoxPrimary]}>
            <View style={styles.primaryStatTag}>
              <Text style={styles.primaryStatTagText}>CANLI</Text>
            </View>
            <Text style={[styles.statLabel, { color: '#059669' }]}>GÜNCEL KİLO</Text>
            <Text style={[styles.statNumber, { color: '#064E3B' }]}>
              {currentWeight.toFixed(1)} <Text style={[styles.statSub, { color: '#059669' }]}>kg</Text>
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>DİNAMİK YAŞ</Text>
            <Text style={styles.statNumber}>
              {currentAge} <Text style={styles.statSub}>yaş</Text>
            </Text>
          </View>
        </View>

        {/* AI Canlı Kilo Bilgilendirme Kartı */}
        <View style={styles.aiSyncCard}>
          <View style={styles.aiSyncHeader}>
            <View style={styles.aiSyncTitleBox}>
              <View style={styles.sparkleCircle}>
                <Ionicons name="sparkles" size={16} color="#059669" />
              </View>
              <Text style={styles.aiSyncTitle}>Diet-Co Canlı Kilo Takibi</Text>
            </View>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Aktif</Text>
            </View>
          </View>

          <Text style={styles.aiSyncBody}>
            Kilonu güncellemek için forma gerek yok. AI Koç sekmesine{' '}
            <Text style={styles.boldCallout}>"2 kilo verdim"</Text> veya{' '}
            <Text style={styles.boldCallout}>"55 kiloya düştüm"</Text> yazman yeterlidir.
          </Text>

          <View style={styles.aiSyncFooter}>
            <Ionicons name="git-compare-outline" size={15} color="#047857" />
            <Text style={styles.aiSyncFooterText}>
              Yeni kilonuz veritabanına otomatik işlenir, kalori ve makro hedefleriniz revize edilir.
            </Text>
          </View>
        </View>

        {/* VÜCUT ÖLÇÜLERİ VE AKTİVİTE */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>VÜCUT ÖLÇÜLERİ VE AKTİVİTE</Text>
          <TouchableOpacity onPress={handleOpenEditModal} style={styles.editButton} activeOpacity={0.7}>
            <Ionicons name="pencil" size={12} color="#059669" />
            <Text style={styles.editButtonText}>Düzenle</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardGroup}>
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Bel</Text>
              <Text style={styles.gridCellValue}>{activeUser?.waist_cm ? `${activeUser.waist_cm} cm` : '—'}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Kol</Text>
              <Text style={styles.gridCellValue}>{activeUser?.arm_cm ? `${activeUser.arm_cm} cm` : '—'}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Omuz</Text>
              <Text style={styles.gridCellValue}>{activeUser?.shoulder_cm ? `${activeUser.shoulder_cm} cm` : '—'}</Text>
            </View>
          </View>
          <View style={styles.horizontalLine} />
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Sağ Bacak</Text>
              <Text style={styles.gridCellValue}>{activeUser?.right_leg_cm ? `${activeUser.right_leg_cm} cm` : '—'}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Sol Bacak</Text>
              <Text style={styles.gridCellValue}>{activeUser?.left_leg_cm ? `${activeUser.left_leg_cm} cm` : '—'}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Haftalık Spor</Text>
              <Text style={styles.gridCellValue}>
                {activeUser?.workout_days_per_week !== undefined && activeUser?.workout_days_per_week !== null
                  ? `${activeUser.workout_days_per_week} gün`
                  : '0 gün'}
              </Text>
            </View>
          </View>
        </View>

        {/* Oturumu Kapat ve Hesap Silme */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={styles.logoutButtonText}>Oturumu Kapat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={15} color="#94A3B8" />
          <Text style={styles.deleteButtonText}>Hesabımı ve Tüm Verilerimi Kalıcı Olarak Sil</Text>
        </TouchableOpacity>

        <Text style={styles.versionFooter}>Diet-Co AI Engine • Sürüm 1.0.4</Text>
      </ScrollView>

      {/* Modal - Klavye Korumalı */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vücut Ölçülerini Güncelle</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Bel (cm)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="Örn: 85"
                    value={waist}
                    onChangeText={setWaist}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Kol (cm)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="Örn: 36"
                    value={arm}
                    onChangeText={setArm}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Omuz (cm)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="Örn: 118"
                    value={shoulder}
                    onChangeText={setShoulder}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Haftalık Spor (Gün)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="0 - 7"
                    value={workoutDays}
                    onChangeText={setWorkoutDays}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Sağ Bacak (cm)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="Örn: 58"
                    value={rightLeg}
                    onChangeText={setRightLeg}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Sol Bacak (cm)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="Örn: 58"
                    value={leftLeg}
                    onChangeText={setLeftLeg}
                  />
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={handleSaveMeasurements}
              disabled={saving}
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Değişiklikleri Kaydet</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAF9' },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 110 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
  subHeader: { fontSize: 11, fontWeight: '800', color: '#059669', letterSpacing: 1.2 },
  title: { fontSize: 26, fontWeight: '900', color: '#064E3B', marginTop: 2 },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0' },
  memberBadgeText: { fontSize: 11, fontWeight: '800', color: '#047857', letterSpacing: 0.5 },
  profileHeroCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#E6EFE9', shadowColor: '#064E3B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 14, elevation: 2, marginBottom: 16 },
  avatarContainer: { position: 'relative', marginRight: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ECFDF5', borderWidth: 2, borderColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '900', color: '#047857' },
  onlineRing: { position: 'absolute', bottom: 0, right: 2, width: 13, height: 13, borderRadius: 6.5, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#FFFFFF' },
  profileDetails: { flex: 1 },
  userName: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  userEmail: { fontSize: 12, color: '#64748B', marginTop: 1 },
  heroPillRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  goalPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#DCFCE7' },
  goalPillText: { fontSize: 11, fontWeight: '700', color: '#047857' },
  workPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  workPillText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  statsContainer: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E6EFE9' },
  statBoxPrimary: { backgroundColor: '#F0FDF4', borderColor: '#A7F3D0', position: 'relative' },
  primaryStatTag: { position: 'absolute', top: 6, right: 8, backgroundColor: '#059669', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 },
  primaryStatTagText: { fontSize: 8, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  statLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 4 },
  statNumber: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  statSub: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  aiSyncCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: '#A7F3D0', marginBottom: 22, shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  aiSyncHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  aiSyncTitleBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sparkleCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  aiSyncTitle: { fontSize: 13, fontWeight: '800', color: '#064E3B' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontWeight: '800', color: '#059669' },
  aiSyncBody: { fontSize: 12, color: '#475569', lineHeight: 18, marginTop: 2 },
  boldCallout: { fontWeight: '800', color: '#064E3B' },
  aiSyncFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginTop: 12 },
  aiSyncFooterText: { fontSize: 11, color: '#047857', flex: 1, lineHeight: 15, fontWeight: '500' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 1 },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0' },
  editButtonText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  cardGroup: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E6EFE9', marginBottom: 20, overflow: 'hidden' },
  gridRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 12 },
  gridCell: { flex: 1, alignItems: 'center' },
  gridCellLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginBottom: 2 },
  gridCellValue: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  horizontalLine: { height: 1, backgroundColor: '#F1F5F2', marginHorizontal: 14 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 14, gap: 8, borderWidth: 1, borderColor: '#FEE2E2', marginTop: 6 },
  logoutButtonText: { fontSize: 14, fontWeight: '800', color: '#DC2626' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 10, gap: 6 },
  deleteButtonText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  versionFooter: { textAlign: 'center', fontSize: 11, color: '#CBD5E1', fontWeight: '600', marginTop: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 5 },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  saveBtn: { backgroundColor: '#059669', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

export default ProfileScreen;