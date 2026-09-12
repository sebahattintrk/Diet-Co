// frontend/src/screens/AuthScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { api } from '@/api/client';
import { useUserStore } from '@/store/userStore';

type Step = 'auth' | 'goal' | 'biometrics' | 'measurements' | 'activity' | 'health' | 'lifestyle' | 'processing';
type LegalModalType = 'terms' | 'kvkk' | null;

const GOALS = [
  { id: 'fat_loss', title: 'Kilo Vermek', desc: 'Yağ oranını düşür, fit bir görünüme kavuş', icon: 'flame' },
  { id: 'muscle_gain', title: 'Kas Kazanımı', desc: 'Hacim kazan, güç ve kas kütleni artır', icon: 'barbell' },
  { id: 'weight_gain', title: 'Kilo Almak', desc: 'Sağlıklı kalori fazlasıyla kilo al', icon: 'trending-up' },
  { id: 'maintain', title: 'Formu Korumak', desc: 'Mevcut kilonu koruyup sağlıklı beslen', icon: 'shield-checkmark' },
];

const COMMON_HEALTH_CONDITIONS = [
  { id: 'gluten', label: 'Gluten / Çölyak', icon: 'nutrition-outline' },
  { id: 'laktoz', label: 'Laktoz İntoleransı', icon: 'water-outline' },
  { id: 'insulin', label: 'İnsülin Direnci', icon: 'fitness-outline' },
  { id: 'diyabet', label: 'Tip 1 / Tip 2 Diyabet', icon: 'medical-outline' },
  { id: 'tansiyon', label: 'Hipertansiyon', icon: 'pulse-outline' },
  { id: 'kolesterol', label: 'Yüksek Kolesterol', icon: 'heart-outline' },
  { id: 'tiroid', label: 'Haşimato / Hipotiroidi', icon: 'body-outline' },
  { id: 'reflu', label: 'Reflü / Gastrit', icon: 'flame-outline' },
];

