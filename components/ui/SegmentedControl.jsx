import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

const PILL_TRAVEL_MS = 200;

/** options: [{ value, label, icon? }] — `icon` is an Icon name shown before the label. */
export function SegmentedControl({ options, value, onChange, style, dense = false }) {
  const { colors, radius, spacing } = useTheme();
  const reduced = useReducedMotion();

  // The active segment is a capsule that glides to the tapped option instead
  // of blinking in place — the same cue as the bottom tab pill. Geometry
  // comes from the track's measured box; segments stay flex:1 siblings the
  // pill never interferes with.
  const [trackBox, setTrackBox] = useState(null);
  const activeIndex = options.findIndex((option) => option.value === value);
  const pad = spacing.xs;
  const segWidth = trackBox ? (trackBox.width - pad * 2) / options.length : 0;
  const travelX = useSharedValue(0);
  const snappedRef = useRef(false);

  useEffect(() => {
    if (!trackBox || activeIndex < 0) return;
    const target = activeIndex * segWidth;
    if (!snappedRef.current) {
      // First layout: place the pill unseen under the active segment.
      snappedRef.current = true;
      travelX.value = target;
      return;
    }
    travelX.value = withTiming(target, { duration: reduced ? 0 : PILL_TRAVEL_MS });
  }, [activeIndex, reduced, segWidth, trackBox, travelX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travelX.value }],
  }));

  const pillVisible = trackBox != null && activeIndex >= 0;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) =>
        setTrackBox({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
      style={[
        styles.track,
        {
          backgroundColor: colors.surfaceMuted,
          // The segments are capsules; the track is the capsule radius plus
          // the padding so the outline wraps the segments concentrically.
          borderRadius: radius.pill,
          padding: spacing.xs,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.pill,
            borderWidth: StyleSheet.hairlineWidth,
            left: pad,
            top: pad,
            bottom: pad,
            width: segWidth,
            opacity: pillVisible ? 1 : 0,
          },
          pillStyle,
        ]}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              dense && styles.optionDense,
              {
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            {option.icon ? (
              <Icon
                name={option.icon}
                size={dense ? 14 : 16}
                color={active ? colors.primary : colors.textMuted}
              />
            ) : null}
            <Text variant="label" tone={active ? 'primary' : 'muted'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
  },
  pill: {
    position: 'absolute',
  },
  option: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
  },
  optionDense: {
    // Dense keeps the tighter label, but the segment is still a primary
    // one-tap control: it must clear the 44dp minimum.
    minHeight: 44,
    paddingVertical: 6,
  },
});
