import { Pressable, StyleSheet, View } from 'react-native';

import { resolveFolderPalette } from '../../utils/colors';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * A budget folder on Home: same tab-and-card silhouette as a BudgetCard so
 * the two read as one family, but it shows only a name and how many budgets
 * live inside. Folders hold no money — there are deliberately no totals here.
 */
export function FolderGroupCard({ folder, budgetCount, onPress }) {
  const { colors, radius, spacing } = useTheme();
  const palette = resolveFolderPalette(folder.color, colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, ${budgetCount} ${budgetCount === 1 ? 'budget' : 'budgets'}`}
      onPress={onPress}
      style={({ pressed }) => [{ marginBottom: spacing.md }, pressed && { opacity: 0.82 }]}
    >
      <View style={[styles.tab, { backgroundColor: palette.folderBorder }]} />

      <View
        style={[
          styles.body,
          {
            backgroundColor: palette.folder,
            borderColor: palette.folderBorder,
            borderRadius: radius.md,
          },
        ]}
      >
        <View style={styles.row}>
          <Icon name="folder" size={20} color={palette.folderInk} />
          <Text variant="heading" numberOfLines={1} style={[styles.title, { color: palette.folderInk }]}>
            {folder.name}
          </Text>
          <Text variant="caption" style={{ color: palette.folderInk, opacity: 0.85 }}>
            {budgetCount} {budgetCount === 1 ? 'budget' : 'budgets'}
          </Text>
          <Icon name="chevronRight" size={16} color={palette.folderInk} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    height: 7,
    marginLeft: 18,
    width: 92,
  },
  body: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    flex: 1,
  },
});
