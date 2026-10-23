import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { resolveFolderPalette } from "../../utils/colors";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

/**
 * Compact horizontal strip of pinned folders docked at the bottom of Home,
 * below the scrolling folder list. It is a navigation shortcut only — the full
 * folder list above stays untouched. Each chip paints with the folder's own
 * palette so custom colors carry over, and the row scrolls sideways when many
 * folders are pinned instead of growing the page.
 *
 * The strip sits above the floating tab capsule, which already covers the
 * Android bottom inset and sits inside its own band; the host lifts this strip
 * by that band, so the strip must not add insets.bottom itself or the nav area
 * is double-counted and the page gains a tall blank band.
 */
export function PinnedFolders({ budgets, onPressFolder }) {
  const { colors, radius, spacing } = useTheme();
  if (budgets.length === 0) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          paddingHorizontal: spacing.lg,
        },
      ]}
    >
      <View style={[styles.header, { marginBottom: spacing.sm }]}>
        <Icon name="pinFilled" size={14} color={colors.textMuted} />
        <Text variant="label" tone="muted">
          PINNED
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: spacing.sm,
          paddingRight: spacing.xxl * 2,
        }}
      >
        {budgets.map((budget) => {
          const folder = resolveFolderPalette(budget.color, colors);
          return (
            <Pressable
              key={budget.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${budget.name}`}
              onPress={() => onPressFolder(budget)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: folder.folder,
                  borderColor: folder.folderBorder,
                  borderRadius: radius.md,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                },
                pressed && { opacity: 0.82 },
              ]}
            >
              <Icon name="wallet" size={16} color={folder.folderInk} />
              <Text
                variant="label"
                numberOfLines={1}
                style={[styles.chipLabel, { color: folder.folderInk }]}
              >
                {budget.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    maxWidth: 180,
    // 44 px keeps the chip a full-size touch target without a hitSlop that
    // would overlap its neighbours in the horizontal strip.
    minHeight: 44,
  },
  chipLabel: {
    flexShrink: 1,
  },
});
