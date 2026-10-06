import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { Screen, ScreenTitle, SectionHeader } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { CURRENCIES } from '../../utils/currency';
import { useSettingsStore } from '../../stores/settingsStore';

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const setCurrency = useSettingsStore((state) => state.setCurrency);
  const loadSettings = useSettingsStore((state) => state.loadSettings);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  return (
    <Screen>
      <ScreenTitle title="Settings" subtitle="Preferences are stored on this device" />

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

      <SectionHeader title="About" />
      <Card>
        <Text variant="body" tone="muted">
          MoneyQ stores everything locally on this device. It works fully
          offline and does not send your financial data anywhere.
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