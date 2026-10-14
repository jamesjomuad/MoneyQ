import { Pressable, StyleSheet, View } from 'react-native';

import { resolveRowChip } from '../../utils/colors';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * A budget folder on Home as a compact list row: a chip painted with the
 * folder's exact saved color, the name over a "Folder · N budgets" detail
 * line, and a muted chevron. Rows live inside a shared rounded card and are
 * separated by hairlines, so a folder and a budget read as one family.
 * Folders hold no money — there are deliberately no totals here.
 */
export function FolderGroupCard({ folder, budgetCount, onPress, isLast = false }) {
  const { colors, radius, spacing } = useTheme();
  const chip = resolveRowChip(folder.color, colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, folder, ${budgetCount} ${budgetCount === 1 ? 'budget' : 'budgets'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        },
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      <View
        style={[
          styles.iconChip,
          { backgroundColor: chip.background, borderRadius: radius.md },
        ]}
      >
        <Icon name="folder" size={20} color={chip.icon} />
      </View>

      <View style={styles.copy}>
        <Text variant="heading" numberOfLines={1}>
          {folder.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.detail}>
          Folder · {budgetCount} {budgetCount === 1 ? 'budget' : 'budgets'}
        </Text>
      </View>

      <Icon name="chevronRight" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  iconChip: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  detail: {
    marginTop: 2,
  },
});
