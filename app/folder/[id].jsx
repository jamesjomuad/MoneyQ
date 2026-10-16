import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BudgetCard } from '../../components/budgets/BudgetCard';
import { FolderPickerSheet } from '../../components/budgets/FolderPickerSheet';
import { DraggableRows } from '../../components/lists/DraggableRows';
import { SelectionWrapper } from '../../components/selection/SelectionWrapper';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FAB_SIZE, Fab } from '../../components/ui/Fab';
import { Icon } from '../../components/ui/Icon';
import { Screen, SectionHeader } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { resolveFolderPalette } from '../../utils/colors';
import { useBudgetsStore } from '../../stores/budgetsStore';
import { useFoldersStore } from '../../stores/foldersStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { showToast } from '../../stores/toastStore';

/**
 * One budget folder's contents: only the budgets assigned to it. The folder
 * itself holds no money — this screen re-shows ordinary BudgetCards, so every
 * figure still belongs to a budget, never to the folder.
 */
export default function FolderDetailScreen() {
  const { id: routeFolderId } = useLocalSearchParams();
  const folderId =
    typeof routeFolderId === 'string'
      ? routeFolderId
      : Array.isArray(routeFolderId)
        ? routeFolderId[0] ?? ''
        : '';

  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);

  const budgets = useBudgetsStore((state) => state.budgets);
  const loadBudgets = useBudgetsStore((state) => state.load);
  const togglePinned = useBudgetsStore((state) => state.togglePinned);
  const pinnedIds = useBudgetsStore((state) => state.pinnedIds);
  const reorderBudget = useBudgetsStore((state) => state.reorderBudget);
  const moveManyToFolder = useBudgetsStore((state) => state.moveManyToFolder);
  const archiveMany = useBudgetsStore((state) => state.archiveMany);
  const restoreMany = useBudgetsStore((state) => state.restoreMany);

  const folders = useFoldersStore((state) => state.folders);
  const isLoadingFolders = useFoldersStore((state) => state.isLoading);
  const loadFolders = useFoldersStore((state) => state.load);
  const removeFolder = useFoldersStore((state) => state.removeFolder);

  useFocusEffect(
    useCallback(() => {
      loadFolders();
      loadBudgets();
    }, [loadFolders, loadBudgets]),
  );

  const folder = folders.find((entry) => entry.id === folderId) ?? null;
  const folderBudgets = budgets.filter((budget) => budget.folder_id === folderId);

  // Bulk move out of (or across) this folder: the reusable selection system
  // owns the three-state parent checkbox and the picked ids; this screen only
  // supplies the list, its actions, and the actual move. Every row here is a
  // budget, so all rows are eligible by default.
  const [pickerOpen, setPickerOpen] = useState(false);

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

  // Archiving from inside a folder follows Home's contract: the selection
  // system supplies the ids, the store performs the soft delete, and the
  // budgets land on the Archive screen with all their data intact. The same
  // snackbar Undo returns them to this folder.
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
    [confirmBulkArchive, setPickerOpen],
  );

  // Drag-and-drop reordering (same contract as Home): lock the scroll while a
  // row is lifted and drive edge auto-scroll programmatically through
  // scrollRef. This list IS the budget's scope, so the drop index goes
  // straight to the repository — no per-kind translation needed.
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
  const dragItems = useMemo(
    () => folderBudgets.map((budget) => ({ budget, key: `b_${budget.id}` })),
    [folderBudgets],
  );
  const handleReorder = useCallback(
    async (item, targetIndex) => {
      try {
        await reorderBudget(item.budget.id, targetIndex);
      } catch (error) {
        showToast(
          error?.message ?? 'Could not reorder. Please try again.',
          'error',
        );
      }
    },
    [reorderBudget],
  );

  // One stable press handler for every card so memoized cards can skip
  // re-renders; BudgetCard passes the budget it was given.
  const openBudget = useCallback(
    (budget) =>
      router.push({ pathname: '/budget/[id]', params: { id: budget.id } }),
    [],
  );

  if (isLoadingFolders && !folder) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Folder…' }} />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!folder) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Folder not found' }} />
        <EmptyState
          icon="folder"
          title="Folder not found"
          description="This budget folder may have been deleted. Its budgets, if there were any, are in the Archive."
        >
          <Button label="Back to Home" icon="home" onPress={() => router.replace('/')} />
        </EmptyState>
      </View>
    );
  }

  const palette = resolveFolderPalette(folder.color, colors);

  // One creation path for every entry point (FAB, header action, empty state):
  // the shared budget form with this folder preselected, so the new budget
  // lands here and persists via the existing folder_id relationship.
  function openCreateBudget() {
    router.push({ pathname: '/budget/form', params: { folderId: folder.id } });
  }

  function confirmDeleteFolder() {
    const count = folderBudgets.length;
    Alert.alert(
      `Delete "${folder.name}"?`,
      count > 0
        ? `The ${count} ${count === 1 ? 'budget' : 'budgets'} inside are archived, not deleted — they move to the Archive with every transaction, tag and reminder intact, and can be restored later.`
        : 'This folder is empty. Deleting it changes nothing else.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFolder(folder.id);
              router.back();
            } catch (error) {
              Alert.alert('Could not delete the folder', error?.message ?? 'Please try again.');
            }
          },
        },
      ],
    );
  }

  return (
    <SelectionWrapper
      items={folderBudgets}
      actions={selectionActions}
      selectLabel="Select all budgets"
      deselectLabel="Deselect all budgets"
    >
      {(sel) => {
        function confirmBulkMove(targetFolderId) {
          const destination = targetFolderId
            ? folders.find((entry) => entry.id === targetFolderId)?.name ?? 'folder'
            : null;
          const count = sel.selectedIds.length;
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
                    await moveManyToFolder(sel.selectedIds, targetFolderId);
                    sel.exitSelection();
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
          <GestureHandlerRootView style={styles.fill}>
            <Stack.Screen
              options={{
                title: folder.name,
                headerRight: () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Folder options"
                    onPress={() =>
                      Alert.alert(folder.name, null, [
                        {
                          text: 'Edit folder',
                          onPress: () =>
                            router.push({ pathname: '/folder/form', params: { id: folder.id } }),
                        },
                        { text: 'Delete folder', style: 'destructive', onPress: confirmDeleteFolder },
                        { text: 'Cancel', style: 'cancel' },
                      ])
                    }
                    hitSlop={10}
                  >
                    <Icon name="more" size={20} color={colors.text} />
                  </Pressable>
                ),
              }}
            />

            <Screen
              topInset={false}
              bottomSpace={FAB_SIZE + spacing.xl}
              scrollRef={scrollRef}
              onScroll={handleScroll}
              scrollEnabled={liftedKey === null}
            >
              <View style={[styles.metaRow, { gap: spacing.sm }]}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: palette.folder, borderColor: palette.folderBorder },
                  ]}
                />
                <Text variant="body" tone="muted">
                  {folderBudgets.length} {folderBudgets.length === 1 ? 'budget' : 'budgets'} · folders
                  organize budgets only — no totals live here.
                </Text>
              </View>

              {folderBudgets.length === 0 ? (
                <EmptyState
                  icon="folder"
                  title="No budgets in this folder yet"
                  description="Create a new budget here, or move an existing one in from Home using the checkboxes."
                >
                  <Button
                    label="New budget in this folder"
                    icon="add"
                    onPress={openCreateBudget}
                  />
                </EmptyState>
              ) : (
                <>
                  <SectionHeader
                    title={`Budgets · ${folderBudgets.length}`}
                    fontSize={14}
                    action={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Create a new budget in this folder"
                        onPress={openCreateBudget}
                        hitSlop={8}
                      >
                        <Text variant="label" tone="primary">
                          New budget
                        </Text>
                      </Pressable>
                    }
                  />
                  <Card padded={false}>
                    {sel.masterRow}
                    <DraggableRows
                      items={dragItems}
                      disabled={sel.selectionMode}
                      scroll={dragScroll}
                      onLiftChange={setLiftedKey}
                      onReorder={handleReorder}
                      renderItem={(item, index, total, lifted) => (
                        <BudgetCard
                          key={item.key}
                          budget={item.budget}
                          currency={currency}
                          pinned={pinnedIds.includes(item.budget.id)}
                          onTogglePin={togglePinned}
                          selectable={sel.selectionMode}
                          selected={sel.isSelected(item.budget.id)}
                          onToggleSelect={sel.toggleItem}
                          onPress={lifted ? undefined : openBudget}
                          isLast={index === total - 1}
                        />
                      )}
                    />
                  </Card>
                </>
              )}
            </Screen>

            {/* Selection mode swaps the create FAB for the contextual move bar,
                exactly like Home swaps its pinned strip. */}
            {sel.selectionMode ? sel.toolbar : <Fab onPress={openCreateBudget} accessibilityLabel="Create a new budget in this folder" />}

            {pickerOpen ? (
              <FolderPickerSheet
                folders={folders}
                onPick={(targetFolderId) => confirmBulkMove(targetFolderId)}
                onClose={() => setPickerOpen(false)}
              />
            ) : null}
          </GestureHandlerRootView>
        );
      }}
    </SelectionWrapper>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 16,
  },
  swatch: {
    borderRadius: 7,
    borderWidth: 2,
    height: 26,
    width: 26,
  },
});
