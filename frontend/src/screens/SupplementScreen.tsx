// frontend/src/screens/SupplementScreen.tsx
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const FLOATING_ITEMS = [
  { id: 1, icon: 'nutrition-outline', size: 36, startX: 30, startY: 120, delay: 0, duration: 4200 },
  { id: 2, icon: 'fitness-outline', size: 44, startX: SCREEN_WIDTH - 80, startY: 160, delay: 600, duration: 4800 },
  { id: 3, icon: 'beaker-outline', size: 32, startX: 45, startY: SCREEN_HEIGHT - 320, delay: 1200, duration: 3900 },
  { id: 4, icon: 'medkit-outline', size: 40, startX: SCREEN_WIDTH - 90, startY: SCREEN_HEIGHT - 280, delay: 300, duration: 5200 },
  { id: 5, icon: 'water-outline', size: 30, startX: SCREEN_WIDTH / 2 - 15, startY: 80, delay: 900, duration: 4400 },
  { id: 6, icon: 'sparkles-outline', size: 28, startX: SCREEN_WIDTH / 2 - 80, startY: SCREEN_HEIGHT - 220, delay: 1500, duration: 3600 },
];

const FloatingIcon = ({ item }: { item: typeof FLOATING_ITEMS[0] }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -22,
          duration: item.duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          delay: item.delay,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: item.duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(rotate, {
          toValue: 1,
          duration: item.duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 0,
          duration: item.duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [item, rotate, translateY]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '12deg'],
  });

  return (
    <Animated.View
      style={[
        styles.floatingBubble,
        {
          left: item.startX,
          top: item.startY,
          transform: [{ translateY }, { rotate: spin }],
        },
      ]}
    >
      <Ionicons name={item.icon as any} size={item.size} color="#10B981" />
    </Animated.View>
  );
};

export const SupplementScreen = () => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {FLOATING_ITEMS.map((item) => (
        <FloatingIcon key={item.id} item={item} />
      ))}

      <View style={styles.content}>
        <Animated.View style={[styles.mainIconContainer, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.glowRing} />
          <View style={styles.mainIconInner}>
            <Ionicons name="nutrition" size={42} color="#059669" />
          </View>
        </Animated.View>

        <View style={styles.badge}>
          <Ionicons name="time-outline" size={14} color="#059669" />
          <Text style={styles.badgeText}>ÇOK YAKINDA</Text>
        </View>

        <Text style={styles.title}>Akıllı Takviye & Supplement Asistanı</Text>
        
        <Text style={styles.description}>
          Kişisel hedeflerine, beslenme planına ve antrenman yoğunluğuna özel takviye kombinasyonları yapay zeka tarafından hazırlanıyor.
        </Text>

        <View style={styles.featureBox}>
          <View style={styles.featureItem}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={styles.featureText}>Kişiselleştirilmiş Kreatin & Protein Zamanlaması</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={styles.featureText}>Eksik Vitamin & Mineral Açığı Taraması</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={styles.featureText}>Etkileşim Uyarısı (Hangi takviye ne zaman alınır?)</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF8',
    position: 'relative',
    overflow: 'hidden',
  },
  floatingBubble: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(236, 253, 245, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 243, 208, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 2,
  },
  mainIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  glowRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  mainIconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#064E3B',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  featureBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6EFE9',
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
  },
});

export default SupplementScreen;