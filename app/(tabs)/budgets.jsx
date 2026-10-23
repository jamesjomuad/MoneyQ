import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CreateFab, CREATE_FAB_SIZE } from "../../components/budgets/CreateFab";
import { FolderGroupCard } from "../../components/budgets/FolderGroupCard";
import { FolderPickerSheet } from "../../components/budgets/FolderPickerSheet";
import { PinnedFolders } from "../../components/budgets/PinnedFolders";
import { DraggableRows } from "../../components/lists/DraggableRows";
import { SelectionWrapper } from "../../components/selection/SelectionWrapper";
import { TransactionRow } from "../../components/transactions/TransactionRow";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { SwipeActionRow, closeAllSwipeActions } from "../../components/ui/SwipeActionRow";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useBudgetsStore } from "../../stores/budgetsStore";
import { useFoldersStore } from "../../stores/foldersStore";
import { useSearchStore } from "../../stores/searchStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { showToast } from "../../stores/toastStore";

// The entrance plays once per app session. The flag clears only on a JS
// reload (cold start); returning from a detail page, a tab or the background
// keeps the Budgets tab mounted, so nothing re-animates.
let budgetsIntroPlayed = false;
const INTRO_STAGGER = 55; // ms between steps; a step is one major item or card

// Bulk-move eligibility in Budgets: only ungrouped budget rows are selectable —
// folder rows never carry a child checkbox. Selection addresses budgets by
// their stable ids.
const isBudgetRow = (item) => item.kind === 'budget';
const budgetRowId = (item) => item.budget.id;

