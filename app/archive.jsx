import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Screen, SectionHeader } from '../components/ui/Screen';
import { Text } from '../components/ui/Text';
import { useTheme } from '../components/ui/ThemeProvider';
import { useBudgetsStore } from '../stores/budgetsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { showToast } from '../stores/toastStore';
import { computeBudgetBalance } from '../utils/calculations';
import { resolveRowChip } from '../utils/colors';
import { formatCurrency } from '../utils/currency';
import { formatDate, formatDateRange } from '../utils/dates';

/**
 * Everything the user removed from the budget list. Removing a budget is a soft delete:
 * the row keeps its id, folder assignment, transactions, breakdown items,
 * attachments, reminders, tags and colors, so Restore is lossless. Only the
 * explicit permanent delete here writes rows away, and it is confirmed first
 * because it takes the associated records with it.
 */
export default function ArchiveScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);

  const archivedBudgets = useBudgetsStore((state) => state.archivedBudgets);
  const error = useBudgetsStore((state) => state.error);
  const loadArchived = useBudgetsStore((state) => state.loadArchived);
  const restoreArchived = useBudgetsStore((state) => state.restoreArchived);
  const removeBudget = useBudgetsStore((state) => state.removeBudget);

  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await loadArchived();
    } finally {
      setBusy(false);
    }
  }, [loadArchived]);

  // Re-read on focus so a restore or an archive made elsewhere is reflected.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function handleRestore(budget) {
    setPendingId(budget.id);
    try {
      const restored = await restoreArchived(budget.id);
      showToast(
        restored?.folder_id
          ? `Restored ${budget.name} to its folder`
          : `Restored ${budget.name}`,
        'success',
      );
    } catch (restoreError) {
      Alert.alert('Could not restore', restoreError?.message ?? 'Please try again.');
    } finally {
      setPendingId(null);
    }
  }

  function handleDelete(budget) {
    Alert.alert(
      `Delete "${budget.name}" permanently?`,
      'Its transactions, breakdown items, attachments and reminders are deleted with it. ' +
        'This cannot be undone — archive it again instead if you are unsure.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            setPendingId(budget.id);
            try {
              await removeBudget(budget.id);
              showToast(`Deleted ${budget.name}`, 'success');
            } catch (deleteError) {
              Alert.alert('Could not delete', deleteError?.message ?? 'Please try again.');
            } finally {
              setPendingId(null);
            }
          },
        },
      ],
    );
  }

  const showLoading = busy && archivedBudgets.length === 0;
  const showError = Boolean(error) && archivedBudgets.length === 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Archive' }} />
      <Screen
        refreshing={busy && archivedBudgets.length > 0}
        onRefresh={refresh}
      >
        {showLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : showError ? (
          <EmptyState
            icon="archive"
            title="Could not load the archive"
            description={error?.message ?? 'Something went wrong reading your archived budgets.'}
          >
            <Button label="Try again" icon="refresh" onPress={refresh} />
          </EmptyState>
        ) : archivedBudgets.length === 0 ? (
          <EmptyState
            icon="archive"
            title="Nothing archived"
            description="Budgets you remove from the budget list land here. Every transaction, tag and reminder is kept — restore one whenever you like."
          />
        ) : (
          <>
            <SectionHeader title={`Archived · ${archivedBudgets.length}`} />
            <Card padded={false} style={{ marginBottom: spacing.sm }}>
              {archivedBudgets.map((budget, index) => (
                <ArchivedBudgetRow
                  key={budget.id}
                  budget={budget}
                  currency={currency}
                  isLast={index === archivedBudgets.length - 1}
                  busy={pendingId === budget.id}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                />
              ))}
            </Card>
            <Text variant="caption" tone="faint" style={styles.note}>
              Archived budgets keep all of their data. Restoring returns a budget to its folder, or to
              the root list when that folder no longer exists.
            </Text>
          </>
        )}
      </Screen>
    </>
  );
}

/**
 * One archived budget: the same chip/period/amount shape as a Budget row, with
 * a Restore action and a permanent delete. Rows share the rounded card and are
 * separated by hairlines, like every other budget list in the app.
 */
function ArchivedBudgetRow({ budget, currency, isLast, busy, onRestore, onDelete }) {
  const { colors, radius, spacing } = useTheme();
  const chip = resolveRowChip(budget.color, colors);
  const balance = computeBudgetBalance(budget.income ?? 0, budget.spent ?? 0);
  const period = formatDateRange(budget.start_date, budget.end_date);
  const archivedOn = budget.deleted_at
    ? formatDate(String(budget.deleted_at).slice(0, 10))
    : null;

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        },
      ]}
    >
      <View style={[styles.iconChip, { backgroundColor: chip.background, borderRadius: radius.md }]}>
        <Icon name="wallet" size={20} color={chip.icon} />
      </View>

      <View style={styles.copy}>
        <Text variant="heading" numberOfLines={1}>
          {budget.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {archivedOn ? `${period} · archived ${archivedOn}` : period}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {formatCurrency(budget.spent, { currency })} spent ·{' '}
          {formatCurrency(balance, { currency })} balance
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Restore ${budget.name}`}
        disabled={busy}
        onPress={() => onRestore(budget)}
        style={({ pressed }) => [
          styles.restoreButton,
          {
            borderColor: colors.border,
            borderRadius: radius.pill,
            opacity: busy ? 0.5 : pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon name="undo" size={15} color={colors.primary} />
        <Text variant="label" tone="primary">
          Restore
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${budget.name} permanently`}
        disabled={busy}
        hitSlop={8}
        onPress={() => onDelete(budget)}
        style={({ pressed }) => [
          styles.deleteButton,
          { opacity: busy ? 0.4 : pressed ? 0.6 : 1 },
        ]}
      >
        <Icon name="trash" size={18} color={colors.expense} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  iconChip: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  restoreButton: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  note: {
    marginTop: 12,
  },
});
