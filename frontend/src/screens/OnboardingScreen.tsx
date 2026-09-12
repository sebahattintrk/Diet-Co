import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '../store/userStore';
import apiClient from '../api/client';

export const OnboardingScreen = ({ navigation }: any) => {
  const user = useUserStore((state: any) => state.user);
  const setUser = useUserStore((state: any) => state.setUser);

  // Adım Takibi (1: Hedef & Cinsiyet, 2: Doğum Tarihi & Boy/Kilo, 3: Vücut Ölçüleri, 4: Aktivite & Meslek)
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    // Adım 1
    goal: 'muscle_gain', // muscle_gain, weight_loss, maintenance
    gender: 'male',      // male, female
    // Adım 2
    birth_date: '2001-05-14',
    height: '',
    weight: '',
    target_weight: '',
    // Adım 3: Vücut Ölçüleri (cm)
    waist_cm: '',
    arm_cm: '',
    shoulder_cm: '',
    right_leg_cm: '',
    left_leg_cm: '',
    chest_cm: '',       // Opsiyonel
    hip_cm: '',         // Opsiyonel
    // Adım 4: Aktivite & Yaşam Tarzı
    workout_days_per_week: 4,
    workout_hours_per_day: '1.0',
    occupation: '',
    work_activity_level: 'sedentary', // sedentary, light, moderate, heavy
  });

  const updateField = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Doğum tarihinden yaş önizleme hesaplama
  const getCalculatedAge = () => {
    if (!formData.birth_date || formData.birth_date.length < 4) return null;
    const birth = new Date(formData.birth_date);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age > 0 ? age : null;
  };

  const calculatedAge = getCalculatedAge();

  // Onboarding Tamamlama ve API Kaydı
  const handleComplete = async () => {
    try {
      setLoading(true);

      const payload = {
        userId: user?.id,
        goal: formData.goal,
        gender: formData.gender,
        birth_date: formData.birth_date || null,
        height: parseFloat(formData.height) || user?.height || 180,
        weight: parseFloat(formData.weight) || user?.weight || 75,
        target_weight: parseFloat(formData.target_weight) || null,
        waist_cm: parseFloat(formData.waist_cm) || null,
        arm_cm: parseFloat(formData.arm_cm) || null,
        shoulder_cm: parseFloat(formData.shoulder_cm) || null,
        right_leg_cm: parseFloat(formData.right_leg_cm) || null,
        left_leg_cm: parseFloat(formData.left_leg_cm) || null,
        chest_cm: parseFloat(formData.chest_cm) || null,
        hip_cm: parseFloat(formData.hip_cm) || null,
        workout_days_per_week: formData.workout_days_per_week,
        workout_hours_per_day: parseFloat(formData.workout_hours_per_day) || 1.0,
        occupation: formData.occupation || null,
        work_activity_level: formData.work_activity_level,
      };

      const res = await apiClient.post('/api/onboarding/complete', payload);

      if (res.data.success) {
        if (setUser) {
          setUser({
            ...user,
            ...payload,
            is_onboarded: true,
          });
        }
      } else {
        // Fallback store güncellemesi
        if (setUser) {
          setUser({
            ...user,
            ...payload,
            is_onboarded: true,
          });
        }
      }
    } catch (e: any) {
      console.log('Onboarding kayıt uyarısı:', e?.message);
      // Backend çevrimdışı olsa dahi yerel durumu tamamlayıp ana panele geçir
      if (setUser) {
        setUser({
          ...user,
          ...formData,
          is_onboarded: true,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* Üst İlerleme Çubuğu */}
      <View style={styles.topProgressContainer}>
        <View style={styles.stepIndicatorRow}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.stepSegment,
                i <= step ? styles.stepSegmentActive : styles.stepSegmentInactive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stepCounterText}>ADIM {step} / 4</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ========================================================================= */}
        {/* ADIM 1: HEDEF VE CİNSİYET */}
        {/* ========================================================================= */}
        {step === 1 && (
          <View>
            <View style={styles.headerBox}>
              <Text style={styles.subHeader}>KİŞİSELLEŞTİRME</Text>
              <Text style={styles.title}>Hedefinizi Belirleyin</Text>
              <Text style={styles.subtitle}>
                Diet-Co Yapay Zekası kalori, makro ve antrenman yükünüzü bu amaca göre kurgular.
              </Text>
            </View>

            <Text style={styles.sectionLabel}>ANA HEDEFİNİZ</Text>
            {[
              { id: 'weight_loss', label: 'Kilo Vermek & Yağ Yakımı', icon: 'flame-outline', desc: 'Kalori açığı ve yüksek metabolik tempo' },
              { id: 'muscle_gain', label: 'Kas Kazanımı & Hacim', icon: 'barbell-outline', desc: 'Hipertrofi odaklı protein ve kalori fazlası' },
              { id: 'maintenance', label: 'Formu Korumak & Sıkılaşma', icon: 'fitness-outline', desc: 'Dengeli makrolar ve sürdürülebilir kondisyon' },
            ].map((item) => {
              const selected = formData.goal === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  onPress={() => updateField('goal', item.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.cardIconBox, selected && styles.cardIconBoxSelected]}>
                    <Ionicons name={item.icon as any} size={22} color={selected ? '#10B981' : '#64748B'} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>{item.label}</Text>
                    <Text style={styles.cardDesc}>{item.desc}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selected ? '#10B981' : '#CBD5E1'}
                  />
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>BİYOLOJİK CİNSİYET</Text>
            <View style={styles.genderRow}>
              {[
                { id: 'male', label: 'Erkek', icon: 'male-outline' },
                { id: 'female', label: 'Kadın', icon: 'female-outline' },
              ].map((g) => {
                const selected = formData.gender === g.id;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.genderCard, selected && styles.genderCardSelected]}
                    onPress={() => updateField('gender', g.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={g.icon as any} size={24} color={selected ? '#10B981' : '#64748B'} />
                    <Text style={[styles.genderLabel, selected && styles.genderLabelSelected]}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep(2)} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Devam Et</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* ========================================================================= */}
        {/* ADIM 2: DOĞUM TARİHİ, BOY, KİLO, HEDEF KİLO */}
        {/* ========================================================================= */}
        {step === 2 && (
          <View>
            <View style={styles.headerBox}>
              <Text style={styles.subHeader}>FİZİKSEL PROFİL</Text>
              <Text style={styles.title}>Kişisel Bilgileriniz</Text>
              <Text style={styles.subtitle}>
                Doğum tarihiniz sayesinde yaşınız her yıl otomatik güncellenir ve AI metabolizma hızınızı hatasız hesaplar.
              </Text>
            </View>

            {/* Doğum Tarihi Girişi */}
            <View style={styles.inputGroup}>
              <View style={styles.inputHeaderRow}>
                <Text style={styles.inputLabel}>DOĞUM TARİHİ (YYYY-AA-GG)</Text>
                {calculatedAge && (
                  <View style={styles.badgeSuccess}>
                    <Ionicons name="gift-outline" size={12} color="#10B981" />
                    <Text style={styles.badgeSuccessText}>{calculatedAge} Yaşında</Text>
                  </View>
                )}
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="Örn: 2001-05-14"
                placeholderTextColor="#94A3B8"
                value={formData.birth_date}
                onChangeText={(t) => updateField('birth_date', t)}
                maxLength={10}
              />
            </View>

            {/* Boy Girişi */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>BOYUNUZ (CM)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Örn: 180"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={formData.height}
                onChangeText={(t) => updateField('height', t)}
                maxLength={3}
              />
            </View>

            {/* Güncel ve Hedef Kilo */}
            <View style={styles.dualRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>ŞU ANKİ KİLO (KG)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Örn: 76.5"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formData.weight}
                  onChangeText={(t) => updateField('weight', t)}
                  maxLength={5}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>HEDEF KİLO (KG)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Örn: 72.0"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formData.target_weight}
                  onChangeText={(t) => updateField('target_weight', t)}
                  maxLength={5}
                />
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(1)} activeOpacity={0.8}>
                <Ionicons name="arrow-back" size={18} color="#064E3B" />
                <Text style={styles.secondaryButtonText}>Geri</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { flex: 2 },
                  (!formData.height || !formData.weight) && styles.buttonDisabled,
                ]}
                disabled={!formData.height || !formData.weight}
                onPress={() => setStep(3)}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>Vücut Ölçülerine Geç</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* ADIM 3: VÜCUT ÖLÇÜLERİ (ZORUNLU & OPSİYONEL & ŞİMDİLİK ATLA) */}
        {/* ========================================================================= */}
        {step === 3 && (
          <View>
            <View style={styles.headerBox}>
              <Text style={styles.subHeader}>HASSAS TAKİP</Text>
              <Text style={styles.title}>Vücut Ölçüleriniz</Text>
              <Text style={styles.subtitle}>
                Kas gelişimi ve incelmenizi santim santim takip edebilmek için mezura ölçülerinizi girin.
              </Text>
            </View>

            {/* Zorunlu Ölçüler */}
            <View style={styles.sectionHeaderLine}>
              <Ionicons name="shield-checkmark" size={14} color="#10B981" />
              <Text style={styles.sectionLabelInline}>ZORUNLU ÖLÇÜLER (CM)</Text>
            </View>

            <View style={styles.dualRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>BEL ÇEVRESİ *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Örn: 82"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formData.waist_cm}
                  onChangeText={(t) => updateField('waist_cm', t)}
                  maxLength={5}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>KOL (BICEPS) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Örn: 36"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formData.arm_cm}
                  onChangeText={(t) => updateField('arm_cm', t)}
                  maxLength={5}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>OMUZ ÇEVRESİ *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Örn: 118"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                value={formData.shoulder_cm}
                onChangeText={(t) => updateField('shoulder_cm', t)}
                maxLength={5}
              />
            </View>

            <View style={styles.dualRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>SAĞ BACAK *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Örn: 56"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formData.right_leg_cm}
                  onChangeText={(t) => updateField('right_leg_cm', t)}
                  maxLength={5}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>SOL BACAK *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Örn: 56"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formData.left_leg_cm}
                  onChangeText={(t) => updateField('left_leg_cm', t)}
                  maxLength={5}
                />
              </View>
            </View>

            {/* Opsiyonel Ölçüler */}
            <View style={[styles.sectionHeaderLine, { marginTop: 8 }]}>
              <Ionicons name="sparkles-outline" size={14} color="#64748B" />
              <Text style={[styles.sectionLabelInline, { color: '#64748B' }]}>İSTEĞE BAĞLI ÖLÇÜLER (CM)</Text>
            </View>

            <View style={styles.dualRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>GÖĞÜS ÇEVRESİ</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Opsiyonel"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formData.chest_cm}
                  onChangeText={(t) => updateField('chest_cm', t)}
                  maxLength={5}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>KALÇA ÇEVRESİ</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Opsiyonel"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formData.hip_cm}
                  onChangeText={(t) => updateField('hip_cm', t)}
                  maxLength={5}
                />
              </View>
            </View>

            {/* Buton Grubu */}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(2)} activeOpacity={0.8}>
                <Ionicons name="arrow-back" size={18} color="#064E3B" />
                <Text style={styles.secondaryButtonText}>Geri</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, { flex: 2 }]} onPress={() => setStep(4)} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Aktiviteye Geç</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Bilgileri Bilmiyorsa Sonradan Doldurma Butonu */}
            <TouchableOpacity style={styles.skipButton} onPress={() => setStep(4)} activeOpacity={0.7}>
              <Text style={styles.skipButtonText}>Ölçülerimi bilmiyorum, şimdilik atla</Text>
              <Ionicons name="chevron-forward" size={14} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* ========================================================================= */}
        {/* ADIM 4: GÜNLÜK AKTİVİTE, SPOR SAATİ, MESLEK VE HAREKETLİLİK */}
        {/* ========================================================================= */}
        {step === 4 && (
          <View>
            <View style={styles.headerBox}>
              <Text style={styles.subHeader}>YAŞAM TARZI</Text>
              <Text style={styles.title}>Günlük Aktivite Düzeyi</Text>
              <Text style={styles.subtitle}>
                Spor temposu ve mesleğinizdeki hareketlilik kalori yakım katsayınızı doğrudan belirler.
              </Text>
            </View>

            {/* Haftada Kaç Gün Spor */}
            <Text style={styles.sectionLabel}>HAFTADA KAÇ GÜN SPOR YAPIYORSUNUZ?</Text>
            <View style={styles.frequencyRow}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((num) => {
                const selected = formData.workout_days_per_week === num;
                return (
                  <TouchableOpacity
                    key={num}
                    style={[styles.freqButton, selected && styles.freqButtonSelected]}
                    onPress={() => updateField('workout_days_per_week', num)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.freqButtonText, selected && styles.freqButtonTextSelected]}>{num}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Günde Kaç Saat Spor */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>GÜNLÜK ORTALAMA ANTRENMAN SÜRESİ (SAAT)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Örn: 1.5"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                value={formData.workout_hours_per_day}
                onChangeText={(t) => updateField('workout_hours_per_day', t)}
                maxLength={4}
              />
            </View>

            {/* Meslek Girişi */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MESLEĞİNİZ / GÜNDELİK UĞRAŞINIZ</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Örn: Yazılımcı, Eczacı, Kurye, Antrenör..."
                placeholderTextColor="#94A3B8"
                value={formData.occupation}
                onChangeText={(t) => updateField('occupation', t)}
              />
            </View>

            {/* İş Yerindeki Hareketlilik */}
            <Text style={[styles.sectionLabel, { marginTop: 10 }]}>İŞ YERİNDEKİ HAREKETLİLİK SEVİYESİ</Text>
            {[
              { id: 'sedentary', title: 'Masa Başı / Hareketsiz', desc: 'Günün çoğunda oturarak (Ofis, Yazılım)', icon: 'laptop-outline' },
              { id: 'light', title: 'Hafif Hareketli', desc: 'Ara sıra ayakta ve yürüme (Öğretmen, Eczacı)', icon: 'walk-outline' },
              { id: 'moderate', title: 'Orta / Yüksek Hareketli', desc: 'Sürekli tempolu hareket (Garson, Kurye, Saha)', icon: 'bicycle-outline' },
              { id: 'heavy', title: 'Ağır Fiziksel Emek', desc: 'Sürekli bedensel güç ve yük (İnşaat, Ağır Sanayi)', icon: 'barbell-outline' },
            ].map((item) => {
              const selected = formData.work_activity_level === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.activityOptionCard, selected && styles.activityOptionCardSelected]}
                  onPress={() => updateField('work_activity_level', item.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.activityIconBox, selected && styles.activityIconBoxSelected]}>
                    <Ionicons name={item.icon as any} size={20} color={selected ? '#10B981' : '#64748B'} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>{item.title}</Text>
                    <Text style={styles.cardDesc}>{item.desc}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? '#10B981' : '#CBD5E1'}
                  />
                </TouchableOpacity>
              );
            })}

            {/* Kaydet ve Başlat */}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(3)} activeOpacity={0.8}>
                <Ionicons name="arrow-back" size={18} color="#064E3B" />
                <Text style={styles.secondaryButtonText}>Geri</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, { flex: 2 }]}
                onPress={handleComplete}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Diet-Co AI Planımı Başlat</Text>
                    <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAF8',
  },
  topProgressContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  stepSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  stepSegmentActive: {
    backgroundColor: '#10B981',
  },
  stepSegmentInactive: {
    backgroundColor: '#E2EFE7',
  },
  stepCounterText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 1.2,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  headerBox: {
    marginBottom: 20,
  },
  subHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#064E3B',
    marginTop: 2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 2,
  },
  sectionHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    marginLeft: 2,
  },
  sectionLabelInline: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.8,
  },

  /* Seçenek Kartları */
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2EFE7',
    marginBottom: 12,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  optionCardSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardIconBoxSelected: {
    backgroundColor: '#D1FAE5',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
  },
  cardTitleSelected: {
    color: '#064E3B',
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  /* Cinsiyet */
  genderRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  genderCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2EFE7',
    gap: 8,
  },
  genderCardSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  genderLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  genderLabelSelected: {
    color: '#064E3B',
    fontWeight: '800',
  },

  /* Form Girdileri */
  inputGroup: {
    marginBottom: 16,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 2,
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeSuccessText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2EFE7',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '700',
    color: '#064E3B',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  dualRow: {
    flexDirection: 'row',
    gap: 12,
  },

  /* Sıklık Butonları (0-7) */
  frequencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  freqButton: {
    width: 38,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2EFE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqButtonSelected: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  freqButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
  },
  freqButtonTextSelected: {
    color: '#FFFFFF',
  },

  /* Aktivite Seviyesi Seçenekleri */
  activityOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2EFE7',
    marginBottom: 10,
  },
  activityOptionCardSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  activityIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityIconBoxSelected: {
    backgroundColor: '#D1FAE5',
  },

  /* Butonlar */
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 18,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#A7F3D0',
    shadowOpacity: 0,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2EFE7',
    paddingVertical: 16,
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 4,
    marginTop: 6,
  },
  skipButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textDecorationLine: 'underline',
  },
});

export default OnboardingScreen;