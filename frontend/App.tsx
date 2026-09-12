import React, { useEffect } from 'react';
import { View, StatusBar, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useUserStore } from './src/store/userStore';
import './global.css';

const queryClient = new QueryClient();

// 🔑 RevenueCat API Anahtarları (RevenueCat Dashboard > Project Settings > API Keys)
const REVENUECAT_KEYS = {
  apple: 'appl_xxxxxxxxxxxxxxxxxxxxxxxxx',   // App Store Public API Key
  google: 'goog_xxxxxxxxxxxxxxxxxxxxxxxxx', // Google Play Public API Key
};

export default function App() {
  const hydrate = useUserStore((state) => state.hydrate);
  const user = useUserStore((state) => state.user);

  // 1. RevenueCat SDK Başlatma
  useEffect(() => {
    const initPurchases = async () => {
      try {
        if (__DEV__) {
          Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        }

        const apiKey = Platform.OS === 'ios' ? REVENUECAT_KEYS.apple : REVENUECAT_KEYS.google;
        if (apiKey && !apiKey.includes('xxxxxxxx')) {
          await Purchases.configure({ apiKey });
        }
      } catch (err) {
        console.log('RevenueCat başlatma uyarısı:', err);
      }
    };

    initPurchases();
  }, []);

  // 2. Kullanıcı Giriş/Oturum Senkronizasyonu
  useEffect(() => {
    if (user?.id) {
      try {
        // Satın alımları kullanıcının veritabanı ID'sine mühürler
        Purchases.logIn(String(user.id)).catch(() => {});
      } catch (_) {}
    }
  }, [user?.id]);

  // 3. Yerel Kullanıcı Durumunu Yükleme (Hydrate)
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <SafeAreaProvider style={styles.container}>
      <QueryClientProvider client={queryClient}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAF8" />
        <View style={styles.container}>
          <RootNavigator />
        </View>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF8',
  },
});