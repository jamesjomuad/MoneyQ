import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { BudgetCard } from '../../components/budgets/BudgetCard';
import { Button } from '../../components/ui/Button';
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
          description="This budget folder may have been deleted. Its budgets, if there were any, are back on the Home list."
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
        ? `The ${count} ${count === 1 ? 'budget' : 'budgets'} inside are NOT deleted — they move back to the Home list.`
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
    <View style={styles.fill}>
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

      <Screen topInset={false} bottomSpace={FAB_SIZE + spacing.xl}>
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
            description="Create a new budget here, or move an existing one in from Home with a long press."
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
            {folderBudgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                currency={currency}
                pinned={pinnedIds.includes(budget.id)}
                onTogglePin={() => togglePinned(budget.id)}
                onPress={() =>
                  router.push({ pathname: '/budget/[id]', params: { id: budget.id } })
                }
              />
            ))}
          </>
        )}
      </Screen>

      <Fab onPress={openCreateBudget} accessibilityLabel="Create a new budget in this folder" />
    </View>
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
