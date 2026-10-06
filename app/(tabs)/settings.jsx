import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { Screen, ScreenTitle, SectionHeader } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { CURRENCIES } from '../../utils/currency';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const setCurrency = useSettingsStore((state) => state.setCurrency);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const storageSource = useAppStore((state) => state.storageSource);
  const isPreview = storageSource === 'memory';

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  return (
    <Screen>
      <ScreenTitle
        title="Settings"
        subtitle={isPreview ? 'Browser preview — sample data, not saved' : 'Preferences are stored on this device'}
      />

      <SectionHeader title="Currency" />
      <Card padded={false}>
        {Object.values(CURRENCIES).map((option, index) => {
          const isSelected = option.code === currency;

          return (
            <Pressable
              key={option.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setCurrency(option.code)}
              style={({ pressed }) => [
                styles.option,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: index === Object.values(CURRENCIES).length - 1 ? 0 : StyleSheet.hairlineWidth,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={styles.flex}>
                <Text variant="body">{option.code}</Text>
                <Text variant="caption" tone="faint">
                  {option.symbol} · {option.minorUnits} decimal places
                </Text>
              </View>

              {isSelected ? (
                <Text variant="heading" tone="primary">
                  ✓
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </Card>

      <View style={{ height: spacing.xl }} />

      <SectionHeader title="Tags" />
      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/tags')}
          style={({ pressed }) => [styles.option, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={styles.flex}>
            <Text variant="body">Manage tags</Text>
            <Text variant="caption" tone="faint">
              The shared library used to group transactions
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textFaint} />
        </Pressable>
      </Card>

      <View style={{ height: spacing.xl }} />

      <SectionHeader title="About" />
      <Card>
        <Text variant="body" tone="muted">
          {isPreview
            ? 'This build runs in a browser against in-memory sample data, so nothing you do here is saved. The Android app uses the on-device SQLite database instead.'
            : 'MoneyQ stores everything locally on this device. It works fully offline and does not send your financial data anywhere.'}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});