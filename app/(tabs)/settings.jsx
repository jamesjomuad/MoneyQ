import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { APPEARANCE_OPTIONS } from "../../constants/colors";
import { useAppStore } from "../../stores/appStore";
import { useRemindersStore } from "../../stores/remindersStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { CURRENCIES } from "../../utils/currency";

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const setCurrency = useSettingsStore((state) => state.setCurrency);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const storageSource = useAppStore((state) => state.storageSource);
  const isPreview = storageSource === "memory";
  const permission = useRemindersStore((state) => state.permission);
  const refreshPermission = useRemindersStore(
    (state) => state.refreshPermission,
  );
  const requestPermission = useRemindersStore(
    (state) => state.requestPermission,
  );

  useFocusEffect(
    useCallback(() => {
      loadSettings();
      refreshPermission();
    }, [loadSettings, refreshPermission]),
  );

  const supported = permission ? permission.supported !== false : true;
  const granted = Boolean(permission?.granted);
  const canAskAgain = permission?.canAskAgain !== false;

  function openDeviceSettings() {
    if (Platform.OS !== "web") Linking.openSettings();
  }

  async function handleToggleNotifications(next) {
    if (next) {
      const result = await requestPermission();
      if (result && !result.granted && result.canAskAgain === false) {
        // The OS will not show the prompt again; only settings can help now.
        Alert.alert(
          "Notifications are off",
          "Allow notifications for MoneyQ in your device settings to receive reminders.",
          [
            { text: "Open Settings", onPress: openDeviceSettings },
            { text: "Not now", style: "cancel" },
          ],
        );
      }
      return;
    }
    // Permission is the OS's to revoke, so turning this off opens settings.
    openDeviceSettings();
  }

  return (
    <Screen>
      {/* <ScreenTitle
        title="Settings"
        subtitle={isPreview ? 'Browser preview — sample data, not saved' : 'Preferences are stored on this device'}
      /> */}

      <SectionHeader title="Appearance" />
      <Card padded={false}>
        {APPEARANCE_OPTIONS.map((option, index) => {
          const isSelected = option.key === theme;

          return (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setTheme(option.key)}
              style={({ pressed }) => [
                styles.option,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth:
                    index === APPEARANCE_OPTIONS.length - 1
                      ? 0
                      : StyleSheet.hairlineWidth,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={styles.flex}>
                <Text variant="body">{option.label}</Text>
                <Text variant="caption" tone="faint">
                  {option.caption}
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
                  borderBottomWidth:
                    index === Object.values(CURRENCIES).length - 1
                      ? 0
                      : StyleSheet.hairlineWidth,
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
          onPress={() => router.push("/tags")}
          style={({ pressed }) => [
            styles.option,
            { opacity: pressed ? 0.7 : 1 },
          ]}
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

      <SectionHeader title="Notifications" />
      <Card>
        <View style={styles.notificationRow}>
          <View style={styles.flex}>
            <Text variant="body">Reminder notifications</Text>
            <Text variant="caption" tone="faint">
              {describePermission(permission)}
            </Text>
          </View>
          <Switch
            accessibilityRole="switch"
            accessibilityLabel="Reminder notifications"
            value={granted}
            disabled={!supported}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.border}
          />
        </View>

        {supported && !granted && !canAskAgain ? (
          <View style={{ marginTop: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              onPress={openDeviceSettings}
              style={({ pressed }) => [
                styles.settingsLink,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text variant="label" tone="primary">
                Open device settings
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Text variant="caption" tone="faint" style={{ marginTop: spacing.sm }}>
          Reminders you set on a transaction are always saved, even while
          notifications are off — they simply cannot fire until permission is
          granted.
        </Text>
      </Card>

      <View style={{ height: spacing.xl }} />

      <SectionHeader title="About" />
      <Card>
        <Text variant="body" tone="muted">
          {isPreview
            ? "This build runs in a browser against in-memory sample data, so nothing you do here is saved. The Android app uses the on-device SQLite database instead."
            : "MoneyQ stores everything locally on this device. It works fully offline and does not send your financial data anywhere."}
        </Text>
        <Text variant="caption" tone="faint" style={{ marginTop: spacing.sm }}>
          Copyright © 2026 James Jomuad
        </Text>
      </Card>
    </Screen>
  );
}

function describePermission(permission) {
  if (!permission) return "Checking permission…";
  if (permission.supported === false) {
    return "Not available in the browser preview — works in the Android app";
  }
  if (permission.granted)
    return "Allowed — reminders fire at their scheduled time";
  if (permission.canAskAgain === false) {
    return "Blocked — notifications are disabled for MoneyQ";
  }
  return "Off — allow notifications to receive reminders";
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  notificationRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingsLink: {
    paddingVertical: 6,
  },
  option: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
