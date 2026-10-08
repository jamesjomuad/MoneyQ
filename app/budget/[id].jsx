import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { TagSpendRow } from '../../components/tags/TagSpendRow';
import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Fab } from '../../components/ui/Fab';
import { Icon } from '../../components/ui/Icon';
import { Screen, SectionHeader } from '../../components/ui/Screen';
import { Stat } from '../../components/ui/Stat';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { useBudgetDetailStore } from '../../stores/budgetDetailStore';
import { useBudgetsStore } from '../../stores/budgetsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { groupByDate } from '../../utils/calculations';
import { formatCurrency } from '../../utils/currency';
import { resolveFolderPalette } from '../../utils/colors';
import { dayLabel, formatDateRange } from '../../utils/dates';

export default function BudgetDetailScreen() {
  const { id: budgetId } = useLocalSearchParams();
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);

  const budget = useBudgetDetailStore((state) => state.budget);
  const summary = useBudgetDetailStore((state) => state.summary);
  const tagSummaries = useBudgetDetailStore((state) => state.tagSummaries);
  const transactions = useBudgetDetailStore((state) => state.transactions);
  const activeTagId = useBudgetDetailStore((state) => state.activeTagId);
  const isLoading = useBudgetDetailStore((state) => state.isLoading);
  const error = useBudgetDetailStore((state) => state.error);
  const load = useBudgetDetailStore((state) => state.load);
  const setActiveTag = useBudgetDetailStore((state) => state.setActiveTag);
  const removeTransaction = useBudgetDetailStore((state) => state.removeTransaction);
  const removeBudget = useBudgetsStore((state) => state.removeBudget);

  // Fold long lists so the summary card stays in reach; the headers remain so
  // a folded section can be reopened.
  const [tagsOpen, setTagsOpen] = useState(true);
  const [transactionsOpen, setTransactionsOpen] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (budgetId) load(budgetId);
    }, [budgetId, load]),
  );

  const activeTag = tagSummaries.find((entry) => entry.tag.id === activeTagId)?.tag ?? null;
  const groups = groupByDate(transactions);
  const tagById = new Map(tagSummaries.map((entry) => [entry.tag.id, entry.tag]));

  function confirmDeleteTransaction(transaction) {
    Alert.alert(
      'Delete transaction?',
      transaction.description || 'This entry will be removed from the budget.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeTransaction(transaction.id) },
      ],
    );
  }

  function confirmDeleteBudget() {
    if (!budget) return;
    Alert.alert(
      `Delete ${budget.name}?`,
      `This removes the budget and its ${summary.transactionCount} transactions. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeBudget(budget.id);
            router.dismissAll();
            router.replace('/');
          },
        },
      ],
    );
  }

  if (isLoading && !budget) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
          Opening budget…
        </Text>
      </View>
    );
  }

  if (error || !budget) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="folder"
          title="Budget not found"
          description={error?.message ?? 'This budget may have been deleted.'}
        >
          <Button label="Back to Home" onPress={() => router.replace('/')} />
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          title: budget.name,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Budget options"
              onPress={() =>
                Alert.alert(budget.name, null, [
                  {
                    text: 'Edit budget',
                    onPress: () =>
                      router.push({ pathname: '/budget/form', params: { id: budget.id } }),
                  },
                  { text: 'Delete budget', style: 'destructive', onPress: confirmDeleteBudget },
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

      <Screen contentContainerStyle={{ paddingBottom: 96 }}>
        <View style={styles.periodRow}>
          <View
            style={[
              styles.periodDot,
              {
                backgroundColor: resolveFolderPalette(budget.color, colors).folder,
                borderColor: resolveFolderPalette(budget.color, colors).folderBorder,
              },
            ]}
          />
          <Text variant="body" tone="muted" style={{ marginBottom: spacing.lg }}>
            {formatDateRange(budget.start_date, budget.end_date)}
          </Text>
        </View>

        <Card>
          <Text variant="label" tone="muted">
            REMAINING
          </Text>
          <Text
            variant="display"
            tone={summary.remaining < 0 ? 'expense' : 'default'}
            style={{ marginTop: 4 }}
          >
            {formatCurrency(summary.remaining, { currency })}
          </Text>

          <View style={[styles.stats, { borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md }]}>
            <Stat
              label="Income"
              value={formatCurrency(summary.income, { currency })}
              tone="income"
            />
            <Stat
              label="Expenses"
              value={formatCurrency(summary.expense, { currency })}
              tone="expense"
            />
            <Stat
              label="Transactions"
              value={String(summary.transactionCount)}
              style={{ marginRight: 0 }}
            />
          </View>
        </Card>

        <View style={{ height: spacing.xl }} />

        <SectionHeader
          title={`Tags · ${tagSummaries.length}`}
          fontSize={14}
          collapsed={!tagsOpen}
          onToggle={() => setTagsOpen((open) => !open)}
          action={
            activeTag ? (
              <Pressable accessibilityRole="button" onPress={() => setActiveTag(null)} hitSlop={8}>
                <Text variant="label" tone="primary">
                  Clear filter
                </Text>
              </Pressable>
            ) : null
          }
        />

        {tagsOpen &&
          (tagSummaries.length === 0 ? (
            <EmptyState
              icon="tag"
              title="No tags yet"
              description="Tags are a shared library you reuse across budgets. Add one so transactions can be grouped."
            >
              <Button label="Manage tags" onPress={() => router.push('/tags')} />
            </EmptyState>
          ) : (
            tagSummaries.map(({ tag, spent }) => (
              <TagSpendRow
                key={tag.id}
                tag={tag}
                spent={spent}
                currency={currency}
                active={tag.id === activeTagId}
                onPress={() => setActiveTag(tag.id === activeTagId ? null : tag.id)}
              />
            ))
          ))}

        <View style={{ height: spacing.lg }} />

        <SectionHeader
          title={`Transactions · ${transactions.length}`}
          fontSize={14}
          collapsed={!transactionsOpen}
          onToggle={() => setTransactionsOpen((open) => !open)}
          action={
            activeTag ? (
              <Text variant="caption" tone="muted">
                {activeTag.name}
              </Text>
            ) : null
          }
        />

        {transactionsOpen &&
          (transactions.length === 0 ? (
            <EmptyState
              icon="list"
              title={activeTag ? `No ${activeTag.name} transactions` : 'No transactions yet'}
              description={
                activeTag
                  ? 'Nothing has been recorded under this tag inside this budget.'
                  : 'Add income or expenses to this budget and they will show up here, grouped by day.'
              }
            >
              <Button label="Add transaction" onPress={() => router.push({ pathname: '/transaction/form', params: { budgetId: budget.id } })} />
            </EmptyState>
          ) : (
            groups.map((group) => (
              <View key={group.date}>
                <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm, marginTop: spacing.sm }}>
                  {dayLabel(group.date)}
                </Text>
                <Card padded={false}>
                  {group.items.map((transaction, index) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      tag={tagById.get(transaction.tag_id) ?? null}
                      currency={currency}
                      isLast={index === group.items.length - 1}
                      onEdit={(entry) =>
                        router.push({
                          pathname: '/transaction/form',
                          params: { budgetId: budget.id, transactionId: entry.id },
                        })
                      }
                      onDelete={() => confirmDeleteTransaction(transaction)}
                    />
                  ))}
                </Card>
              </View>
            ))
          ))}
      </Screen>

      <Fab
        onPress={() =>
          router.push({
            pathname: '/transaction/form',
            params: { budgetId: budget.id, tagId: activeTagId ?? '' },
          })
        }
        accessibilityLabel="Add transaction"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  stats: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  periodRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  periodDot: {
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    // Matches the Text's marginBottom (spacing.lg) so both align in the row.
    marginBottom: 16,
    width: 12,
  },
});