// frontend/src/components/common/Text.tsx
import React from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';

export function Text({ style, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style) || {};
  const weight = flattened.fontWeight;

  let fontFamily = 'PlusJakartaSans-Regular';

  if (weight === 'bold' || weight === '700' || weight === '800' || weight === '900') {
    fontFamily = 'PlusJakartaSans-Bold';
  } else if (weight === '600' || weight === '500') {
    fontFamily = 'PlusJakartaSans-SemiBold';
  }

  // fontWeight custom font ile çakışmasın diye temizleyip doğru font ailesini uyguluyoruz
  return (
    <RNText
      {...props}
      style={[{ fontFamily }, style, { fontFamily }]}
    />
  );
}