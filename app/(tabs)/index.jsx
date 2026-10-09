import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { BudgetCard } from "../../components/budgets/BudgetCard";
import { PinnedFolders } from "../../components/budgets/PinnedFolders";
import { TransactionRow } from "../../components/transactions/TransactionRow";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useBudgetsStore } from "../../stores/budgetsStore";
import { useSearchStore } from "../../stores/searchStore";
import { useSettingsStore } from "../../stores/settingsStore";

export default function HomeScreen() {
  const { colors, radius, spacing } = useTheme();
  const budgets = useBudgetsStore((state) => state.budgets);
  const pinnedIds = useBudgetsStore((state) => state.pinnedIds);
  const isLoading = useBudgetsStore((state) => state.isLoading);
  const load = useBudgetsStore((state) => state.load);
  const togglePinned = useBudgetsStore((state) => state.togglePinned);
  const currency = useSettingsStore((state) => state.currency);

  // Local search over the data the app already owns: folders are filtered
  // from the loaded budgets here, transactions through the search store.
  const [query, setQuery] = useState("");
  const term = query.trim();
  const searching = term.length > 0;
  const txMatches = useSearchStore((state) => state.transactions);
  const searchError = useSearchStore((state) => state.error);
  const runSearch = useSearchStore((state) => state.search);
  const resetSearch = useSearchStore((state) => state.reset);

  // One entry point for (re)loading: identity changes when the user types, so
  // results refresh live while focused and again when returning to the tab.
  useFocusEffect(
    useCallback(() => {
      load();
      if (searching) runSearch(term);
      else resetSearch();
    }, [load, searching, term, runSearch, resetSearch]),
  );

  const openFolder = useCallback(
    (budget) =>
      router.push({
        pathname: "/budget/[id]",
        params: { id: budget.id },
      }),
    [],
  );

  const matchedFolders = searching
    ? budgets.filter((budget) => budget.name.toLowerCase().includes(term.toLowerCase()))
    : [];

  // Transaction matches arrive newest-first across all folders; group them
  // under their folder so it's clear where each one lives. Group order follows
  // each folder's most recent match.
  const txGroups = [];
  const groupIndex = new Map();
  for (const transaction of txMatches) {
    let index = groupIndex.get(transaction.budget_id);
    if (index === undefined) {
      index = txGroups.length;
      groupIndex.set(transaction.budget_id, index);
      txGroups.push({
        budgetId: transaction.budget_id,
        name: transaction.budget_name ?? 'Budget',
        items: [],
      });
    }
    txGroups[index].items.push(transaction);
  }

  // Pinned order follows the stored insertion order, not the folder list order.
  const pinnedBudgets = pinnedIds
    .map((id) => budgets.find((budget) => budget.id === id))
    .filter(Boolean);

  return (
    <View style={styles.fill}>
      <Screen topInset contentContainerStyle={{ paddingBottom: 96 }}>
        {budgets.length > 0 && !searching ? (
          <SectionHeader title={`Your Budgets · ${budgets.length}`} />
        ) : null}

        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              borderRadius: radius.pill,
              marginBottom: spacing.md,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <Icon name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search folders and transactions..."
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            accessibilityLabel="Search folders and transactions"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={[
              styles.searchInput,
              {
                color: colors.text,
                marginLeft: spacing.sm,
                marginRight: term.length > 0 ? 0 : spacing.xs,
              },
            ]}
          />
          {term.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery("")}
              hitSlop={8}
              style={({ pressed }) => [
                styles.clearButton,
                {
                  borderRadius: radius.pill,
                  opacity: pressed ? 0.55 : 1,
                },
              ]}
            >
              <Icon name="close" size={15} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {isLoading && budgets.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
              Loading budgets…
            </Text>
          </View>
        ) : budgets.length === 0 && !searching ? (
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
        ) : searching ? (
          <>
            {matchedFolders.length > 0 ? (
              <>
                <SectionHeader title={`Folders · ${matchedFolders.length}`} fontSize={14} />
                {matchedFolders.map((budget) => (
                  <BudgetCard
                    key={budget.id}
                    budget={budget}
                    currency={currency}
                    pinned={pinnedIds.includes(budget.id)}
                    onTogglePin={() => togglePinned(budget.id)}
                    onPress={() => openFolder(budget)}
                  />
                ))}
              </>
            ) : null}

            {txMatches.length > 0 ? (
              <View style={matchedFolders.length > 0 ? styles.txSection : null}>
                <SectionHeader
                  title={`Transactions · ${txMatches.length}`}
                  fontSize={14}
                />
                {txGroups.map((group, groupIdx) => (
                  <View
                    key={group.budgetId}
                    style={groupIdx > 0 ? styles.txGroup : null}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open folder ${group.name}`}
                      onPress={() =>
                        router.push({
                          pathname: "/budget/[id]",
                          params: { id: group.budgetId },
                        })
                      }
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.folderHeader,
                        {
                          gap: spacing.sm,
                          opacity: pressed ? 0.6 : 1,
                          paddingVertical: spacing.sm,
                        },
                      ]}
                    >
                      <Text variant="label" tone="primary" numberOfLines={1}>
                        {group.name.toUpperCase()} · {group.items.length}
                      </Text>
                      <Icon name="chevronRight" size={14} color={colors.primary} />
                    </Pressable>
                    <Card padded={false}>
                      {group.items.map((transaction, index) => (
                        <TransactionRow
                          key={transaction.id}
                          transaction={transaction}
                          tag={transaction.tag}
                          currency={currency}
                          isLast={index === group.items.length - 1}
                          onEdit={(entry) =>
                            router.push({
                              pathname: "/transaction/form",
                              params: {
                                budgetId: transaction.budget_id,
                                transactionId: entry.id,
                              },
                            })
                          }
                        />
                      ))}
                    </Card>
                  </View>
                ))}
              </View>
            ) : null}

            {matchedFolders.length === 0 && txMatches.length === 0 ? (
              <EmptyState
                icon="search"
                title="No results found"
                description={`Nothing matches "${term}". Try a different folder name, transaction description, or tag.`}
              >
                <Button label="Clear search" onPress={() => setQuery("")} />
              </EmptyState>
            ) : null}

            {searchError ? (
              <Text variant="caption" tone="expense" style={styles.searchNote}>
                Search could not finish. Check the data and try again.
              </Text>
            ) : null}
          </>
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

      {searching ? null : (
        <PinnedFolders budgets={pinnedBudgets} onPressFolder={openFolder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { alignItems: "center", paddingVertical: 48 },
  searchBar: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderStyle: "solid",
    flexDirection: "row",
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingVertical: 10,
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  txSection: {
    marginTop: 8,
  },
  txGroup: {
    marginTop: 8,
  },
  folderHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  searchNote: {
    marginTop: 8,
    textAlign: "center",
  },
});
