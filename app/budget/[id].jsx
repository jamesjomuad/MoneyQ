import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FolderPickerSheet } from '../../components/budgets/FolderPickerSheet';
import { TagSpendRow } from '../../components/tags/TagSpendRow';
import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FAB_SIZE, Fab } from '../../components/ui/Fab';
import { Icon } from '../../components/ui/Icon';
import { Screen, SectionHeader } from '../../components/ui/Screen';
import { Stat } from '../../components/ui/Stat';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { useBudgetDetailStore } from '../../stores/budgetDetailStore';
import { useBudgetsStore } from '../../stores/budgetsStore';
import { useFoldersStore } from '../../stores/foldersStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { showToast } from '../../stores/toastStore';
import { groupByDate } from '../../utils/calculations';
import { formatCurrency } from '../../utils/currency';
import { isHexColor, resolveFolderPalette } from '../../utils/colors';
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
 * dark, Budgetarian) stays consistent.
 */
function spendColor(colors, percent) {
  const p = Math.min(1, Math.max(0, percent / 100));
  if (p <= 0.5) return mixHex(colors.income, colors.warning, p / 0.5);
  return mixHex(colors.warning, colors.expense, (p - 0.5) / 0.5);
}

/**
 * Privacy mask for the Remaining amount: every digit becomes a bullet and the
 * thousands/decimal separators drop out, so `₱1,000.00` reads as `₱••••••`.
 * Purely cosmetic — the value it masks is never altered.
 */
function maskAmountText(text) {
  return text.replace(/\d/g, '•').replace(/[,.]/g, '');
}

