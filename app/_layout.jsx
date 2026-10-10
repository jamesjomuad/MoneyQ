import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  Stack,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { ThemeProvider, useTheme } from "../components/ui/ThemeProvider";
import { ToastView } from "../components/ui/ToastView";
import { NotificationTapHandler } from "../components/notifications/NotificationTapHandler";
import { initStorage } from "../storage/adapters/adapter";
import { useAppStore } from "../stores/appStore";
import { useRemindersStore } from "../stores/remindersStore";
import { useSettingsStore } from "../stores/settingsStore";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const databaseStatus = useAppStore((state) => state.databaseStatus);

  useEffect(() => {
    if (databaseStatus === "ready" || databaseStatus === "error") {
      SplashScreen.hideAsync();
    }
  }, [databaseStatus]);

  return (
    <ThemeProvider>
      <DatabaseGate>
        <NavigationShell />
      </DatabaseGate>
    </ThemeProvider>
  );
}

/**
 * MoneyQ
 *
 * Copyright © 2026 James Jomuad
 * The storage engine is initialised before any screen renders, so no screen
 * ever has to handle a half-initialised database. On native that opens and
 * migrates SQLite; on web it swaps in the in-memory adapter.
 */
function DatabaseGate({ children }) {
  const databaseStatus = useAppStore((state) => state.databaseStatus);
  const databaseError = useAppStore((state) => state.databaseError);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function initialise() {
      try {
        const { source, schemaVersion } = await initStorage();
        if (!cancelled)
          useAppStore.getState().setDatabaseReady(schemaVersion, source);
      } catch (error) {
        if (!cancelled) useAppStore.getState().setDatabaseError(error);
      }
    }

    initialise();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (databaseStatus === "error") {
    return (
      <DatabaseErrorView
        message={databaseError?.message}
        onRetry={() => {
          useAppStore.setState({
            databaseStatus: "idle",
            databaseError: null,
            storageSource: null,
          });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  if (databaseStatus !== "ready") return <LoadingView />;

  return children;
}

function NavigationShell() {
  const { scheme, colors } = useTheme();
  const baseNavigationTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  // This shell only mounts once storage is ready: load persisted preferences
  // (currency, appearance) and reconcile reminders against the rows. Once per
  // launch — an edit, a payment or a delete does its own cancel/schedule.
  useEffect(() => {
    useSettingsStore.getState().loadSettings();
    useRemindersStore.getState().resyncOnLaunch();
  }, []);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <NotificationTapHandler />
      <Stack
        screenOptions={{
          // Native push/pop slide. iOS animates this by default; Android
          // native-stack only fades, so the slide is set explicitly for
          // both platforms. Back plays the same motion in reverse.
          animation: 'slide_from_right',
          // Paint the screen container with the theme background so an
          // animating screen never exposes the default white behind it.
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/* The tab bar is the launch surface: no entry animation here. */}
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false, animation: 'none' }}
        />
        <Stack.Screen
          name="budget/[id]"
          options={{ headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="budget/form"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            title: "Budget",
          }}
        />
        <Stack.Screen
          name="transaction/form"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            title: "Add Transaction",
          }}
        />
        <Stack.Screen
          name="tags"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            title: "Tags",
          }}
        />
      </Stack>
      {/* Mounted above the navigator so a save toast survives the screen
          closing: auto-save fires from beforeRemove, then the screen unmounts. */}
      <ToastView />
    </NavigationThemeProvider>
  );
}

function LoadingView() {
  const { colors } = useTheme();

  return (
    <View style={[styles.centered, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text variant="body" tone="muted" style={{ marginTop: 12 }}>
        Preparing your budgets…
      </Text>
    </View>
  );
}

function DatabaseErrorView({ message, onRetry }) {
  const { spacing } = useTheme();

  return (
    <Screen contentContainerStyle={styles.errorContent}>
      <Text variant="title">Could not open local storage</Text>
      <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
        MoneyQ keeps all of your data on this device, so it cannot start until
        local storage is available.
      </Text>
      {message ? (
        <Text variant="caption" tone="faint" style={{ marginTop: spacing.sm }}>
          {message}
        </Text>
      ) : null}
      <Button
        label="Try again"
        onPress={onRetry}
        style={{ marginTop: spacing.lg }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  errorContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
});
