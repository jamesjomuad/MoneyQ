import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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

/** Parse a `#rgb`/`#rrggbb` theme color to [r, g, b]. */
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend between two hex colors, t in [0, 1]. */
function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Spend gauge color: green when nothing is spent, orange at half of income,
 * red at or above income. Anchored on theme tokens so every palette (light,
 * dark, MoneyQ) stays consistent.
 */
function spendColor(colors, percent) {
  const p = Math.min(1, Math.max(0, percent / 100));
  if (p <= 0.5) return mixHex(colors.income, colors.warning, p / 0.5);
  return mixHex(colors.warning, colors.expense, (p - 0.5) / 0.5);
}

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

  // Share of income already spent, from the same summary the stats row uses.
  // Income of zero means nothing to measure against → 0%, never a divide-by-zero.
  // The label may exceed 100% when expenses outrun income; the fill is clamped.
  const spentPercent = summary.income > 0 ? (summary.expense / summary.income) * 100 : 0;
  const spentFill = Math.min(100, Math.max(0, spentPercent));
  const fillColor = spendColor(colors, spentPercent);

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

      {/* Pinned summary: the remaining balance stays visible while the
          tag and transaction lists scroll underneath it. */}
      <View
        style={[
          styles.pinned,
          {
            backgroundColor: colors.background,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
            paddingTop: spacing.md,
          },
        ]}
      >
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

          {/* Progress bar replaces the old stats separator: the fill shows how
              much of the budget's income has been spent (expense / income). */}
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.surfaceMuted, marginTop: spacing.md },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                { backgroundColor: fillColor, width: `${spentFill}%` },
              ]}
            />
          </View>

          <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
            {Math.round(spentPercent)}% of income spent
          </Text>

          <View style={[styles.stats, { marginTop: spacing.sm }]}>
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
      </View>

      <Screen contentContainerStyle={{ paddingBottom: 96 }}>
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
              title="No tags used yet"
              description="Tags appear here once an income or expense in this budget references one."
            >
              <Button label="Manage tags" onPress={() => router.push('/tags')} />
            </EmptyState>
          ) : (
            <ScrollView
              style={styles.tagScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <View style={[styles.tagGrid, { gap: spacing.sm }]}>
                {tagSummaries.map(({ tag, spent, expensePercent }) => (
                  <View key={tag.id} style={styles.tagGridItem}>
                    <TagSpendRow
                      tag={tag}
                      spent={spent}
                      expensePercent={expensePercent}
                      currency={currency}
                      active={tag.id === activeTagId}
                      onPress={() => setActiveTag(tag.id === activeTagId ? null : tag.id)}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
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
                      sharePercent={transaction.sharePercent}
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
  pinned: { flexShrink: 0 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  stats: { flexDirection: 'row' },
  progressTrack: { borderRadius: 4, height: 8, overflow: 'hidden', width: '100%' },
  progressFill: { borderRadius: 4, height: '100%' },
  // Keep both axes evenly spaced and stop wrapped rows from stretching cards
  // to fill leftover vertical space. Dynamic `gap` above supplies the theme's
  // small spacing value.
  tagGrid: {
    alignContent: 'flex-start',
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tagGridItem: { flexGrow: 0, flexShrink: 0, width: '48%' },
  // Capped height keeps the section compact and scrolls independently inside
  // the page ScrollView. ~5 rows of chips before the tags start scrolling.
  tagScroll: { flexGrow: 0, maxHeight: 260 },
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