export default function BudgetDetailScreen() {
  const { id: routeBudgetId } = useLocalSearchParams();
  const budgetId =
    typeof routeBudgetId === 'string'
      ? routeBudgetId
      : Array.isArray(routeBudgetId)
        ? routeBudgetId[0] ?? ''
        : '';
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);

  const budget = useBudgetDetailStore((state) => state.budget);
  const summary = useBudgetDetailStore((state) => state.summary);
  const tagSummaries = useBudgetDetailStore((state) => state.tagSummaries);
  const transactions = useBudgetDetailStore((state) => state.transactions);
  const activeTagId = useBudgetDetailStore((state) => state.activeTagId);
  const storeBudgetId = useBudgetDetailStore((state) => state.budgetId);
  const error = useBudgetDetailStore((state) => state.error);
  const loadError = useBudgetDetailStore((state) => state.loadError);
  const load = useBudgetDetailStore((state) => state.load);
  const setActiveTag = useBudgetDetailStore((state) => state.setActiveTag);
  const removeTransaction = useBudgetDetailStore((state) => state.removeTransaction);
  const removeBudget = useBudgetsStore((state) => state.removeBudget);
  const moveToFolder = useBudgetsStore((state) => state.moveToFolder);
  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.load);

  // Fold long lists so the summary card stays in reach; the headers remain so
  // a folded section can be reopened.
  const [tagsOpen, setTagsOpen] = useState(true);
  const [transactionsOpen, setTransactionsOpen] = useState(true);
  // Measured height of the floating summary card, so the scroll body can
  // reserve exactly the space it occupies (same trick as the transaction
  // form's sticky Amount card).
  const [cardHeight, setCardHeight] = useState(0);
  // Privacy toggle for the pinned Remaining amount only — display state,
  // lives with this screen, touches no stored data and no other figures.
  // Privacy is on by default: the amount starts masked until revealed.
  const [remainingVisible, setRemainingVisible] = useState(false);
  // Budget-folder quick move: opening the picker is display state; the move
  // itself goes through the budgets store (which re-reads from the repository).
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (budgetId) {
        load(budgetId);
        loadFolders();
      }
    }, [budgetId, load, loadFolders]),
  );

  // Date grouping walks every transaction of the budget, so it is memoized on
  // the list identity — screen-local toggles (privacy, collapsed sections,
  // measured card height) no longer rebuild it. Hooks must run unconditionally,
  // hence their position above the loading/error returns.
  const groups = useMemo(() => groupByDate(transactions), [transactions]);
  const tagById = useMemo(
    () => new Map(tagSummaries.map((entry) => [entry.tag.id, entry.tag])),
    [tagSummaries],
  );

  const handleEditTransaction = useCallback(
    (entry) =>
      router.push({
        pathname: '/transaction/form',
        params: { budgetId, transactionId: entry.id },
      }),
    [budgetId],
  );

  const confirmDeleteTransaction = useCallback(
    (transaction) => {
      Alert.alert(
        'Delete transaction?',
        transaction.description || 'This entry will be removed from the budget.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => removeTransaction(transaction.id) },
        ],
      );
    },
    [removeTransaction],
  );

  // The route ID is the identity of this screen. Until the store has data for
  // exactly that ID, the previous budget's values must never render.
  const isCurrentBudget = Boolean(budget) && storeBudgetId === budgetId && budget.id === budgetId;

  // A failed read is not proof the folder is gone. Offer a retry instead of
  // the "not found" dead-end, and make clear the data itself is intact.
  if (loadError && storeBudgetId === budgetId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Couldn’t load budget' }} />
        <EmptyState
          icon="folder"
          title="Couldn’t load this budget"
          description="Budgetarian couldn’t read this folder from local storage. Your data is still on this device — try again."
        >
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Button label="Try again" icon="refresh" onPress={() => load(budgetId)} />
            <Button label="Back to Home" icon="home" onPress={() => router.replace('/')} />
          </View>
        </EmptyState>
      </View>
    );
  }

  if (error && storeBudgetId === budgetId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Budget not found' }} />
        <EmptyState
          icon="folder"
          title="Budget not found"
          description={error?.message ?? 'This budget may have been deleted.'}
        >
          <Button label="Back to Home" icon="home" onPress={() => router.replace('/')} />
        </EmptyState>
      </View>
    );
  }

  if (!isCurrentBudget) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Budget…' }} />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
          Opening budget…
        </Text>
      </View>
    );
  }

  const activeTag = tagSummaries.find((entry) => entry.tag.id === activeTagId)?.tag ?? null;

  // Share of income already spent, from the same summary the stats row uses.
  // Income of zero means nothing to measure against → 0%, never a divide-by-zero.
  // The label may exceed 100% when expenses outrun income; the fill is clamped.
  const spentPercent = summary.income > 0 ? (summary.expense / summary.income) * 100 : 0;
  const spentFill = Math.min(100, Math.max(0, spentPercent));
  const fillColor = spendColor(colors, spentPercent);
  const folderCard = isHexColor(budget.color) ? resolveFolderPalette(budget.color, colors) : null;
  const folderInk = folderCard ? folderCard.folderInk : null;
  // The budget folder this budget currently sits in. Display lookup only:
  // folders organize budgets on Home and hold no money themselves.
  const budgetFolder = folders.find((folder) => folder.id === budget.folder_id) ?? null;

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

      {/* Pinned summary: floats over the scroll body like the transaction
          form's sticky Amount card — the tag and transaction lists scroll
          beneath the card's opaque surface instead of clipping against a
          full-width band. */}
      <View
        style={[
          styles.pinned,
          {
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
            paddingTop: spacing.md,
          },
        ]}
      >
        <Card
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          style={{
            ...(folderCard
              ? { backgroundColor: folderCard.folder, borderColor: folderCard.folderBorder }
              : null),
            // Mirror of the transaction form's sticky Amount card: a floating,
            // borderless, generously rounded surface with a soft drop shadow.
            borderRadius: 25,
            borderWidth: 0,
            padding: spacing.md,
            boxShadow: `0 6px 16px ${colors.shadow}`,
          }}
        >
          <SectionHeader title="Remaining" color={folderInk} />
          <View style={styles.remainingRow}>
            <Text
              variant="display"
              tone={summary.remaining < 0 ? 'expense' : 'default'}
              style={{
                fontSize: 40,
                letterSpacing: -0.8,
                // Let the figure yield to the eye button on very large amounts
                // instead of pushing it past the card's right edge.
                flexShrink: 1,
                ...(folderInk ? { color: folderInk } : null),
              }}
            >
              {remainingVisible
                ? formatCurrency(summary.remaining, { currency })
                : maskAmountText(formatCurrency(summary.remaining, { currency }))}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={remainingVisible ? 'Hide remaining amount' : 'Show remaining amount'}
              onPress={() => setRemainingVisible((visible) => !visible)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.visibilityButton,
                { opacity: pressed ? 0.5 : 0.75 },
              ]}
            >
              <Icon
                name={remainingVisible ? 'eye' : 'eyeOff'}
                size={26}
                color={folderInk ?? colors.textMuted}
              />
            </Pressable>
          </View>
          <Text
            variant="caption"
            tone="muted"
            style={{
              marginTop: spacing.xs,
              ...(folderInk ? { color: folderInk, opacity: 0.85 } : null),
            }}
          >
            {formatDateRange(budget.start_date, budget.end_date)}
          </Text>
          {/* Quick move: which folder this budget lives in (or none), tap to
              change. Touch target stays comfortable even though the text is
              caption-sized. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={budgetFolder ? `Move out of folder ${budgetFolder.name}` : 'Add this budget to a folder'}
            onPress={() => setFolderPickerOpen(true)}
            style={({ pressed }) => [
              styles.folderRow,
              {
                marginTop: spacing.sm,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Icon name="folder" size={16} color={folderInk ?? colors.textMuted} />
            <Text
              variant="caption"
              tone="muted"
              numberOfLines={1}
              style={{ flexShrink: 1, ...(folderInk ? { color: folderInk, opacity: 0.85 } : null) }}
            >
              {budgetFolder ? `In “${budgetFolder.name}”` : 'Add to folder'}
            </Text>
            <Icon name="chevronRight" size={14} color={folderInk ?? colors.textMuted} />
          </Pressable>

          {/* Progress bar replaces the old stats separator: the fill shows how
              much of the budget's income has been spent (expense / income). */}
          <View
            style={[
              styles.progressTrack,
              {
                backgroundColor: folderCard ? folderCard.folderBorder : colors.surfaceMuted,
                marginTop: spacing.md,
              },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                { backgroundColor: folderInk ?? fillColor, width: `${spentFill}%` },
              ]}
            />
          </View>

          <Text
            variant="caption"
            tone="muted"
            style={folderInk ? { marginTop: 6, color: folderInk, opacity: 0.85 } : { marginTop: 6 }}
          >
            {Math.round(spentPercent)}% of income spent
          </Text>

          <View style={[styles.stats, { marginTop: spacing.sm }]}>
            <Stat
              label="Income"
              value={formatCurrency(summary.income, { currency })}
              tone="income"
              style={{ marginRight: 14 }}
              labelColor={folderInk}
              valueColor={folderInk}
            />
            <View
              style={[
                styles.statDivider,
                { backgroundColor: folderInk ? `${folderInk}80` : colors.border },
              ]}
            />
            <Stat
              label="Expenses"
              value={formatCurrency(summary.expense, { currency })}
              tone="expense"
              style={{ marginLeft: 14, marginRight: 14 }}
              labelColor={folderInk}
              valueColor={folderInk}
            />
            <View
              style={[
                styles.statDivider,
                { backgroundColor: folderInk ? `${folderInk}80` : colors.border },
              ]}
            />
            <Stat
              label="Transactions"
              value={String(summary.transactionCount)}
              style={{ marginLeft: 14, marginRight: 0 }}
              labelColor={folderInk}
              valueColor={folderInk}
            />
          </View>
        </Card>
      </View>

      {/* Reserve room for the floating add button: its own bottom offset plus
          the button height, so the last transaction row scrolls clear of it. */}
      <Screen
        bottomSpace={FAB_SIZE + spacing.xl}
        contentContainerStyle={{ paddingTop: spacing.md + cardHeight + spacing.xl }}
      >
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
              <Button label="Manage tags" icon="tag" onPress={() => router.push('/tags')} />
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
              <Button label="Add transaction" icon="add" onPress={() => router.push({ pathname: '/transaction/form', params: { budgetId: budget.id } })} />
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
                      isFirst={index === 0}
                      isLast={index === group.items.length - 1}
                      onEdit={handleEditTransaction}
                      onDelete={confirmDeleteTransaction}
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

      {folderPickerOpen ? (
        <FolderPickerSheet
          folders={folders}
          onPick={async (pickedId) => {
            try {
              await moveToFolder(budget.id, pickedId);
              const destination = folders.find((folder) => folder.id === pickedId);
              showToast(destination ? `Moved to ${destination.name}` : 'Moved to Home');
            } catch (moveError) {
              showToast(moveError?.message ?? 'Could not move the budget.', 'error');
            }
          }}
          onClose={() => setFolderPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pinned: {
    // Lifted out of the column flow so the Screen's ScrollView fills the
    // whole scene and its content slides under the card instead of being
    // hard-clipped at the band's edge. zIndex keeps the card on top even
    // though it precedes the ScrollView in JSX order.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  // Remaining amount with its privacy toggle: the figure keeps the left edge
  // and the eye button sits flush with the card's right edge, optically
  // centered against the 40px display text.
  remainingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  visibilityButton: { marginRight: 30, padding: 2 },
  // Folder quick-move row under the date caption: icon, label, chevron.
  folderRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stats: { flexDirection: 'row' },
  // Centered rule between the Income / Expenses / Transactions stats. It is
  // deliberately shorter than the stat block (not a full-height gridline)
  // and sits in even gutters: each neighbouring Stat reserves 14px of margin
  // on the side facing the rule.
  statDivider: {
    alignSelf: 'center',
    height: 38,
    width: 1.5,
  },
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
});