import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  // Typing debounces by a quarter second so a fast typer triggers one scan,
  // not one per keystroke; the visible results always follow `debouncedTerm`.
  const [query, setQuery] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const term = query.trim();
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const searching = debouncedTerm.length > 0;
  const txMatches = useSearchStore((state) => state.transactions);
  const searchError = useSearchStore((state) => state.error);
  const runSearch = useSearchStore((state) => state.search);
  const resetSearch = useSearchStore((state) => state.reset);

  // Budget/folder data reloads only when the tab actually gains focus.
  useFocusEffect(
    useCallback(() => {
      load();
      loadFolders();
    }, [load, loadFolders]),
  );

  // The transaction scan re-runs when focus returns or the debounced term
  // changes — never per keystroke.
  useFocusEffect(
    useCallback(() => {
      if (debouncedTerm) runSearch(debouncedTerm);
      else resetSearch();
    }, [debouncedTerm, runSearch, resetSearch]),
  );

  const openFolder = useCallback(
    (budget) =>
      router.push({
        pathname: "/budget/[id]",
        params: { id: budget.id },
      }),
    [],
  );

  // Unified search hits: folders first, then budgets, each keeping its own
  // existing store order. Rows render through the same components as the
  // main Home list.
  const matchedItems = useMemo(() => {
    if (!searching) return [];
    const needle = debouncedTerm.toLowerCase();
    const items = [];
    for (const folder of folders) {
      if (folder.name.toLowerCase().includes(needle)) {
        items.push({ kind: 'folder', key: `f_${folder.id}`, folder });
      }
    }
    for (const budget of budgets) {
      if (budget.name.toLowerCase().includes(needle)) {
        items.push({ kind: 'budget', key: `b_${budget.id}`, budget });
      }
    }
    return items;
  }, [budgets, debouncedTerm, folders, searching]);

  // Transaction matches arrive newest-first across all folders; group them
  // under their folder so it's clear where each one lives. Group order follows
  // each folder's most recent match.
  const txGroups = useMemo(() => {
    const groups = [];
    const groupIndex = new Map();
    for (const transaction of txMatches) {
      let index = groupIndex.get(transaction.budget_id);
      if (index === undefined) {
        index = groups.length;
        groupIndex.set(transaction.budget_id, index);
        groups.push({
          budgetId: transaction.budget_id,
          name: transaction.budget_name ?? 'Budget',
          items: [],
        });
      }
      groups[index].items.push(transaction);
    }
    return groups;
  }, [txMatches]);

  // Pinned order follows the stored insertion order, not the folder list order.
  const pinnedBudgets = useMemo(() => {
    const byId = new Map(budgets.map((budget) => [budget.id, budget]));
    return pinnedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [budgets, pinnedIds]);

  // Folder cards show how many budgets live inside; the main list keeps only
  // ungrouped budgets so nothing appears twice on Home.
  const { folderCounts, ungrouped } = useMemo(() => {
    const counts = new Map();
    const ungroupedBudgets = [];
    for (const budget of budgets) {
      if (budget.folder_id) {
        counts.set(budget.folder_id, (counts.get(budget.folder_id) ?? 0) + 1);
      } else {
        ungroupedBudgets.push(budget);
      }
    }
    return { folderCounts: counts, ungrouped: ungroupedBudgets };
  }, [budgets]);

  // One unified Home list: every folder, then the ungrouped budgets, each in
  // its existing store order. This is presentation only — no re-sorting, no
  // grouping headers, and grouped budgets still live only inside their folder.
  const listItems = useMemo(() => {
    const items = [];
    for (const folder of folders) {
      items.push({ kind: 'folder', key: `f_${folder.id}`, folder });
    }
    for (const budget of ungrouped) {
      items.push({ kind: 'budget', key: `b_${budget.id}`, budget });
    }
    return items;
  }, [folders, ungrouped]);

  const toggleSelected = useCallback((budget) => {
    setSelectedIds((current) =>
      current.includes(budget.id)
        ? current.filter((id) => id !== budget.id)
        : [...current, budget.id],
    );
  }, []);

  const startSelect = useCallback((budget) => setSelectedIds([budget.id]), []);

  // One press handler for every card: its behavior only changes when the
  // screen flips in or out of selection mode, not per keystroke or per card.
  const handlePressBudget = useCallback(
    (budget) => {
      if (selecting) toggleSelected(budget);
      else openFolder(budget);
    },
    [selecting, toggleSelected, openFolder],
  );

  const handleEditTransaction = useCallback((entry) => {
    router.push({
      pathname: "/transaction/form",
      params: {
        budgetId: entry.budget_id,
        transactionId: entry.id,
      },
    });
  }, []);

  // One row renderer for both the unified Home list and search results, so
  // folder and budget rows stay pixel-identical in every context. Search
  // rows keep pinning but never enter bulk-move selection.
  const renderRow = (item, index, total, forSearch) => (
    <Animated.View
      key={item.key}
      entering={introEnter(2 + Math.min(index, 4))}
    >
      {item.kind === 'folder' ? (
        <FolderGroupCard
          folder={item.folder}
          budgetCount={folderCounts.get(item.folder.id) ?? 0}
          isLast={index === total - 1}
          onPress={() =>
            router.push({
              pathname: "/folder/[id]",
              params: { id: item.folder.id },
            })
          }
        />
      ) : (
        <BudgetCard
          budget={item.budget}
          currency={currency}
          pinned={selecting && !forSearch ? false : pinnedIds.includes(item.budget.id)}
          onTogglePin={selecting && !forSearch ? undefined : togglePinned}
          selected={!forSearch && selectedIds.includes(item.budget.id)}
          onLongPress={forSearch || selecting ? undefined : startSelect}
          onPress={forSearch ? openFolder : handlePressBudget}
          isLast={index === total - 1}
        />
      )}
    </Animated.View>
  );

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
            {matchedItems.length > 0 ? (
              <>
                <SectionHeader
                  title={`Folders & Budgets · ${matchedItems.length}`}
                  fontSize={14}
                />
                <Card padded={false} style={{ marginBottom: spacing.lg }}>
                  {matchedItems.map((item, index) =>
                    renderRow(item, index, matchedItems.length, true)
                  )}
                </Card>
              </>
            ) : null}

            {txMatches.length > 0 ? (
              <View style={matchedItems.length > 0 ? styles.txSection : null}>
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
                          onEdit={handleEditTransaction}
                        />
                      ))}
                    </Card>
                  </View>
                ))}
              </View>
            ) : null}

            {matchedItems.length === 0 && txMatches.length === 0 ? (
              <EmptyState
                icon="search"
                title="No results found"
                description={`Nothing matches "${debouncedTerm}". Try a different folder name, transaction description, or tag.`}
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
            <Card padded={false} style={{ marginBottom: spacing.sm }}>
              {listItems.map((item, index) =>
                renderRow(item, index, listItems.length, false)
              )}
            </Card>

            {/* The Plus action: same create entry Home offered before,
                now sitting under the single unified list. */}
            {ungrouped.length === 0 ? (
              <View style={styles.listActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create a new budget"
                  onPress={() => router.push("/budget/form")}
                  hitSlop={8}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text variant="label" tone="primary">
                    + New budget
                  </Text>
                </Pressable>
              </View>
            ) : null}
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
  listActions: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
    marginTop: 4,
    paddingHorizontal: 4,
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
