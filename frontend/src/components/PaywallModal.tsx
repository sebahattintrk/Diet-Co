import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Purchases, { PurchasesPackage } from 'react-native-purchases';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TERMS_URL = 'https://dietco.app/terms';
const PRIVACY_URL = 'https://dietco.app/privacy';

export function PaywallModal({ visible, onClose, onSuccess }: PaywallModalProps) {
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);

  // Mağazadan taze paket ve fiyat bilgisini çek
  useEffect(() => {
    if (visible) {
      (async () => {
        try {
          const offerings = await Purchases.getOfferings();
          if (offerings.current && offerings.current.availablePackages.length > 0) {
            // Aylık paketi yakala, yoksa ilk paketi seç
            const pkg =
              offerings.current.availablePackages.find(
                (p) => p.packageType === 'MONTHLY'
              ) || offerings.current.availablePackages[0];
            setMonthlyPackage(pkg);
          }
        } catch (e) {
          console.log('Fiyat çekme hatası (Fallback kullanılacak):', e);
        }
      })();
    }
  }, [visible]);

  // Satın Alma Tetikleme
  const handlePurchase = async () => {
    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}

    try {
      if (monthlyPackage) {
        const { customerInfo } = await Purchases.purchasePackage(monthlyPackage);
        if (customerInfo.entitlements.active['pro'] !== undefined) {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (_) {}
          Alert.alert('Hoş Geldin! 🎉', 'Diet-Co PRO aboneliğin başarıyla aktif edildi.');
          if (onSuccess) onSuccess();
          onClose();
        }
      } else {
        // Mağaza bağlantısı yoksa (Sandbox / TestFlight önizlemesi)
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Satın Alma Başarısız', e.message || 'Ödeme tamamlanamadı.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Apple & Google Zorunluluğu: Satın Alımları Geri Yükle (Restore)
  const handleRestore = async () => {
    setRestoring(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      if (customerInfo.entitlements.active['pro'] !== undefined) {
        Alert.alert('Başarılı', 'Aboneliğiniz başarıyla geri yüklendi!');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        Alert.alert('Bulunamadı', 'Bu hesaba ait aktif bir PRO aboneliği bulunamadı.');
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Geri yükleme işlemi başarısız: ' + e.message);
    } finally {
      setRestoring(false);
    }
  };

  const displayPrice = monthlyPackage?.product.priceString || '₺129,90';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.topRow}>
            <TouchableOpacity onPress={handleRestore} disabled={restoring}>
              {restoring ? (
                <ActivityIndicator size="small" color="#059669" />
              ) : (
                <Text style={styles.restoreText}></Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.badge}>
            <Ionicons name="sparkles" size={14} color="#059669" />
            <Text style={styles.badgeText}>SINIRSIZ PROFESYONEL KOÇLUK</Text>
          </View>

          <Text style={styles.title}>Diet-Co PRO ile Potansiyelini Katla!</Text>
          <Text style={styles.subtitle}>
            Kişisel yapay zeka diyetisyeninle hedeflerine sınır olmadan ulaş!
          </Text>

          <View style={styles.features}>
            <FeatureItem title="Katlanmış AI Koç Hizmeti" desc="Günlük 50 soru sorma hakkı!" />
            <FeatureItem title="Akıllı Dolap Uyarlaması" desc="Evdeki malzemelere göre anında sınırsız tarif üretimi!" />
            <FeatureItem title="Hastalık & Alerji Koruması" desc="Çölyak, diyabet ve laktoz gibi hassasiyetlere %100 uyum!" />
            <FeatureItem title="Kişisel Beslenme Hafızası" desc="Bütçeni, sevmediğin besinleri ve hedeflerini asla unutmaz!" />
          </View>

          <View style={styles.priceBox}>
            <View>
              <Text style={styles.oldPrice}>₺229,90 / ay</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text style={styles.newPrice}>{displayPrice}</Text>
                <Text style={styles.perMonth}>/ aylık</Text>
              </View>
            </View>
            <View style={styles.discountTag}>
              <Text style={styles.discountTagText}>%43 TASARRUF</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.buyBtn, loading && { opacity: 0.7 }]}
            onPress={handlePurchase}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buyBtnText}>PRO'ya Geç ({displayPrice})</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.guaranteeText}>
            Abonelik her ay otomatik yenilenir. İstediğin an mağaza ayarlarından iptal edebilirsin.
          </Text>

          {/* Apple & Google Yasal Bağlantıları */}
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={styles.legalText}>Kullanım Koşulları (EULA)</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={styles.legalText}>Gizlilik Politikası</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FeatureItem({ title, desc }: { title: string; desc: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.checkIcon}>
        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  restoreText: { fontSize: 13, fontWeight: '700', color: '#059669' },
  closeBtn: { padding: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginBottom: 10 },
  badgeText: { color: '#059669', fontSize: 11, fontWeight: '800' },
  title: { fontSize: 23, fontWeight: '900', color: '#111827', lineHeight: 28 },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 5, lineHeight: 18 },
  features: { gap: 12, marginVertical: 18 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 13, fontWeight: '800', color: '#111827' },
  featureDesc: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  priceBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#059669', borderRadius: 16, padding: 14, marginBottom: 14 },
  oldPrice: { fontSize: 12, color: '#9CA3AF', textDecorationLine: 'line-through' },
  newPrice: { fontSize: 22, fontWeight: '900', color: '#111827' },
  perMonth: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  discountTag: { backgroundColor: '#DC2626', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  discountTagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  buyBtn: { backgroundColor: '#059669', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  buyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  guaranteeText: { textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 10, lineHeight: 15 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 },
  legalText: { fontSize: 11, color: '#6B7280', textDecorationLine: 'underline' },
  legalDot: { fontSize: 11, color: '#9CA3AF' },
});