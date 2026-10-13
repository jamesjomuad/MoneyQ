import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import { useContext, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

/** Enter animation for fresh screen content; skipped when the OS asks for reduced motion. */
function useEnter(enabled) {
  const reduced = useReducedMotion();
  return enabled && !reduced ? FadeInDown.duration(220) : undefined;
}

/**
 * Standard scrollable screen body. Keeping it in one place means every tab
 * shares identical padding and background handling.
 */
export function Screen({
  children,
  scroll = true,
  contentContainerStyle,
  refreshing,
  onRefresh,
  topInset = false,
  enter = true,
  bottomSpace = 0,
  // Pass false while a child owns an in-progress drag gesture: Android's
  // native ScrollView intercepts at the touch slop and force-cancels the JS
  // responder regardless of termination refusals, so the only reliable way to
  // keep a child drag alive is to stop the scroll container from scrolling.
  scrollEnabled = true,
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const entering = useEnter(enter);
  // Inside a bottom-tab screen the floating tab bar is laid out in-flow below
  // the scene, and its band already reserves the bottom safe-area inset. We
  // only need the context's presence (undefined on stack/modal screens) to
  // avoid double-counting the inset.
  const inTabScreen = useContext(BottomTabBarHeightContext) !== undefined;

  const contentStyle = [
    styles.content,
    {
      padding: spacing.lg,
      // Tab pages render without a header, so the status bar would overlap
      // the first row; opt-in padding hands the inset back.
      paddingTop: spacing.lg + (topInset ? insets.top : 0),
      // Stack screens sit at the physical bottom edge, so content needs the
      // inset to clear Android's navigation bar. Tab screens stop above the
      // tab bar band, which already accounts for it.
      paddingBottom:
        spacing.lg + (inTabScreen ? 0 : insets.bottom) + bottomSpace,
    },
    contentContainerStyle,
  ];

  if (!scroll) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        {children}
      </View>
    );
  }

  return (
    <Animated.ScrollView
      entering={entering}
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={scrollEnabled}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {children}
    </Animated.ScrollView>
  );
}

export function ScreenTitle({ title, subtitle }) {
  const { spacing } = useTheme();

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text variant="title">{title}</Text>
      {subtitle ? (
        <Text variant="body" tone="muted" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Fold indicator that rotates open/closed instead of snapping. */
function Chevron({ collapsed, color }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(collapsed ? 0 : 1);

  useEffect(() => {
    progress.value = withTiming(collapsed ? 0 : 1, {
      duration: reduced ? 0 : 200,
    });
  }, [collapsed, reduced, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Icon name="chevronRight" size={14} color={color} />
    </Animated.View>
  );
}

/**
 * Section heading. Pass `collapsed` + `onToggle` to make it fold its section —
 * the header stays visible (title and action remain) so a folded list is still
 * navigable.
 */
export function SectionHeader({
  title,
  action,
  collapsed,
  onToggle,
  fontSize,
  color,
}) {
  const { colors, spacing } = useTheme();

  const content = (
    <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
      <View style={styles.titleGroup}>
        {onToggle ? (
          <Chevron collapsed={collapsed} color={colors.text} />
        ) : null}
        <Text
          variant="label"
          tone="muted"
          style={[{ fontFamily: 'Manrope_700Bold' }, color ? { color } : null, fontSize ? { fontSize } : null]}
        >
          {title.toUpperCase()}
        </Text>
      </View>
      {action ?? null}
    </View>
  );

  if (!onToggle) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={collapsed ? `Expand ${title}` : `Collapse ${title}`}
      onPress={onToggle}
      hitSlop={8}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
});
