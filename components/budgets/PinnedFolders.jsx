import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { resolveFolderPalette } from '../../utils/colors';

/**
 * Compact horizontal strip of pinned folders shown at the bottom of Home. It is
 * a navigation shortcut only — the full folder list above stays untouched. Each
 * chip paints with the folder's own palette so custom colors carry over, and the
 * row scrolls sideways when many folders are pinned instead of growing the page.
 */
export function PinnedFolders({ budgets, onPressFolder }) {
  const { colors, radius, spacing } = useTheme();
  if (budgets.length === 0) return null;

  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />

      <View style={[styles.header, { marginBottom: spacing.sm }]}>
        <Icon name="pinFilled" size={14} color={colors.textMuted} />
        <Text variant="label" tone="muted">
          PINNED FOLDERS
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
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
              <Icon name="folder" size={16} color={folder.folderInk} />
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

      <View style={[styles.rule, { backgroundColor: colors.border, marginTop: spacing.lg }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  rule: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 16,
    opacity: 0.9,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 180,
  },
  chipLabel: {
    flexShrink: 1,
  },
});
