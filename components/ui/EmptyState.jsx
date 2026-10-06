import { StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function EmptyState({ icon = 'empty', title, description, children }) {
  const { colors, spacing } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceMuted }]}>
        <Icon name={icon} size={26} color={colors.textFaint} />
      </View>

      <Text variant="heading" style={styles.title}>
        {title}
      </Text>

      {description ? (
        <Text variant="body" tone="muted" style={styles.description}>
          {description}
        </Text>
      ) : null}

      {children ? <View style={{ marginTop: spacing.lg }}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    marginBottom: 16,
    width: 56,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    marginTop: 6,
    textAlign: 'center',
  },
});