import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBandHeight } from '../navigation/tabBand';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { useToastStore } from '../../stores/toastStore';

const TONE_KEYS = { success: 'success', warning: 'warning', error: 'expense' };
const TONE_ICONS = { success: 'check', warning: 'warning', error: 'close' };
const TONE_WORDS = { success: 'Success', warning: 'Warning', error: 'Error' };
const VISIBLE_MS = 2400;
const ACTION_VISIBLE_MS = 6000;

/**
 * Single app-wide toast, mounted by the root layout so it stays visible
 * while a screen closes around it. Colors come from the theme tokens only.
 */
export function ToastView() {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const tabBandHeight = useTabBandHeight();
  const current = useToastStore((state) => state.current);
  const dismiss = useToastStore((state) => state.dismiss);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!current) return undefined;

    Animated.timing(opacity, {
      toValue: 1,
      duration: reducedMotion ? 0 : 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    const visibleMs = current.visibleMs ?? (current.action ? ACTION_VISIBLE_MS : VISIBLE_MS);
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: reducedMotion ? 0 : 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) dismiss(current.id);
      });
    }, visibleMs);

    return () => {
      clearTimeout(timer);
      opacity.stopAnimation();
    };
  }, [current, dismiss, opacity, reducedMotion]);

  if (!current) return null;
  const toneKey = current.tone ?? 'success';
  const toneColor = colors[TONE_KEYS[toneKey] ?? 'success'];

  return (
    <View
      style={[
        styles.host,
        // Plain feedback floats above the UI without intercepting touches; a
        // snackbar action must be pressable, so only then does the pill take
        // touches (and just its own box).
        {
          pointerEvents: current.action ? 'box-none' : 'none',
          // The measured band already contains its own bottom inset, so on
          // tab screens float the pill above it; elsewhere clear the inset.
          bottom:
            tabBandHeight != null
              ? tabBandHeight + spacing.md
              : insets.bottom + spacing.xl,
        },
      ]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        // The dot color was the only severity cue; speak the tone too.
        accessibilityLabel={`${TONE_WORDS[toneKey] ?? 'Notice'}: ${current.message}`}
        style={[
          styles.pill,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.pill,
            boxShadow: `0 2px 6px ${colors.shadow}`,
            opacity,
          },
        ]}
      >
        <Icon name={TONE_ICONS[toneKey] ?? 'check'} size={16} color={toneColor} />
        <Text variant="label" style={{ color: colors.text, flexShrink: 1 }}>
          {current.message}
        </Text>
        {current.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={current.action.label}
            onPress={() => {
              const id = current.id;
              current.action.onPress();
              dismiss(id);
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.action,
              { opacity: pressed ? 0.6 : 1, marginLeft: spacing.sm },
            ]}
          >
            <View style={styles.actionContent}>
              {current.action.icon ? (
                <Icon name={current.action.icon} size={14} color={colors.primary} />
              ) : null}
              <Text variant="label" tone="primary">
                {current.action.label}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
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
    flexDirection: 'row',
    gap: 8,
    // No maxHeight cap: long restore/error strings must wrap, not clip.
    maxWidth: '92%',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
