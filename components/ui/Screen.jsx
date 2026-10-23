import { useNavigation } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tabBandHeight } from "../navigation/tabBand";
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
  // Attach the ScrollView instance so a child drag (DraggableRows) can lock
  // scrolling and drive edge auto-scroll via scrollTo/measureInWindow.
  scrollRef,
  // Forwarded for auto-scroll bookkeeping; throttled like the RN docs suggest.
  onScroll,
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const entering = useEnter(enter);
  // Inside a bottom-tab screen the floating capsule is an overlay: the scene
  // runs all the way to the bottom edge and scrolls underneath it, so content
  // reserves the band height to keep its last row clear of the capsule (the
  // same contract the Add transaction page uses for its floating button).
  const navigation = useNavigation();
  const inTabScreen = navigation?.getState?.().type === "tab";

  const contentStyle = [
    styles.content,
    {
      padding: spacing.lg,
      // Tab pages render without a header, so the status bar would overlap
      // the first row; opt-in padding hands the inset back.
      paddingTop: spacing.lg + (topInset ? insets.top : 0),
      // Stack screens sit at the physical bottom edge, so content needs the
      // inset to clear Android's navigation bar. Tab screens instead clear the
      // floating capsule, whose band already carries the bottom inset.
      paddingBottom:
        spacing.lg +
        (inTabScreen ? tabBandHeight(insets.bottom, spacing) : insets.bottom) +
        bottomSpace,
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
      ref={scrollRef}
      entering={entering}
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={scrollEnabled}
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? 16 : 0}
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
 * navigable. Pass `style` to override the default bottom margin when a section
 * needs tighter spacing. `inlineAction` rides inside the title group, right
 * beside the label: a touchable there (e.g. a checkbox) keeps its own press —
 * RN hands the responder to the inner control, so the fold never double-fires.
 */
export function SectionHeader({
  title,
  action,
  inlineAction,
  collapsed,
  onToggle,
  fontSize,
  color,
  style,
}) {
  const { colors, spacing } = useTheme();

  const content = (
    <View style={[styles.sectionHeader, { marginBottom: spacing.sm }, style]}>
      <View style={styles.titleGroup}>
        {onToggle ? (
          <Chevron collapsed={collapsed} color={colors.text} />
        ) : null}
        <Text
          variant="label"
          tone="muted"
          // A section title is a heading for screen readers; when the whole
          // header folds the section, the Pressable below already carries the
          // title in its label, so don't nest a heading inside a button.
          accessibilityRole={onToggle ? undefined : 'header'}
          style={[{ fontFamily: 'Manrope_700Bold' }, color ? { color } : null, fontSize ? { fontSize } : null]}
        >
          {title.toUpperCase()}
        </Text>
        {inlineAction ?? null}
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
