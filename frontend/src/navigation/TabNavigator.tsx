// frontend/src/navigation/TabNavigator.tsx
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { HomeScreen } from '../screens/HomeScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { SupplementScreen } from '../screens/SupplementScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const Tab = createBottomTabNavigator();

const HORIZONTAL_MARGIN = 10;
const DOCK_WIDTH = SCREEN_WIDTH - HORIZONTAL_MARGIN * 2;
const DOCK_PADDING = 3;

const TAB_CONFIG: Record<string, { label: string; icon: any; iconOutline: any }> = {
  Home: { label: 'Ana Sayfa', icon: 'home', iconOutline: 'home-outline' },
  Plan: { label: 'Öğün & Plan', icon: 'calendar', iconOutline: 'calendar-outline' },
  Chat: { label: 'AI Koç', icon: 'chatbubbles', iconOutline: 'chatbubbles-outline' },
  Supplement: { label: 'Takviye', icon: 'nutrition', iconOutline: 'nutrition-outline' },
  Progress: { label: 'Gelişim', icon: 'stats-chart', iconOutline: 'stats-chart-outline' },
  Profile: { label: 'Profil', icon: 'person', iconOutline: 'person-outline' },
};

function AnimatedFloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routesCount = state.routes.length;
  const availableWidth = DOCK_WIDTH - DOCK_PADDING * 2;
  const tabWidth = availableWidth / routesCount;

  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: state.index * tabWidth,
      damping: 22,
      stiffness: 250,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [state.index, tabWidth]);

  return (
    <View
      style={[
        styles.dockWrapper,
        {
          bottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 14) : 14,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.floatingDock}>
        {/* Kayan Yeşil Kapsül */}
        <Animated.View
          style={[
            styles.slidingCapsule,
            {
              width: tabWidth,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <View style={styles.capsuleInner} />
        </Animated.View>

        {/* Sekme Butonları */}
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const meta = TAB_CONFIG[route.name] || {
            label: route.name,
            icon: 'apps',
            iconOutline: 'apps-outline',
          };

          const onPress = () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.8}
              style={styles.tabButton}
            >
              <View style={styles.iconBox}>
                <Ionicons
                  name={isFocused ? meta.icon : meta.iconOutline}
                  size={isFocused ? 20 : 18}
                  color={isFocused ? '#059669' : '#94A3B8'}
                />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[
                  styles.tabText,
                  isFocused ? styles.tabTextActive : styles.tabTextInactive,
                ]}
              >
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export const TabNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <AnimatedFloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Plan" component={PlanScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Supplement" component={SupplementScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  dockWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  floatingDock: {
    width: DOCK_WIDTH,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: DOCK_PADDING,
    borderWidth: 1.2,
    borderColor: '#E2EFE7',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
  },
  slidingCapsule: {
    position: 'absolute',
    left: DOCK_PADDING,
    top: 5,
    bottom: 5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  capsuleInner: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  iconBox: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 9,
    letterSpacing: -0.3,
    marginTop: 2,
    textAlign: 'center',
  },
  tabTextActive: {
    fontWeight: '800',
    color: '#059669',
  },
  tabTextInactive: {
    fontWeight: '600',
    color: '#94A3B8',
  },
});

export default TabNavigator;