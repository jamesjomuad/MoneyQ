import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { withAlpha } from '../../utils/color';

/**
 * Emoji for a tag, with its name unless showName is false, rendered at the size
 * used inside transaction rows and pickers. The colour appears as a soft tinted
 * disc behind the emoji so a tag stays recognisable without an icon font.
 */
export function TagBadge({ tag, size = 'md', showName = true }) {
  const { colors, spacing } = useTheme();

  if (!tag) {
    return showName ? (
      <Text variant="caption" tone="faint">
        Untagged
      </Text>
    ) : null;
  }

  const box = size === 'sm' ? 22 : 32;

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.disc,
          {
            backgroundColor: withAlpha(tag.color ?? colors.primary, 0.16),
            borderRadius: box / 2,
            height: box,
            width: box,
          },
        ]}
      >
        <Text style={{ fontSize: box * 0.55 }}>{tag.emoji ?? '🏷️'}</Text>
      </View>
      {showName ? (
        <Text variant="body" numberOfLines={1} style={{ flexShrink: 1, marginLeft: spacing.sm }}>
          {tag.name}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    minWidth: 0,
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});