import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

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
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const contentStyle = [
    styles.content,
    {
      padding: spacing.lg,
      // Tab pages render without a header, so the status bar would overlap
      // the first row; opt-in padding hands the inset back.
      paddingTop: spacing.lg + (topInset ? insets.top : 0),
      // Content runs edge-to-edge behind Android's navigation bar, so the last
      // row needs the inset added to keep it tappable.
      paddingBottom: spacing.lg + insets.bottom,
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
    <ScrollView
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {children}
    </ScrollView>
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
}) {
  const { colors, spacing } = useTheme();

  const content = (
    <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
      <View style={styles.titleGroup}>
        {onToggle ? (
          <Icon
            name="chevronRight"
            size={14}
            color={colors.text}
            style={collapsed ? null : styles.chevronDown}
          />
        ) : null}
        <Text
          variant="label"
          tone="muted"
          style={fontSize ? { fontSize } : null}
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
  chevronDown: {
    transform: [{ rotate: "90deg" }],
  },
});
