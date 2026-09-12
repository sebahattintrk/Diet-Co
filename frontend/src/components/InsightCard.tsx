import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';
import type { Insight } from '@/api/queries';

type Props = {
  insight: Insight;
};

export function InsightCard({ insight }: Props) {
  const accent =
    insight.tone === 'positive' ? colors.success :
    insight.tone === 'warning'  ? colors.warning :
                                  colors.primary;

  return (
    <LinearGradient
      colors={['rgba(124,77,255,0.20)', 'rgba(18,24,38,0.7)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Header */}
      <View className="flex-row items-center mb-3">
        <View
          style={{
            width: 8, height: 8, borderRadius: 8,
            backgroundColor: accent, marginRight: 8,
          }}
        />
        <Text className="text-textLow text-[10px] uppercase tracking-widest">
          Diet-Co AI · Bugünkü Kararın
        </Text>
      </View>

      {/* Situation — the headline */}
      <Text
        className="text-textHi text-lg font-bold"
        style={{ lineHeight: 23 }}
      >
        {insight.situation}
      </Text>

      {/* Reason */}
      <Section label="NEDEN" body={insight.reason} accent={accent} />

      {/* Action */}
      <Section label="BUGÜN NE YAP" body={insight.action} accent={accent} emphasized />
    </LinearGradient>
  );
}

function Section({
  label, body, accent, emphasized,
}: { label: string; body: string; accent: string; emphasized?: boolean }) {
  return (
    <View
      style={{
        marginTop: 12,
        borderLeftWidth: 2,
        borderLeftColor: emphasized ? accent : colors.border,
        paddingLeft: 12,
      }}
    >
      <Text
        style={{
          color: emphasized ? accent : colors.textLow,
          fontSize: 10,
          letterSpacing: 1.4,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: emphasized ? colors.textHi : colors.textMid,
          fontSize: 13.5,
          lineHeight: 19,
          marginTop: 4,
          fontWeight: emphasized ? '600' : '400',
        }}
      >
        {body}
      </Text>
    </View>
  );
}