export default function BudgetsScreen() {
  const { colors, radius, spacing } = useTheme();
  const reduced = useReducedMotion();
  const budgets = useBudgetsStore((state) => state.budgets);
  const pinnedIds = useBudgetsStore((state) => state.pinnedIds);
  const isLoading = useBudgetsStore((state) => state.isLoading);
  const load = useBudgetsStore((state) => state.load);
  const togglePinned = useBudgetsStore((state) => state.togglePinned);
  const moveManyToFolder = useBudgetsStore((state) => state.moveManyToFolder);
  const archiveMany = useBudgetsStore((state) => state.archiveMany);
  const restoreMany = useBudgetsStore((state) => state.restoreMany);
  const reorderBudget = useBudgetsStore((state) => state.reorderBudget);
  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.load);
  const moveFolder = useFoldersStore((state) => state.moveFolder);
  const currency = useSettingsStore((state) => state.currency);

  const [pickerOpen, setPickerOpen] = useState(false);

  // Pull-to-refresh re-reads the same sources as focus, plus the active
  // transaction search when one is running. Only the native spinner is owned
  // here; the lists keep rendering their current rows while the reads run.
  const [refreshing, setRefreshing] = useState(false);

  // The pinned-folders strip is laid out in normal flow under the list, so the
  // floating create action measures it and anchors above it rather than over
  // the chips. The value is only read while that strip is actually on screen.
  const [stripHeight, setStripHeight] = useState(0);
  const handleStripLayout = useCallback((event) => {
    const { height } = event.nativeEvent.layout;
    setStripHeight((current) => (current === height ? current : height));
  }, []);

  // The ids whose archive can still be undone. Undo reads and clears this in
  // the same tick, so a repeated tap is a no-op rather than a second restore.
  const undoRef = useRef(null);

  // Archiving is a write, so a second confirm is swallowed until the first
  // settles — the dialog can't double-submit.
  const archivingRef = useRef(false);

  /** Undo lives here, not in the toast: after a successful archive, restore
   *  the same ids to their original folders (or the root list). */
  const undoArchive = useCallback(async () => {
    const ids = undoRef.current;
    if (!ids || ids.length === 0) return;
    undoRef.current = null;
    try {
      await restoreMany(ids);
      showToast(
        ids.length === 1 ? 'Budget restored' : `${ids.length} budgets restored`,
        'success',
      );
    } catch (error) {
      showToast(error?.message ?? 'Could not restore the budgets.', 'error');
    }
  }, [restoreMany]);

  // The Budgets-specific pieces the selection wrapper is told about: Remove
  // archives the current selection and Move opens the destination picker.
  // Confirmations, the exit and the undo snackbar stay in this screen's
  // business logic. `actions` receives the live selection so Remove knows
  // exactly which budgets to archive.
  const confirmBulkArchive = useCallback(
    (selection) => {
      const ids = [...selection.selectedIds];
      const count = ids.length;
      if (count === 0) return;
      Alert.alert(
        `Archive ${count} ${count === 1 ? 'budget' : 'budgets'}?`,
        'These budgets will be removed from your active lists. Their financial data will be preserved, and you can restore them later from Archive.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Archive',
            // Neutral, not destructive: archiving is reversible.
            style: 'default',
            onPress: async () => {
              if (archivingRef.current) return;
              archivingRef.current = true;
              try {
                await archiveMany(ids);
                selection.exitSelection();
                undoRef.current = ids;
                showToast(
                  count === 1 ? '1 budget archived' : `${count} budgets archived`,
                  'success',
                  { label: 'Undo', icon: 'undo', onPress: undoArchive },
                );
              } catch (error) {
                showToast(error?.message ?? 'Could not archive the budgets.', 'error');
              } finally {
                archivingRef.current = false;
              }
            },
          },
        ],
      );
    },
    [archiveMany, undoArchive],
  );

  // Swipe-to-delete on a budget row is the same canonical archive the budget
  // detail's "Delete budget" runs: `archiveMany` flips only `deleted_at`, so
  // the budget moves to Archive with its transactions, breakdown items, tags,
  // reminders, attachments, color and folder assignment untouched, and Restore
  // brings it back losslessly. The store reload inside `archiveMany` refreshes
  // this list and the Archive screen on the next read.
  const swipingDeleteRef = useRef(false);

  const confirmSwipeDelete = useCallback(
    (budget) => {
      Alert.alert(
        `Delete ${budget.name}?`,
        'This budget will be removed from your active lists and moved to Archive. Its financial data will be preserved, and you can restore it later from Archive.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            // Neutral, not destructive: this archives the budget (reversible).
            style: 'default',
            onPress: async () => {
              if (swipingDeleteRef.current) return;
              swipingDeleteRef.current = true;
              try {
                await archiveMany([budget.id]);
                showToast('1 budget archived', 'success');
              } catch (error) {
                showToast(
                  error?.message ?? 'Could not archive this budget.',
                  'error',
                );
              } finally {
                swipingDeleteRef.current = false;
              }
            },
          },
        ],
      );
    },
    [archiveMany],
  );

  // The single action a budget row exposes. Tone resolves to the destructive
  // theme tokens inside SwipeActionRow, matching the transaction swipe.
  const budgetActions = useCallback(
    (budget) => [
      {
        key: 'delete',
        label: 'Delete',
        icon: 'trash',
        tone: 'destructive',
        accessibilityLabel: `Delete ${budget.name}`,
        onPress: () => confirmSwipeDelete(budget),
      },
    ],
    [confirmSwipeDelete],
  );

  const selectionActions = useMemo(
    () => (selection) => [
      {
        label: 'Remove',
        icon: 'archive',
        // Secondary rather than destructive: archiving is reversible.
        variant: 'secondary',
        onPress: () => confirmBulkArchive(selection),
      },
      {
        label: 'Move',
        icon: 'folder',
        onPress: () => setPickerOpen(true),
      },
    ],
    [confirmBulkArchive],
  );

  // Drag-and-drop reordering: `liftedKey` is the row currently held by a
  // long-press drag (null while idle). The list scroll locks while it is set
  // — the sanctioned Android pattern — and edge auto-scroll drives the list
  // programmatically through scrollRef, which keeps working while locked.
  const [liftedKey, setLiftedKey] = useState(null);
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const handleScroll = useCallback((event) => {
    offsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);
  const dragScroll = useMemo(
    () => ({
      scrollTo: (y) =>
        scrollRef.current?.scrollTo({ x: 0, y: Math.max(0, y), animated: false }),
      getOffset: () => offsetRef.current,
      getViewport: (report) =>
        scrollRef.current?.measureInWindow((_x, y, _w, h) => report({ y, h })),
    }),
    [],
  );

  // Intro state: `playIntro` freezes at mount so re-renders never restart it;
  // the module flag flips once the first settled content (not the loading
  // placeholder) has rendered, so anything mounting later — a new folder,
  // search results — appears without animation.
  const [playIntro] = useState(() => !budgetsIntroPlayed && !reduced);
  useEffect(() => {
    if (playIntro && !isLoading) budgetsIntroPlayed = true;
  }, [playIntro, isLoading]);

  const introEnter = useCallback(
    (step) => {
      if (!playIntro || budgetsIntroPlayed) return undefined;
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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        load(),
        loadFolders(),
        debouncedTerm ? runSearch(debouncedTerm) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [load, loadFolders, debouncedTerm, runSearch]);

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
  // main budget list.
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
  // ungrouped budgets so nothing appears twice in Budgets.
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

  // One unified budget list: every folder, then the ungrouped budgets, each in
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

  // Mixed-list guard for drag: the unified list is folders-then-budgets, and
  // each kind persists positions only within its own scope. A dragged row
  // may therefore only land inside its own block — folders stay above the
  // divider, budgets below — so the candidate splice index gets clamped to
  // the block boundaries before the drop commits.
  const resolveMixedTarget = useCallback(
    (item, fromIndex, candidateIndex, list) => {
      const firstBudget = list.findIndex((x) => x.kind === 'budget');
      if (firstBudget === -1) return candidateIndex; // folders only
      if (item.kind === 'folder') {
        return Math.min(candidateIndex, firstBudget - 1);
      }
      return Math.max(candidateIndex, firstBudget);
    },
    [],
  );

  // The drop target is an index in the mixed list; translate it into the
  // row's index within its own kind in the FINAL ordering, which is exactly
  // what the per-scope repositories (moveFolder / reorderBudget) expect.
  const handleReorder = useCallback(
    async (item, targetIndex) => {
      const from = listItems.findIndex((x) => x.key === item.key);
      if (from === -1 || targetIndex === from) return;
      const next = [...listItems];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      try {
        if (moved.kind === 'folder') {
          const idx = next
            .filter((x) => x.kind === 'folder')
            .findIndex((x) => x.key === moved.key);
          await moveFolder(moved.folder.id, idx);
        } else {
          const idx = next
            .filter((x) => x.kind === 'budget')
            .findIndex((x) => x.key === moved.key);
          await reorderBudget(moved.budget.id, idx);
        }
      } catch (error) {
        showToast(
          error?.message ?? 'Could not reorder. Please try again.',
          'error',
        );
      }
    },
    [listItems, moveFolder, reorderBudget],
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

  return (
    <SelectionWrapper
      items={listItems}
      idOf={budgetRowId}
      isEligible={isBudgetRow}
      actions={selectionActions}
      selectLabel="Select all budgets"
      deselectLabel="Deselect all budgets"
      inlineMaster
    >
      {(sel) => {
        // One row renderer for both the unified budget list and search results,
        // so folder and budget rows stay pixel-identical in every context.
        // Search rows keep pinning but never enter bulk-move selection.
        const renderRow = (item, index, total, forSearch, lifted = false, reorder = null) => {
          const budgetCard = (
            <BudgetCard
              budget={item.budget}
              currency={currency}
              pinned={pinnedIds.includes(item.budget.id)}
              onTogglePin={togglePinned}
              selectable={sel.selectionMode && !forSearch}
              selected={!forSearch && sel.isSelected(item.budget.id)}
              onToggleSelect={sel.toggleItem}
              onPress={lifted ? undefined : openFolder}
              isLast={index === total - 1}
              reorder={forSearch ? null : reorder}
            />
          );

          return (
            <Animated.View
              key={item.key}
              entering={introEnter(2 + Math.min(index, 4))}
            >
              {item.kind === 'folder' ? (
                <FolderGroupCard
                  folder={item.folder}
                  budgetCount={folderCounts.get(item.folder.id) ?? 0}
                  isLast={index === total - 1}
                  reorder={forSearch ? null : reorder}
                  onPress={
                    lifted
                      ? undefined
                      : () =>
                          router.push({
                            pathname: "/folder/[id]",
                            params: { id: item.folder.id },
                          })
                  }
                />
              ) : forSearch ? (
                // Search hits stay plain: the swipe action belongs to the
                // budget list itself, not to every rendering of a card.
                budgetCard
              ) : (
                // Lifted rows and selection mode disable the swipe: a row in
                // the air must follow the drag, and checkbox taps must never
                // compete with a revealed action.
                <SwipeActionRow
                  rowId={`budgets-row-${item.budget.id}`}
                  actions={budgetActions(item.budget)}
                  disabled={lifted || sel.selectionMode}
                >
                  {budgetCard}
                </SwipeActionRow>
              )}
            </Animated.View>
          );
        };

        function confirmBulkMove(folderId) {
          const destination = folderId
            ? folders.find((folder) => folder.id === folderId)?.name ?? 'folder'
            : null;
          const count = sel.selectedIds.length;
          Alert.alert(
            `Move ${count} ${count === 1 ? 'budget' : 'budgets'}?`,
            destination
              ? `They will appear under "${destination}" in Budgets. Nothing else about them changes.`
              : 'They will return to the main budget list. Nothing else about them changes.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Move',
                onPress: async () => {
                  try {
                    await moveManyToFolder(sel.selectedIds, folderId);
                    sel.exitSelection();
                    showToast(
                      destination ? `Moved to ${destination}` : 'Moved to the main list',
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
            {/* The screen animates its own items, so the scroll body stays put. */}
            {/* The tab bar is in normal flow, so only the floating create
                button needs reserved clearance; the button itself carries the
                gap that keeps the last card off the pinned strip. */}
            <Screen
              topInset
              enter={false}
              // Room for the floating create button under the last row, so the
              // end of the list never hides behind it.
              bottomSpace={CREATE_FAB_SIZE + spacing.xl}
              scrollRef={scrollRef}
              onScroll={handleScroll}
              scrollEnabled={liftedKey === null}
              refreshing={refreshing}
              onRefresh={refresh}
            >
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

              {/* Compact utility actions, directly below the full-width search
                  field and above the folder/budget list: the three-state parent
                  checkbox rides the row's left edge (auto margin) while the
                  Archive button keeps the right, and the search field keeps its
                  whole width. */}
              <Animated.View
                entering={introEnter(1)}
                style={[styles.archiveRow, { marginBottom: spacing.md }]}
              >
                {!searching && sel.masterRow ? (
                  <View style={styles.masterInlineSlot}>{sel.masterRow}</View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open archive"
                  onPress={() => router.push("/archive")}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.archiveButton,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: radius.pill,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Icon name="archive" size={16} color={colors.textMuted} />
                  <Text variant="label" tone="muted">
                    Archive
                  </Text>
                </Pressable>
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
                            accessibilityLabel={`Open budget ${group.name}`}
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
                            <Icon name="chevronRight" size={14} color={colors.primaryInk} />
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
                  {/* Any touch inside the list region dismisses a stray open
                      swipe row (taps on the row itself are handled by its own
                      close overlay) — same pattern as the budget detail. */}
                  <View onTouchStart={closeAllSwipeActions}>
                    <Card padded={false} style={{ marginBottom: spacing.sm }}>
                      <DraggableRows
                        items={listItems}
                        disabled={sel.selectionMode}
                        scroll={dragScroll}
                        onLiftChange={setLiftedKey}
                        resolveTarget={resolveMixedTarget}
                        onReorder={handleReorder}
                        renderItem={(item, index, total, lifted, reorder) =>
                          renderRow(item, index, total, false, lifted, reorder)
                        }
                      />
                    </Card>
                  </View>

                  {/* The Plus action: the same create entry the old Home offered,
                      now sitting under the single unified list. */}
                  {ungrouped.length === 0 ? (
                    <View style={styles.listActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Create a new budget"
                        onPress={() => router.push("/budget/form")}
                        hitSlop={16}
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

            {sel.selectionMode && !searching ? (
              sel.toolbar
            ) : searching ? null : (
              <Animated.View entering={introEnter(7)} onLayout={handleStripLayout}>
                <PinnedFolders budgets={pinnedBudgets} onPressFolder={openFolder} />
              </Animated.View>
            )}

            {/* The one create action: floating, horizontally centered, and
                hidden while a selection is active so it can never sit on the
                move bar. It anchors above the pinned strip when that strip is
                on screen, otherwise just above the navigation bar. */}
            {sel.selectionMode ? null : (
              <CreateFab
                bottomOffset={!searching && pinnedBudgets.length > 0 ? stripHeight : 0}
              />
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
      }}
    </SelectionWrapper>
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
  archiveRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  masterInlineSlot: {
    marginRight: "auto",
  },
  archiveButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
});
