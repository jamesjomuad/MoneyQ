import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { BudgetCard } from "../../components/budgets/BudgetCard";
import { FolderGroupCard } from "../../components/budgets/FolderGroupCard";
import { FolderPickerSheet } from "../../components/budgets/FolderPickerSheet";
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
import { useFoldersStore } from "../../stores/foldersStore";
import { useSearchStore } from "../../stores/searchStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { showToast } from "../../stores/toastStore";

// The entrance plays once per app session. The flag clears only on a JS
// reload (cold start); returning from a detail page, a tab or the background
// keeps Home mounted, so nothing re-animates.
let homeIntroPlayed = false;
const INTRO_STAGGER = 55; // ms between steps; a step is one major item or card

export default function HomeScreen() {
  const { colors, radius, spacing } = useTheme();
  const reduced = useReducedMotion();
  const budgets = useBudgetsStore((state) => state.budgets);
  const pinnedIds = useBudgetsStore((state) => state.pinnedIds);
  const isLoading = useBudgetsStore((state) => state.isLoading);
  const load = useBudgetsStore((state) => state.load);
  const togglePinned = useBudgetsStore((state) => state.togglePinned);
  const moveManyToFolder = useBudgetsStore((state) => state.moveManyToFolder);
  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.load);
  const currency = useSettingsStore((state) => state.currency);

  // Bulk move: a long press picks up the first budget, taps then add or
  // remove; the bottom bar shows the count and opens the destination sheet.
  const [selectedIds, setSelectedIds] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selecting = selectedIds.length > 0;

  // Intro state: `playIntro` freezes at mount so re-renders never restart it;
  // the module flag flips once the first settled content (not the loading
  // placeholder) has rendered, so anything mounting later — a new folder,
  // search results — appears without animation.
  const [playIntro] = useState(() => !homeIntroPlayed && !reduced);
  useEffect(() => {
    if (playIntro && !isLoading) homeIntroPlayed = true;
  }, [playIntro, isLoading]);

  const introEnter = useCallback(
    (step) => {
      if (!playIntro || homeIntroPlayed) return undefined;
      return FadeInDown.duration(300)
        .delay(step * INTRO_STAGGER)
        .withInitialValues({ transform: [{ translateY: 16 }] });
    },
    [playIntro]
  );

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
      loadFolders();
      if (searching) runSearch(term);
      else resetSearch();
    }, [load, loadFolders, searching, term, runSearch, resetSearch]),
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

  // Folder cards show how many budgets live inside; the main list keeps only
  // ungrouped budgets so nothing appears twice on Home.
  const folderCounts = new Map();
  for (const budget of budgets) {
    if (!budget.folder_id) continue;
    folderCounts.set(budget.folder_id, (folderCounts.get(budget.folder_id) ?? 0) + 1);
  }
  const ungrouped = budgets.filter((budget) => !budget.folder_id);

  function toggleSelected(budgetId) {
    setSelectedIds((current) =>
      current.includes(budgetId)
        ? current.filter((id) => id !== budgetId)
        : [...current, budgetId],
    );
  }

  function confirmBulkMove(folderId) {
    const destination = folderId
      ? folders.find((folder) => folder.id === folderId)?.name ?? 'folder'
      : null;
    const count = selectedIds.length;
    Alert.alert(
      `Move ${count} ${count === 1 ? 'budget' : 'budgets'}?`,
      destination
        ? `They will appear under "${destination}" on Home. Nothing else about them changes.`
        : 'They will return to the main Home list. Nothing else about them changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: async () => {
            try {
              await moveManyToFolder(selectedIds, folderId);
              setSelectedIds([]);
              showToast(
                destination ? `Moved to ${destination}` : 'Moved to Home',
                'success',
              );
            } catch (error) {
              showToast(error?.message ?? 'Could not move the budgets.', 'error');
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.fill}>
      {/* Home animates its own items, so the scroll body stays put. */}
      {/* The tab bar is in normal flow, so no large reserved clearance is
          needed; a modest gap keeps the last card off the pinned strip. */}
      <Screen topInset enter={false}>
        {budgets.length > 0 && !searching ? (
          <Animated.View entering={introEnter(1)}>
            <SectionHeader title={`Your Budgets · ${budgets.length}`} />
          </Animated.View>
        ) : null}

        <Animated.View
          entering={introEnter(0)}
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              // Matches the app's pill-shaped fields.
              borderRadius: 50,
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
                  borderRadius: radius.sm,
                  opacity: pressed ? 0.55 : 1,
                },
              ]}
            >
              <Icon name="close" size={15} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </Animated.View>

        {isLoading && budgets.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
              Loading budgets…
            </Text>
          </View>
        ) : budgets.length === 0 && folders.length === 0 && !searching ? (
          <EmptyState
            icon="folder"
            title="No budgets yet"
            description="A budget is a period you name, such as October 2026. Transactions you add inside it are what make up your spending."
          >
            <View style={{ alignItems: "center", gap: spacing.sm, width: "100%" }}>
              <Button
                label="Create your first budget"
                icon="add"
                onPress={() => router.push("/budget/form")}
              />
              <Button
                label="New folder"
                icon="folder"
                variant="secondary"
                onPress={() => router.push("/folder/form")}
              />
            </View>
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
                          isFirst={index === 0}
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
                <Button label="Clear search" icon="close" onPress={() => setQuery("")} />
              </EmptyState>
            ) : null}

            {searchError ? (
              <Text variant="caption" tone="expense" style={styles.searchNote}>
                Search could not finish. Check the data and try again.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {folders.length > 0 ? (
              <>
                <SectionHeader
                  title={`Budget folders · ${folders.length}`}
                  fontSize={14}
                  action={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Create a new budget folder"
                      onPress={() => router.push("/folder/form")}
                      hitSlop={8}
                    >
                      <Text variant="label" tone="primary">
                        New folder
                      </Text>
                    </Pressable>
                  }
                />
                {folders.map((folder, index) => (
                  <Animated.View
                    key={folder.id}
                    entering={introEnter(2 + Math.min(index, 4))}
                  >
                    <FolderGroupCard
                      folder={folder}
                      budgetCount={folderCounts.get(folder.id) ?? 0}
                      onPress={() =>
                        router.push({
                          pathname: "/folder/[id]",
                          params: { id: folder.id },
                        })
                      }
                    />
                  </Animated.View>
                ))}
                {ungrouped.length > 0 ? (
                  <SectionHeader title={`Ungrouped · ${ungrouped.length}`} fontSize={14} />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create a new budget"
                    onPress={() => router.push("/budget/form")}
                    hitSlop={8}
                    style={{ marginBottom: spacing.lg, marginTop: spacing.sm }}
                  >
                    <Text variant="label" tone="primary">
                      + New budget
                    </Text>
                  </Pressable>
                )}
              </>
            ) : (
              // No folders yet: keep the entry point visible above the budget
              // list so the first folder can be created from Home.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a new budget folder"
                onPress={() => router.push("/folder/form")}
                hitSlop={8}
                style={{ marginBottom: spacing.sm }}
              >
                <Text variant="label" tone="primary">
                  + New folder
                </Text>
              </Pressable>
            )}

            {ungrouped.map((budget, index) => (
              <Animated.View
                key={budget.id}
                entering={introEnter(2 + Math.min(index, 4))}
              >
                <BudgetCard
                  budget={budget}
                  currency={currency}
                  pinned={selecting ? false : pinnedIds.includes(budget.id)}
                  onTogglePin={selecting ? undefined : () => togglePinned(budget.id)}
                  selected={selectedIds.includes(budget.id)}
                  onLongPress={
                    selecting ? undefined : () => setSelectedIds([budget.id])
                  }
                  onPress={selecting ? () => toggleSelected(budget.id) : () => openFolder(budget)}
                />
              </Animated.View>
            ))}
          </>
        )}
      </Screen>

      {selecting && !searching ? (
        <View
          style={[
            styles.selectionBar,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              gap: spacing.sm,
              paddingBottom: Math.max(spacing.md, 4),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
            onPress={() => setSelectedIds([])}
            hitSlop={8}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text variant="label" tone="muted">
              Cancel
            </Text>
          </Pressable>
          <Text variant="body" tone="muted" style={styles.selectionCount}>
            {selectedIds.length} selected
          </Text>
          <Button
            label={`Move ${selectedIds.length} to…`}
            icon="folder"
            onPress={() => setPickerOpen(true)}
            style={styles.moveButton}
          />
        </View>
      ) : searching ? null : (
        <Animated.View entering={introEnter(7)}>
          <PinnedFolders budgets={pinnedBudgets} onPressFolder={openFolder} />
        </Animated.View>
      )}

      {pickerOpen ? (
        <FolderPickerSheet
          folders={folders}
          onPick={(folderId) => confirmBulkMove(folderId)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
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
    fontFamily: 'Manrope_400Regular',
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
  selectionBar: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
  },
  selectionCount: {
    flex: 1,
    textAlign: "right",
  },
  moveButton: {
    marginLeft: 8,
  },
});
