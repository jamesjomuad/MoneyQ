import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * Standard scrollable screen body. Keeping this in one place means every tab
 * shares identical padding and background handling.
 */
export function Screen({ children, scroll = true, contentContainerStyle, refreshing, onRefresh }) {
  const { colors, spacing } = useTheme();

  const contentStyle = [
    styles.content,
    { padding: spacing.lg },
    contentContainerStyle,
  ];

  if (!scroll) {
    return <View style={[styles.fill, { backgroundColor: colors.background }]}>{children}</View>;
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

export function SectionHeader({ title, action }) {
  const { spacing } = useTheme();

  return (
    <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
      <Text variant="label" tone="muted">
        {title.toUpperCase()}
      </Text>
      {action ?? null}
    </View>
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});