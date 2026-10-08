import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BudgetCard } from "../../components/budgets/BudgetCard";
import { PinnedFolders } from "../../components/budgets/PinnedFolders";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Fab } from "../../components/ui/Fab";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useBudgetsStore } from "../../stores/budgetsStore";
import { useSettingsStore } from "../../stores/settingsStore";

export default function HomeScreen() {
  const { colors, spacing } = useTheme();
  const budgets = useBudgetsStore((state) => state.budgets);
  const pinnedIds = useBudgetsStore((state) => state.pinnedIds);
  const isLoading = useBudgetsStore((state) => state.isLoading);
  const load = useBudgetsStore((state) => state.load);
  const togglePinned = useBudgetsStore((state) => state.togglePinned);
  const currency = useSettingsStore((state) => state.currency);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openFolder = useCallback(
    (budget) =>
      router.push({
        pathname: "/budget/[id]",
        params: { id: budget.id },
      }),
    [],
  );

  // Pinned order follows the stored insertion order, not the folder list order.
  const pinnedBudgets = pinnedIds
    .map((id) => budgets.find((budget) => budget.id === id))
    .filter(Boolean);

  return (
    <View style={styles.fill}>
      <Screen contentContainerStyle={{ paddingBottom: 96 }}>
        {/* <ScreenTitle title="Home" subtitle="Budgets are folders that hold your transactions" /> */}

        {budgets.length > 0 ? (
          <SectionHeader title={`Your Budgets · ${budgets.length}`} />
        ) : null}

        {isLoading && budgets.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
              Loading budgets…
            </Text>
          </View>
        ) : budgets.length === 0 ? (
          <EmptyState
            icon="folder"
            title="No budgets yet"
            description="A budget is a period you name, such as October 2026. Transactions you add inside it are what make up your spending."
          >
            <Button
              label="Create your first budget"
              onPress={() => router.push("/budget/form")}
            />
          </EmptyState>
        ) : (
          budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              currency={currency}
              pinned={pinnedIds.includes(budget.id)}
              onTogglePin={() => togglePinned(budget.id)}
              onPress={() => openFolder(budget)}
            />
          ))
        )}
      </Screen>

      <PinnedFolders budgets={pinnedBudgets} onPressFolder={openFolder} />

      <Fab
        onPress={() => router.push("/budget/form")}
        accessibilityLabel="Create budget"
        bottomOffset={pinnedBudgets.length > 0 ? 64 : 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { alignItems: "center", paddingVertical: 48 },
});
