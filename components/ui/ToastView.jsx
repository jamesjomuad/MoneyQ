import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { useToastStore } from '../../stores/toastStore';

const TONE_KEYS = { success: 'success', warning: 'warning', error: 'expense' };
const VISIBLE_MS = 2400;

/**
 * Single app-wide toast, mounted by the root layout so it stays visible
 * while a screen closes around it. Colors come from the theme tokens only.
 */
export function ToastView() {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const current = useToastStore((state) => state.current);
  const dismiss = useToastStore((state) => state.dismiss);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!current) return undefined;

    Animated.timing(opacity, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) dismiss(current.id);
      });
    }, VISIBLE_MS);

    return () => {
      clearTimeout(timer);
      opacity.stopAnimation();
    };
  }, [current, dismiss, opacity]);

  if (!current) return null;
  const toneColor = colors[TONE_KEYS[current.tone] ?? 'success'];

  return (
    <View
      pointerEvents="none"
      style={[styles.host, { bottom: insets.bottom + spacing.xl }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.pill,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.pill,
            opacity,
          },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: toneColor }]} />
        <Text variant="label" style={{ color: colors.text }}>
          {current.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 100,
  },
  pill: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    flexDirection: 'row',
    gap: 8,
    maxHeight: 80,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dot: { borderRadius: 4, height: 8, width: 8 },
});
