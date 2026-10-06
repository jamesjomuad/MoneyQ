import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { Text } from '../components/ui/Text';
import { ThemeProvider, useTheme } from '../components/ui/ThemeProvider';
import { getSchemaVersion } from '../database/database';
import { useAppStore } from '../stores/appStore';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const databaseStatus = useAppStore((state) => state.databaseStatus);

  useEffect(() => {
    if (databaseStatus === 'ready' || databaseStatus === 'error') {
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
 * SQLite is opened and migrated before any screen renders, so no screen ever
 * has to handle a half-initialised database.
 */
function DatabaseGate({ children }) {
  const databaseStatus = useAppStore((state) => state.databaseStatus);
  const databaseError = useAppStore((state) => state.databaseError);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function initialise() {
      try {
        const schemaVersion = await getSchemaVersion();
        if (!cancelled) useAppStore.getState().setDatabaseReady(schemaVersion);
      } catch (error) {
        if (!cancelled) useAppStore.getState().setDatabaseError(error);
      }
    }

    initialise();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (databaseStatus === 'error') {
    return (
      <DatabaseErrorView
        message={databaseError?.message}
        onRetry={() => {
          useAppStore.setState({ databaseStatus: 'idle', databaseError: null });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  if (databaseStatus !== 'ready') return <LoadingView />;

  return children;
}

function NavigationShell() {
  const { scheme } = useTheme();
  const navigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
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
  const { colors, spacing } = useTheme();

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
      <Button label="Try again" onPress={onRetry} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  errorContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});