export const AuthScreen = () => {
  const setAuth = useUserStore((s) => s.setAuth);

  const [step, setStep] = useState<Step>('auth');
  const [isLogin, setIsLogin] = useState(false);
  const [loading, setLoading] = useState(false);

  const [legalModal, setLegalModal] = useState<LegalModalType>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);

  const [finalUser, setFinalUser] = useState<any>(null);
  const [finalToken, setFinalToken] = useState<string>('');

  const [selectedGoal, setSelectedGoal] = useState('muscle_gain');
  
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  const monthInputRef = useRef<TextInput>(null);
  const yearInputRef = useRef<TextInput>(null);

  const [waistCm, setWaistCm] = useState('');
  const [armCm, setArmCm] = useState('');
  const [shoulderCm, setShoulderCm] = useState('');
  const [rightLegCm, setRightLegCm] = useState('');
  const [leftLegCm, setLeftLegCm] = useState('');
  const [chestCm, setChestCm] = useState('');
  const [hipCm, setHipCm] = useState('');

  const [workoutDays, setWorkoutDays] = useState(4);
  const [workoutHours, setWorkoutHours] = useState('1.0');
  const [occupation, setOccupation] = useState('');
  const [workActivityLevel, setWorkActivityLevel] = useState('sedentary');

  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [customCondition, setCustomCondition] = useState('');

  const [dislikedFoods, setDislikedFoods] = useState('');
  const [budget, setBudget] = useState('');

  const toggleCondition = (label: string) => {
    try {
      Haptics.selectionAsync();
    } catch (_) {}
    if (selectedConditions.includes(label)) {
      setSelectedConditions((prev) => prev.filter((item) => item !== label));
    } else {
      setSelectedConditions((prev) => [...prev, label]);
    }
  };

  const getCalculatedAge = () => {
    const d = parseInt(birthDay, 10);
    const m = parseInt(birthMonth, 10);
    const y = parseInt(birthYear, 10);

    if (!d || !m || !y || y < 1920 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) {
      return null;
    }

    const birth = new Date(y, m - 1, d);
    const today = new Date();
    let ageVal = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      ageVal--;
    }
    return ageVal > 0 ? ageVal : null;
  };

  const calculatedAge = getCalculatedAge();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [processPhase, setProcessPhase] = useState('Metabolizma hızın (BMR) hesaplanıyor...');

  useEffect(() => {
    if (step === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
        ])
      ).start();

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 3800,
        useNativeDriver: false,
      }).start();

      setTimeout(() => {
        setProcessPhase('Sağlık durumun ve vücut ölçülerin harmanlanıyor...');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, 1200);

      setTimeout(() => {
        setProcessPhase('Kişisel rahatsızlıklarına özel besin filtreleri uygulanıyor...');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 2400);

      setTimeout(async () => {
        setProcessPhase('Kişisel AI koçun hazır! Başlıyoruz...');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        if (finalToken && finalUser) {
          await setAuth(finalToken, finalUser);
        }
      }, 3700);
    }
  }, [step, finalToken, finalUser]);

  const handleInitialAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen e-posta ve şifrenizi girin.');
      return;
    }

    if (isLogin) {
      setLoading(true);
      try {
        const res = await api.post('/api/auth/login', { email, password });
        await setAuth(res.data.token, res.data.user);
      } catch (err: any) {
        Alert.alert('Giriş Yapılamadı', err?.response?.data?.error || 'Bilgilerinizi kontrol edin.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!name.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen adınızı ve soyadınızı girin.');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Şifre Uyuşmazlığı', 'Girdiğiniz şifreler birbiriyle eşleşmiyor.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Güvenlik Uyarısı', 'Şifreniz en az 6 karakterden oluşmalıdır.');
      return;
    }
    if (!agreedTerms) {
      Alert.alert('Onay Gerekiyor', 'Lütfen Kullanım Koşulları ve KVKK metnini onaylayın.');
      return;
    }

    Haptics.selectionAsync();
    setStep('goal');
  };

  const handleMeasurementsSubmit = () => {
    if (!waistCm || !armCm || !shoulderCm || !rightLegCm || !leftLegCm) {
      Alert.alert(
        'Eksik Ölçü',
        'Lütfen zorunlu alanları doldurun veya bilmiyorsanız "Şimdilik Atla" seçeneğine dokunun.'
      );
      return;
    }
    Haptics.selectionAsync();
    setStep('activity');
  };

  const handleCompleteRegistration = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let formattedBirthDate: string | null = null;
    if (birthYear && birthMonth && birthDay) {
      const d = birthDay.padStart(2, '0');
      const m = birthMonth.padStart(2, '0');
      formattedBirthDate = `${birthYear}-${m}-${d}`;
    }

    const fullConditionsList = [...selectedConditions];
    if (customCondition.trim()) {
      fullConditionsList.push(customCondition.trim());
    }
    const combinedHealthConditions = fullConditionsList.join(', ');

    try {
      const payload = {
        name,
        email,
        password,
        goal: selectedGoal,
        age: calculatedAge || 24,
        birth_date: formattedBirthDate,
        height_cm: parseFloat(height) || null,
        weight_kg: parseFloat(weight) || null,
        waist_cm: waistCm ? parseFloat(waistCm) : null,
        arm_cm: armCm ? parseFloat(armCm) : null,
        shoulder_cm: shoulderCm ? parseFloat(shoulderCm) : null,
        right_leg_cm: rightLegCm ? parseFloat(rightLegCm) : null,
        left_leg_cm: leftLegCm ? parseFloat(leftLegCm) : null,
        chest_cm: chestCm ? parseFloat(chestCm) : null,
        hip_cm: hipCm ? parseFloat(hipCm) : null,
        workout_days_per_week: workoutDays,
        workout_hours_per_day: parseFloat(workoutHours) || 1.0,
        occupation: occupation || null,
        work_activity_level: workActivityLevel,
        health_conditions: combinedHealthConditions,
        disliked_foods: dislikedFoods,
        budget: budget ? parseFloat(budget) : null,
      };

      const res = await api.post('/api/auth/complete-registration', payload);
      setFinalToken(res.data.token);
      setFinalUser(res.data.user);
      setStep('processing');
    } catch (err: any) {
      Alert.alert('Kayıt Başarısız', err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'processing') {
    return (
      <View style={styles.cinematicContainer}>
        <View style={styles.cinematicCenter}>
          <Animated.View style={[styles.aiCoreGlow, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.aiCoreInner}>
              <Ionicons name="sparkles" size={48} color="#059669" />
            </View>
          </Animated.View>

          <Text style={styles.cinematicTitle}>Diet-Co AI Engine</Text>
          <Text style={styles.cinematicSubtitle}>{processPhase}</Text>

          <View style={styles.cinematicProgressTrack}>
            <Animated.View
              style={[
                styles.cinematicProgressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {step === 'auth' && (
            <>
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <Ionicons name="flash" size={32} color="#059669" />
                </View>
                <Text style={styles.brandTitle}>Diet-Co</Text>
                <Text style={styles.brandSubtitle}>
                  {isLogin ? 'Kişisel AI diyetisyenine tekrar hoş geldin!' : 'Hedeflerine yapay zeka desteğiyle ulaşmaya başla.'}
                </Text>
              </View>

              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabBtn, !isLogin && styles.tabBtnActive]}
                  onPress={() => setIsLogin(false)}
                >
                  <Text style={[styles.tabBtnText, !isLogin && styles.tabBtnTextActive]}>Kayıt Ol</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, isLogin && styles.tabBtnActive]}
                  onPress={() => setIsLogin(true)}
                >
                  <Text style={[styles.tabBtnText, isLogin && styles.tabBtnTextActive]}>Giriş Yap</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.form}>
                {!isLogin && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>AD SOYAD</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Sebahattin Türk"
                      placeholderTextColor="#9CA3AF"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                    />
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>E-POSTA</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="isim@gmail.com"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>ŞİFRE</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>

                {!isLogin && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>ŞİFRE TEKRAR</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor="#9CA3AF"
                        value={passwordConfirm}
                        onChangeText={setPasswordConfirm}
                        secureTextEntry
                      />
                    </View>

                    <View style={styles.checkboxRow}>
                      <TouchableOpacity
                        style={[styles.checkbox, agreedTerms && styles.checkboxActive]}
                        onPress={() => {
                          try { Haptics.selectionAsync(); } catch (_) {}
                          setAgreedTerms(!agreedTerms);
                        }}
                        activeOpacity={0.8}
                      >
                        {agreedTerms && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </TouchableOpacity>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.checkboxText}>
                          <Text
                            style={styles.legalLinkText}
                            onPress={() => setLegalModal('terms')}
                          >
                            Kullanım Koşulları
                          </Text>
                          {' ve '}
                          <Text
                            style={styles.legalLinkText}
                            onPress={() => setLegalModal('kvkk')}
                          >
                            KVKK Aydınlatma Metni
                          </Text>
                          'ni okudum, kabul ediyorum.
                        </Text>
                      </View>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleInitialAuth}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      {isLogin ? 'Giriş Yap' : 'Devam Et (Profilini Oluştur) →'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'goal' && (
            <View>
              <Text style={styles.stepBadge}>ADIM 1 / 6</Text>
              <Text style={styles.wizardTitle}>Ana Hedefin Nedir?</Text>
              <Text style={styles.wizardSub}>Yapay zeka koçun kalori ve protein dengesini buna göre kuracak.</Text>

              <View style={{ gap: 12, marginTop: 20 }}>
                {GOALS.map((g) => {
                  const active = selectedGoal === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.goalCard, active && styles.goalCardActive]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedGoal(g.id);
                      }}
                    >
                      <View style={[styles.goalIconBox, active && styles.goalIconBoxActive]}>
                        <Ionicons name={g.icon as any} size={22} color={active ? '#FFFFFF' : '#059669'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.goalTitle, active && styles.goalTitleActive]}>{g.title}</Text>
                        <Text style={styles.goalDesc}>{g.desc}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={22} color="#059669" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 28 }}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep('auth')}>
                  <Text style={styles.backBtnText}>Geri</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 2 }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setStep('biometrics');
                  }}
                >
                  <Text style={styles.submitBtnText}>Devam Et →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'biometrics' && (
            <View>
              <Text style={styles.stepBadge}>ADIM 2 / 6</Text>
              <Text style={styles.wizardTitle}>Fiziksel Bilgilerin</Text>
              <Text style={styles.wizardSub}>
                Doğum tarihin sayesinde yaşın her yıl otomatik güncellenir ve metabolizma hızın (BMR) hatasız hesaplanır.
              </Text>

              <View style={{ gap: 16, marginTop: 24 }}>
                <View style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.inputLabel}>DOĞUM TARİHİN</Text>
                    {calculatedAge && (
                      <View style={styles.ageBadge}>
                        <Ionicons name="gift-outline" size={12} color="#059669" />
                        <Text style={styles.ageBadgeText}>{calculatedAge} Yaşında</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[styles.input, { textAlign: 'center' }]}
                        placeholder="Gün (DD)"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        maxLength={2}
                        value={birthDay}
                        onChangeText={(txt) => {
                          setBirthDay(txt);
                          if (txt.length === 2) {
                            monthInputRef.current?.focus();
                          }
                        }}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <TextInput
                        ref={monthInputRef}
                        style={[styles.input, { textAlign: 'center' }]}
                        placeholder="Ay (MM)"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        maxLength={2}
                        value={birthMonth}
                        onChangeText={(txt) => {
                          setBirthMonth(txt);
                          if (txt.length === 2) {
                            yearInputRef.current?.focus();
                          }
                        }}
                      />
                    </View>

                    <View style={{ flex: 1.4 }}>
                      <TextInput
                        ref={yearInputRef}
                        style={[styles.input, { textAlign: 'center' }]}
                        placeholder="Yıl (YYYY)"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        maxLength={4}
                        value={birthYear}
                        onChangeText={setBirthYear}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>BOYUN (CM)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Örn: 178"
                    placeholderTextColor="#9CA3AF"
                    value={height}
                    onChangeText={setHeight}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>KİLON (KG)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Örn: 76.5"
                    placeholderTextColor="#9CA3AF"
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                    maxLength={5}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 30 }}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep('goal')}>
                  <Text style={styles.backBtnText}>Geri</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 2 }, (!height || !weight) && styles.submitBtnDisabled]}
                  disabled={!height || !weight}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setStep('measurements');
                  }}
                >
                  <Text style={styles.submitBtnText}>Vücut Ölçülerine Geç →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'measurements' && (
            <View>
              <Text style={styles.stepBadge}>ADIM 3 / 6</Text>
              <Text style={styles.wizardTitle}>Vücut Ölçülerin</Text>
              <Text style={styles.wizardSub}>
                Gelişimini santim santim takip edebilmek için mezura ölçülerini gir. Bilmiyorsan şimdilik atlayabilirsin.
              </Text>

              <View style={{ gap: 14, marginTop: 20 }}>
                <Text style={styles.subSectionTitle}>ZORUNLU ÖLÇÜLER (CM)</Text>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>BEL ÇEVRESİ *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Örn: 82"
                      placeholderTextColor="#9CA3AF"
                      value={waistCm}
                      onChangeText={setWaistCm}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>KOL (BICEPS) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Örn: 36"
                      placeholderTextColor="#9CA3AF"
                      value={armCm}
                      onChangeText={setArmCm}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>OMUZ ÇEVRESİ *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Örn: 118"
                    placeholderTextColor="#9CA3AF"
                    value={shoulderCm}
                    onChangeText={setShoulderCm}
                    keyboardType="decimal-pad"
                    maxLength={5}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>SAĞ BACAK *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Örn: 56"
                      placeholderTextColor="#9CA3AF"
                      value={rightLegCm}
                      onChangeText={setRightLegCm}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>SOL BACAK *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Örn: 56"
                      placeholderTextColor="#9CA3AF"
                      value={leftLegCm}
                      onChangeText={setLeftLegCm}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                </View>

                <Text style={[styles.subSectionTitle, { marginTop: 6 }]}>OPSİYONEL ÖLÇÜLER (CM)</Text>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>GÖĞÜS ÇEVRESİ</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Opsiyonel"
                      placeholderTextColor="#9CA3AF"
                      value={chestCm}
                      onChangeText={setChestCm}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>KALÇA ÇEVRESİ</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Opsiyonel"
                      placeholderTextColor="#9CA3AF"
                      value={hipCm}
                      onChangeText={setHipCm}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep('biometrics')}>
                  <Text style={styles.backBtnText}>Geri</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { flex: 2 }]} onPress={handleMeasurementsSubmit}>
                  <Text style={styles.submitBtnText}>Devam Et →</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setStep('activity');
                }}
              >
                <Text style={styles.skipBtnText}>Ölçülerimi bilmiyorum, şimdilik atla</Text>
                <Ionicons name="arrow-forward" size={14} color="#6B7280" />
              </TouchableOpacity>
            </View>
          )}

          {step === 'activity' && (
            <View>
              <Text style={styles.stepBadge}>ADIM 4 / 6</Text>
              <Text style={styles.wizardTitle}>Günlük Aktivite & Meslek</Text>
              <Text style={styles.wizardSub}>
                Günlük yaktığın enerjiyi (TDEE) hesaplayabilmemiz için spor sıklığını ve iş yerindeki temponu öğrenelim.
              </Text>

              <View style={{ gap: 16, marginTop: 20 }}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>HAFTADA KAÇ GÜN SPOR YAPIYORSUN?</Text>
                  <View style={styles.frequencyRow}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((num) => {
                      const active = workoutDays === num;
                      return (
                        <TouchableOpacity
                          key={num}
                          style={[styles.freqBtn, active && styles.freqBtnActive]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setWorkoutDays(num);
                          }}
                        >
                          <Text style={[styles.freqBtnText, active && styles.freqBtnTextActive]}>{num}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>GÜNLÜK ORTALAMA SPOR SÜRESİ (SAAT)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Örn: 1.5"
                    placeholderTextColor="#9CA3AF"
                    value={workoutHours}
                    onChangeText={setWorkoutHours}
                    keyboardType="decimal-pad"
                    maxLength={4}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>GÜNDELİK MESLEĞİN / UĞRAŞIN</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Örn: Yazılımcı, Öğrenci, Garson, Kurye..."
                    placeholderTextColor="#9CA3AF"
                    value={occupation}
                    onChangeText={setOccupation}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>İŞ YERİNDEKİ HAREKETLİLİK DÜZEYİ</Text>
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {[
                      { id: 'sedentary', title: 'Masa Başı / Hareketsiz', desc: 'Günün çoğunda oturarak', icon: 'laptop-outline' },
                      { id: 'light', title: 'Hafif Hareketli', desc: 'Ara sıra ayakta ve yürüme', icon: 'walk-outline' },
                      { id: 'moderate', title: 'Orta / Tempolu', desc: 'Sürekli ayakta ve hareket halinde', icon: 'bicycle-outline' },
                      { id: 'heavy', title: 'Ağır Fiziksel Emek', desc: 'Yoğun bedensel efor ve yük taşıma', icon: 'barbell-outline' },
                    ].map((lvl) => {
                      const active = workActivityLevel === lvl.id;
                      return (
                        <TouchableOpacity
                          key={lvl.id}
                          style={[styles.activityCard, active && styles.activityCardActive]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setWorkActivityLevel(lvl.id);
                          }}
                        >
                          <Ionicons name={lvl.icon as any} size={20} color={active ? '#059669' : '#6B7280'} />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={[styles.activityCardTitle, active && styles.activityCardTitleActive]}>
                              {lvl.title}
                            </Text>
                            <Text style={styles.activityCardDesc}>{lvl.desc}</Text>
                          </View>
                          <Ionicons
                            name={active ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={active ? '#059669' : '#D1D5DB'}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 26 }}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep('measurements')}>
                  <Text style={styles.backBtnText}>Geri</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 2 }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setStep('health');
                  }}
                >
                  <Text style={styles.submitBtnText}>Sağlık Durumuna Geç →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'health' && (
            <View>
              <Text style={styles.stepBadge}>ADIM 5 / 6</Text>
              <Text style={styles.wizardTitle}>Sağlık & Rahatsızlıklar</Text>
              <Text style={styles.wizardSub}>
                Yapay zeka koçun sana zarar verebilecek besinleri (örneğin çölyak için beyaz ekmek, diyabet için rafine şeker vb.) asla menüne eklemez.
              </Text>

              <View style={styles.healthWarningBox}>
                <Ionicons name="shield-checkmark" size={18} color="#059669" />
                <Text style={styles.healthWarningText}>
                  Belirttiğiniz tüm rahatsızlıklar, öğün ve tarif üretiminde sıkı bir filtre olarak kullanılır.
                </Text>
              </View>

              <View style={{ marginTop: 18 }}>
                <Text style={styles.inputLabel}>VARSA RAHATSIZLIKLARINI SEÇİN</Text>
                
                <View style={styles.chipsContainer}>
                  {COMMON_HEALTH_CONDITIONS.map((cond) => {
                    const isSelected = selectedConditions.includes(cond.label);
                    return (
                      <TouchableOpacity
                        key={cond.id}
                        style={[styles.healthChip, isSelected && styles.healthChipSelected]}
                        onPress={() => toggleCondition(cond.label)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={cond.icon as any}
                          size={15}
                          color={isSelected ? '#FFFFFF' : '#059669'}
                        />
                        <Text style={[styles.healthChipText, isSelected && styles.healthChipTextSelected]}>
                          {cond.label}
                        </Text>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={[styles.inputGroup, { marginTop: 16 }]}>
                  <Text style={styles.inputLabel}>DİĞER VEYA ÖZEL HASSASİYETLERİN (İSTEĞE BAĞLI)</Text>
                  <TextInput
                    style={[styles.input, { height: 75, textAlignVertical: 'top' }]}
                    placeholder="Örn: Fıstık alerjisi, böbrek taşı, gut hastalığı, safra kesesi problemi..."
                    placeholderTextColor="#9CA3AF"
                    value={customCondition}
                    onChangeText={setCustomCondition}
                    multiline
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 26 }}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep('activity')}>
                  <Text style={styles.backBtnText}>Geri</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 2 }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setStep('lifestyle');
                  }}
                >
                  <Text style={styles.submitBtnText}>Beslenme Tercihlerine Geç →</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedConditions([]);
                  setCustomCondition('');
                  setStep('lifestyle');
                }}
              >
                <Text style={styles.skipBtnText}>Herhangi bir rahatsızlığım yok, atla</Text>
                <Ionicons name="arrow-forward" size={14} color="#6B7280" />
              </TouchableOpacity>
            </View>
          )}

          {step === 'lifestyle' && (
            <View>
              <Text style={styles.stepBadge}>ADIM 6 / 6</Text>
              <Text style={styles.wizardTitle}>Beslenme Tercihlerin</Text>
              <Text style={styles.wizardSub}>Yapay zeka plan çıkarırken bütçeni aşmaz, sevmediğin yemekleri önermez.</Text>

              <View style={{ gap: 18, marginTop: 24 }}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>SEVMEDİĞİN VEYA TÜKETMEDİĞİN BESİNLER</Text>
                  <TextInput
                    style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                    placeholder="Örn: Pırasa, mantar, balık, sakatat, brokoli (virgülle ayırabilirsin)"
                    placeholderTextColor="#9CA3AF"
                    value={dislikedFoods}
                    onChangeText={setDislikedFoods}
                    multiline
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>AYLIK TAHMİNİ YEMEK BÜTÇEN (TL - İSTEĞE BAĞLI)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Örn: 4000"
                    placeholderTextColor="#9CA3AF"
                    value={budget}
                    onChangeText={setBudget}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 32 }}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep('health')}>
                  <Text style={styles.backBtnText}>Geri</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 2 }, loading && styles.submitBtnDisabled]}
                  onPress={handleCompleteRegistration}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Planımı Güvenle Hesapla 🚀</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* 📜 YASAL METİNLER OKUMA PENCERESİ */}
      <Modal
        visible={legalModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLegalModal(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {legalModal === 'terms' ? 'Kullanım Koşulları' : 'KVKK Aydınlatma Metni'}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setLegalModal(null)}
            >
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {legalModal === 'terms' ? (
              <View>
                <Text style={styles.docHeading}>KULLANIM KOŞULLARI (TERMS OF USE)</Text>
                <Text style={styles.docDate}>Son Güncelleme Tarihi: 12 Eylül 2026</Text>

                <Text style={styles.docSubHeading}>1. Taraflar ve Amaç</Text>
                <Text style={styles.docParagraph}>
                  Bu Kullanım Koşulları, Diet-Co ("Uygulama") ile Uygulama’yı indiren, erişen veya kullanan kişi ("Kullanıcı") arasındaki şartları düzenler. Uygulamayı kullanarak bu koşulları ve Apple'ın Standart Son Kullanıcı Lisans Sözleşmesi'ni (Apple Standard EULA) kabul etmiş sayılırsınız.
                </Text>

                <Text style={styles.docSubHeading}>2. Yaş Sınırı</Text>
                <Text style={styles.docParagraph}>
                  Bu Uygulama 18 yaş ve üzerindeki bireyler için tasarlanmıştır. 18 yaşından küçük bireyler Uygulama’yı yalnızca ebeveyn veya yasal vasilerinin bilgisi ve onayı dahilinde kullanabilirler.
                </Text>

                <Text style={styles.docSubHeading}>3. Tıbbi Uyarı ve Sağlık Sorumluluk Reddi (Önemli)</Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Tıbbi Tavsiye Niteliği Taşımaz:</Text> Diet-Co, yapay zeka tabanlı bir diyet ve yaşam koçluğu yazılımıdır. Uygulama kapsamında sunulan hiçbir içerik, öneri, kalori/makro hesabı veya beslenme planı tıbbi teşhis, tedavi veya profesyonel diyetisyen/hekim tavsiyesi yerine geçmez.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Kilo Verme Garantisi Yoktur:</Text> Uygulama tarafından sunulan kalori takibi, yapay zeka analizleri ve beslenme önerileri yalnızca sağlıklı yaşam rehberliği amaçlıdır. Diet-Co, Kullanıcı'ya kesin bir kilo verme, kilo alma veya belirli bir fiziksel sonuca ulaşma garantisi vaat etmez. Elde edilecek sonuçlar bireyin metabolizmasına, biyolojik yapısına ve önerilere uyumuna göre farklılık gösterir.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Sağlık Durumu:</Text> Kronik hastalığı (diyabet, tansiyon vb.), yeme bozukluğu olan veya hamile/emziren kullanıcıların Uygulama’daki önerileri uygulamadan önce mutlaka uzman bir hekime danışması gerekmektedir.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Sorumluluk Sınırı:</Text> Uygulama’daki yapay zeka önerilerinin uygulanması sonucu doğabilecek doğrudan veya dolaylı sağlık sorunlarından Diet-Co sorumlu tutulamaz.
                </Text>

                <Text style={styles.docSubHeading}>4. Yapay Zeka (AI) Yanılma Payı ve Veri Hassasiyeti</Text>
                <Text style={styles.docParagraph}>
                  Uygulama içerisindeki yanıtlar, besin analizleri ve görsel tanıma özellikleri yapay zeka algoritmaları tarafından üretilmektedir. Yapay zeka sistemleri doğası gereği hatalı, eksik veya güncel olmayan bilgi ("hallucination") üretebilir. Sunulan kalori, porsiyon ve besin değerleri yalnızca tahmini bilgilendirme amaçlıdır; verilerin nihai doğruluğunun kontrolü Kullanıcı'ya aittir.
                </Text>

                <Text style={styles.docSubHeading}>5. Abonelikler, İçi Satın Almalar ve İptal Koşulları</Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Ödeme ve Yenileme:</Text> Ücretli abonelikler App Store hesabınız üzerinden tahsil edilir. Abonelikler, cari dönemin bitiminden en az 24 saat önce iptal edilmediği sürece otomatik olarak yenilenir.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Abonelik İptali:</Text> Aboneliğinizi dilediğiniz zaman iOS Cihaz Ayarları &gt; Apple ID &gt; Abonelikler adımlarını izleyerek iptal edebilirsiniz.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>İade Politikası:</Text> İade işlemleri tamamen Apple App Store politikalarına tabidir.
                </Text>

                <Text style={styles.docSubHeading}>6. Fikri Mülkiyet</Text>
                <Text style={styles.docParagraph}>
                  Uygulama içindeki tüm yazılım, algoritma, tasarım, logo ve içerik hakları Diet-Co'ya aittir. İzinsiz kopyalanamaz veya tersine mühendislik işlemlerine tabi tutulamaz.
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.docHeading}>KVKK VE GİZLİLİK AYDINLATMA METNİ</Text>

                <Text style={styles.docSubHeading}>1. Veri Sorumlusu</Text>
                <Text style={styles.docParagraph}>
                  6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, kişisel verileriniz veri sorumlusu olarak Diet-Co tarafından aşağıda açıklanan kapsamda işlenmektedir.
                </Text>

                <Text style={styles.docSubHeading}>2. İşlenen Kişisel Verileriniz</Text>
                <Text style={styles.docParagraph}>
                  Uygulama’yı kullanımınız sırasında aşağıdaki verileriniz işlenmektedir:
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Kimlik ve İletişim Verileri:</Text> Ad, e-posta adresi.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Sağlık ve Fiziksel Veriler (Özel Niteliğe Sahip Veriler):</Text> Boy, kilo, yaş, cinsiyet, hedef kilo, günlük aktivite düzeyi, gıda alerjileri ve tüketilen besin bilgileri.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Kullanım ve İşlem Verileri:</Text> Yapay zeka ile yapılan mesajlaşmalar, otomatik profilleme verileri, uygulama içi etkileşimler ve cihaz tanımlayıcıları.
                </Text>

                <Text style={styles.docSubHeading}>3. Verilerin İşlenme Amacı ve Hukuki Sebebi</Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Özel Nitelikli Sağlık Verileri:</Text> Kilo, boy ve beslenme verileriniz yalnızca size kişiselleştirilmiş kalori ve besin analizi sunulabilmesi amacıyla açık rızanıza dayanarak işlenir.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Otomatik Profilleme:</Text> Verileriniz yapay zeka algoritmaları tarafından yalnızca kişiselleştirilmiş diyet tavsiyeleri oluşturmak amacıyla otomatik olarak işlenir.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Genel Veriler:</Text> Abonelik süreçlerinin yürütülmesi, teknik destek sağlanması ve uygulama performansının artırılması amacıyla işlenir.
                </Text>

                <Text style={styles.docSubHeading}>4. Verilerin Aktarılması ve Yurt Dışı Transferi</Text>
                <Text style={styles.docParagraph}>
                  Kişisel verileriniz; hizmetin sunulabilmesi için gerekli olan sunucu/bulut altyapı sağlayıcılarına ve ödeme süreçleri için Apple App Store'a aktarılabilir.
                </Text>
                <Text style={styles.docParagraph}>
                  • <Text style={{ fontWeight: '700' }}>Yurt Dışına Veri Aktarımı:</Text> Yapay zeka analizlerinin (metin ve görsel işleme) gerçekleştirilebilmesi amacıyla anonimleştirilmiş veya takma adlı (pseudonymized) sağlık ve kullanım verileriniz, yurt dışında bulunan güvenli yapay zeka API sağlayıcılarının sunucularına aktarılmaktadır. Verileriniz üçüncü kişilere pazarlama amacıyla kesinlikle satılmaz.
                </Text>

                <Text style={styles.docSubHeading}>5. Veri Silme, Hesap Kapatma ve KVKK Hakları</Text>
                <Text style={styles.docParagraph}>
                  KVKK’nın 11. maddesi uyarınca verilerinizin işlenip işlenmediğini öğrenme, otomatik sistemlerle analiz edilmesine itiraz etme ve silinmesini talep etme hakkınız mevcuttur.
                </Text>
                <Text style={styles.docParagraph}>
                  Kullanıcılar, Uygulama içerisindeki "Hesabımı Sil" butonunu kullanarak veya destek e-posta adresimiz üzerinden talepte bulunarak sistemde kayıtlı tüm kişisel ve sağlık verilerinin sunuculardan kalıcı olarak silinmesini sağlayabilirler.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalAcceptBtn}
              onPress={() => {
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (_) {}
                setAgreedTerms(true);
                setLegalModal(null);
              }}
            >
              <Text style={styles.modalAcceptBtnText}>Okudum, Kabul Ediyorum</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF8' },
  scrollContent: { paddingHorizontal: 24, paddingVertical: 20, justifyContent: 'center', flexGrow: 1 },
  header: { alignItems: 'center', marginBottom: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  brandTitle: { fontSize: 28, fontWeight: '900', color: '#111827' },
  brandSubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 18, paddingHorizontal: 16 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 14, padding: 4, marginBottom: 20 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  tabBtnTextActive: { color: '#111827' },
  form: { gap: 14 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: 14, color: '#111827' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxActive: { backgroundColor: '#059669', borderColor: '#059669' },
  checkboxText: { fontSize: 12, color: '#4B5563', flex: 1, lineHeight: 18 },
  legalLinkText: { fontWeight: '800', color: '#059669', textDecorationLine: 'underline' },
  submitBtn: { backgroundColor: '#059669', borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { backgroundColor: '#9CA3AF' },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  backBtn: { backgroundColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: '#374151', fontSize: 14, fontWeight: '700' },

  stepBadge: { fontSize: 11, fontWeight: '800', color: '#059669', letterSpacing: 1, marginBottom: 4 },
  wizardTitle: { fontSize: 24, fontWeight: '900', color: '#111827' },
  wizardSub: { fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 18 },
  subSectionTitle: { fontSize: 11, fontWeight: '800', color: '#059669', letterSpacing: 0.8, marginTop: 4 },

  goalCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 18, padding: 16, gap: 14 },
  goalCardActive: { borderColor: '#059669', backgroundColor: '#F0FDF4' },
  goalIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  goalIconBoxActive: { backgroundColor: '#059669' },
  goalTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  goalTitleActive: { color: '#059669' },
  goalDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  ageBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  ageBadgeText: { fontSize: 11, fontWeight: '800', color: '#059669' },

  skipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, marginTop: 4 },
  skipBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280', textDecorationLine: 'underline' },

  frequencyRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  freqBtn: { width: 36, height: 40, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  freqBtnActive: { borderColor: '#059669', backgroundColor: '#059669' },
  freqBtnText: { fontSize: 13, fontWeight: '800', color: '#4B5563' },
  freqBtnTextActive: { color: '#FFFFFF' },

  activityCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, padding: 12 },
  activityCardActive: { borderColor: '#059669', backgroundColor: '#F0FDF4' },
  activityCardTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  activityCardTitleActive: { color: '#059669', fontWeight: '800' },
  activityCardDesc: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  healthWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  healthWarningText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
    lineHeight: 16,
    flex: 1,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  healthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  healthChipSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  healthChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  healthChipTextSelected: {
    color: '#FFFFFF',
  },

  cinematicContainer: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  cinematicCenter: { alignItems: 'center', width: '100%' },
  aiCoreGlow: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(5, 150, 105, 0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  aiCoreInner: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', shadowColor: '#059669', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20 },
  cinematicTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  cinematicSubtitle: { fontSize: 13, color: '#94A3B8', marginTop: 10, textAlign: 'center', lineHeight: 19, minHeight: 40, paddingHorizontal: 10 },
  cinematicProgressTrack: { width: '80%', height: 6, backgroundColor: '#1E293B', borderRadius: 3, marginTop: 24, overflow: 'hidden' },
  cinematicProgressBar: { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },

  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalCloseBtn: { padding: 4 },
  modalScroll: { flex: 1 },
  modalScrollContent: { paddingHorizontal: 20, paddingVertical: 20 },
  modalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  modalAcceptBtn: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalAcceptBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  docHeading: { fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 6, textAlign: 'center' },
  docDate: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 16, fontWeight: '600' },
  docSubHeading: { fontSize: 14, fontWeight: '800', color: '#059669', marginTop: 16, marginBottom: 6 },
  docParagraph: { fontSize: 13, color: '#4B5563', lineHeight: 20, marginBottom: 8 },
});

export default AuthScreen;