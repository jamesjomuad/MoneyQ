import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { TransactionRow } from "../../components/transactions/TransactionRow";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { Stat } from "../../components/ui/Stat";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useBudgetsStore } from "../../stores/budgetsStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagsStore } from "../../stores/tagsStore";
import { attentionBudgets, overduePayments } from "../../utils/attention";
import { computeBudgetBalance, computeTotals } from "../../utils/calculations";
import { resolveRowChip } from "../../utils/colors";
import { formatCurrency } from "../../utils/currency";
import { formatDateRange, formatShortDate, formatTime, todayIso } from "../../utils/dates";
import { PAYMENT_EVENT_LABELS, derivePaymentEventStatus } from "../../utils/paymentStatus";
import { REMINDER_STATUS_LABELS, deriveReminderStatus } from "../../utils/reminders";

/** How many rows each list shows before it stops — a dashboard, not a report. */
const ATTENTION_LIMIT = 3;
const UPCOMING_LIMIT = 4;

/** The one financial condition that puts a budget in Needs Attention. */
const OVER_BALANCE_REASON = "Spending ahead of income";

/**
 * Disclosure row for a list the dashboard caps. It expands the list in place
 * instead of hiding rows silently, and collapses it again on a second tap.
 */
function ShowAllRow({ count, expanded, noun, onPress }) {
  const { colors, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={expanded ? `Show fewer ${noun}` : `Show all ${count} ${noun}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        styles.rowCenter,
        {
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          justifyContent: "center",
          padding: spacing.lg,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text variant="caption" tone="primary">
        {expanded ? "Show less" : `Show all ${count}`}
      </Text>
    </Pressable>
  );
}

/**
 * One over-balance budget in Needs Attention. It states the financial reason
 * and the money left (negative), and says nothing about how much of the period
 * has run — elapsed time is context for the Budgets list, never an alarm.
 */
function BudgetAttentionRow({ row, currency, isFirst, onPress }) {
  const { colors, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.budget.name}, ${OVER_BALANCE_REASON}, ${formatCurrency(
        row.remaining,
        { currency },
      )} remaining`}
      onPress={() => onPress(row.budget)}
      style={({ pressed }) => [
        styles.row,
        { padding: spacing.lg },
        !isFirst && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: resolveRowChip(row.budget.color, colors).background },
        ]}
      />
      <View style={styles.grow}>
        <View style={styles.rowHead}>
          <Text variant="body" numberOfLines={1} style={styles.grow}>
            {row.budget.name}
          </Text>
          <Text variant="body" tone="expense" style={styles.amount}>
            {formatCurrency(row.remaining, { currency })}
          </Text>
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.reason}>
          {OVER_BALANCE_REASON} ·{" "}
          {formatDateRange(row.budget.start_date, row.budget.end_date)}
        </Text>
      </View>
    </Pressable>
  );
}

/** An unpaid payment past its due date — the other actionable attention item. */
function OverduePaymentRow({ entry, currency, isFirst, onPress }) {
  const { colors, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.description || "Payment"}, ${
        PAYMENT_EVENT_LABELS.overdue
      }, due ${formatShortDate(entry.payment_due_date)}, ${formatCurrency(entry.amount, {
        currency,
      })}`}
      onPress={() => onPress(entry)}
      style={({ pressed }) => [
        styles.row,
        styles.rowCenter,
        { padding: spacing.lg },
        !isFirst && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <Icon name="calendar" size={18} color={colors.expense} />
      <View style={styles.grow}>
        <Text variant="body" numberOfLines={1}>
          {entry.description || "Payment"}
        </Text>
        <Text variant="caption" tone="muted" style={styles.reason}>
          Due {formatShortDate(entry.payment_due_date)}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text variant="caption" style={{ color: colors.expense }}>
          {PAYMENT_EVENT_LABELS.overdue}
        </Text>
        <Text variant="body" style={[styles.amount, styles.statusRight]}>
          {formatCurrency(entry.amount, { currency })}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Home tab: the Insights dashboard. It answers "how am I doing, what is coming
 * up, and what did I just record" from data that already exists — the active
 * budgets the Budgets tab manages, this month's transactions, the payments and
 * reminders around today, and the newest transactions.
 *
 * Every figure is derived on the spot from those reads, so nothing is stored
 * twice and no total can drift from its rows. Breakdown items are never added
 * to transactions: the summary sums parent rows only. Archived budgets are
 * excluded by construction — `useBudgetsStore` only loads active ones and the
 * adapters hide archived transactions and reminders from every cross-budget
 * read.
 *
 * Charts belong to Reports; this screen stays a set of lists and figures. The
 * heavy lifting (which rows to read) lives in `useDashboardStore`.
 */
export default function HomeScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);

  const isLoading = useDashboardStore((state) => state.isLoading);
  const error = useDashboardStore((state) => state.error);
  const range = useDashboardStore((state) => state.range);
  const monthTransactions = useDashboardStore((state) => state.monthTransactions);
  const upcomingPayments = useDashboardStore((state) => state.upcomingPayments);
  const upcomingReminders = useDashboardStore((state) => state.upcomingReminders);
  const recent = useDashboardStore((state) => state.recent);
  const load = useDashboardStore((state) => state.load);

  const budgets = useBudgetsStore((state) => state.budgets);
  const loadBudgets = useBudgetsStore((state) => state.load);
  const tags = useTagsStore((state) => state.tags);
  const loadTags = useTagsStore((state) => state.load);

  // One disclosure per capped list. Collapsed by default: the dashboard stays
  // a glance, but every hidden row is now reachable without leaving Home.
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAllReminders, setShowAllReminders] = useState(false);

  // Pull-to-refresh owns only the native spinner — the stores keep the last
  // data on screen while they re-read, so the dashboard never blanks.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), loadBudgets(), loadTags()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, loadBudgets, loadTags]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadBudgets();
      loadTags();
    }, [load, loadBudgets, loadTags]),
  );

  // The screen is re-read on every focus, so "today" is fixed per mount: the
  // period bars and payment statuses only need a day-resolution reference.
  const today = useMemo(() => todayIso(), []);

  const totals = useMemo(() => computeTotals(monthTransactions), [monthTransactions]);

  const remainingTotal = useMemo(
    () =>
      budgets.reduce(
        (sum, budget) => sum + computeBudgetBalance(budget.income ?? 0, budget.spent ?? 0),
        0,
      ),
    [budgets],
  );

  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  /**
   * The dashboard's only alarm list. A row earns a place for a financial
   * reason — a budget spending ahead of received income, or an unpaid payment
   * past its due date. A healthy budget is never listed just because its
   * period is ending; the calendar position of a period is context, not a
   * problem. Overdue payments are not repeated in Upcoming.
   */
  const attentionAll = useMemo(() => {
    const budgetsAhead = attentionBudgets(budgets).map((row) => ({ kind: "budget", ...row }));
    const paymentsLate = overduePayments(upcomingPayments, today).map((entry) => ({
      kind: "payment",
      entry,
    }));
    return [...budgetsAhead, ...paymentsLate];
  }, [budgets, upcomingPayments, today]);
  const attention = showAllAttention ? attentionAll : attentionAll.slice(0, ATTENTION_LIMIT);

  // Paid commitments are settled money, and overdue ones moved to Needs
  // Attention, so Upcoming carries only what is still ahead or due today.
  const duePaymentsAll = useMemo(
    () =>
      upcomingPayments.filter((entry) => {
        const status = derivePaymentEventStatus(entry, today);
        return status === "upcoming" || status === "dueToday";
      }),
    [upcomingPayments, today],
  );
  const duePayments = showAllPayments ? duePaymentsAll : duePaymentsAll.slice(0, UPCOMING_LIMIT);

  const dueReminders = showAllReminders
    ? upcomingReminders
    : upcomingReminders.slice(0, UPCOMING_LIMIT);

  const openTransaction = useCallback(
    (entry) =>
      router.push({
        pathname: "/transaction/form",
        params: { budgetId: entry.budget_id, transactionId: entry.id },
      }),
    [],
  );

  const openReminder = useCallback(
    (reminder) => router.push({ pathname: "/reminder/form", params: { reminderId: reminder.id } }),
    [],
  );

  const openBudget = useCallback(
    (budget) => router.push({ pathname: "/budget/[id]", params: { id: budget.id } }),
    [],
  );

  const nothingYet = budgets.length === 0 && recent.length === 0;
  const loadingFirst = isLoading && recent.length === 0;
  const failed = Boolean(error) && recent.length === 0;
  // A refresh that fails while data is already on screen must not wipe the
  // dashboard; it surfaces as a non-blocking banner instead.
  const staleError = Boolean(error) && !failed;
  const ready = !loadingFirst && !failed && !nothingYet;

  return (
    <Screen topInset refreshing={refreshing} onRefresh={refresh}>
      <SectionHeader title={range ? `Overview · ${range.label}` : "Overview"} />

      {loadingFirst ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
            Loading insights…
          </Text>
        </View>
      ) : null}

      {failed ? (
        <EmptyState
          icon="database"
          title="Could not load your insights"
          description="Something went wrong reading your budgets and transactions. Nothing was changed — your data is still on this device."
        >
          <Button label="Try again" icon="refresh" onPress={() => load()} />
        </EmptyState>
      ) : null}

      {staleError ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text variant="label" tone="warning">
            Some insights could not be refreshed
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
            Showing the last data that loaded. Your data is still on this device.
          </Text>
          <Button
            label="Try again"
            icon="refresh"
            variant="secondary"
            onPress={() => load()}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : null}

      {nothingYet ? (
        <EmptyState
          icon="wallet"
          title="Your insights will appear here"
          description="Create a budget and record what you spend to see your remaining balance, the payments and reminders coming up, and your latest activity at a glance."
        >
          <Button
            label="Create your first budget"
            icon="add"
            onPress={() => router.push("/budget/form")}
          />
        </EmptyState>
      ) : null}

      {ready ? (
        <View style={{ gap: spacing.lg }}>
          <Card>
            <Text variant="label" tone="muted">
              Remaining
            </Text>
            <Text
              variant="title"
              tone={remainingTotal < 0 ? "expense" : "default"}
              style={{ marginTop: spacing.xs }}
            >
              {formatCurrency(remainingTotal, { currency })}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
              {budgets.length === 1
                ? "Across 1 active budget"
                : `Across ${budgets.length} active budgets`}
            </Text>

            <View
              style={[
                styles.summaryRow,
                {
                  borderTopColor: colors.border,
                  marginTop: spacing.md,
                  paddingTop: spacing.md,
                },
              ]}
            >
              <Stat
                label="Income"
                value={formatCurrency(totals.income, { currency })}
                tone="income"
              />
              <Stat
                label="Expenses"
                value={formatCurrency(totals.expense, { currency })}
                tone="expense"
              />
            </View>

            <Text variant="caption" tone="faint" style={{ marginTop: spacing.sm }}>
              Income and expenses recorded in {range?.label ?? "this month"}. Archived budgets are
              not included.
            </Text>
          </Card>

          {attention.length > 0 ? (
            <View>
              <SectionHeader title="Needs Attention" />
              <Card padded={false}>
                {attention.map((item, index) =>
                  item.kind === "budget" ? (
                    <BudgetAttentionRow
                      key={`budget-${item.budget.id}`}
                      row={item}
                      currency={currency}
                      isFirst={index === 0}
                      onPress={openBudget}
                    />
                  ) : (
                    <OverduePaymentRow
                      key={`payment-${item.entry.id}`}
                      entry={item.entry}
                      currency={currency}
                      isFirst={index === 0}
                      onPress={openTransaction}
                    />
                  ),
                )}
                {attentionAll.length > ATTENTION_LIMIT ? (
                  <ShowAllRow
                    count={attentionAll.length}
                    expanded={showAllAttention}
                    noun="items needing attention"
                    onPress={() => setShowAllAttention((value) => !value)}
                  />
                ) : null}
              </Card>
            </View>
          ) : null}

          <View>
            <SectionHeader title="Upcoming" />
            <Card padded={false}>
              <View style={[styles.groupHead, { borderBottomColor: colors.border }]}>
                <Text variant="caption" tone="muted">
                  Payments due
                </Text>
                <Text variant="caption" tone="faint">
                  Next 30 days
                </Text>
              </View>

              {duePayments.length === 0 ? (
                <Text variant="caption" tone="faint" style={{ padding: spacing.lg }}>
                  Nothing is due in the next 30 days.
                </Text>
              ) : (
                duePayments.map((entry, index) => {
                  const status = derivePaymentEventStatus(entry, today);
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${entry.description || "Payment"}, ${
                        PAYMENT_EVENT_LABELS[status]
                      }, due ${formatShortDate(entry.payment_due_date)}, ${formatCurrency(entry.amount, {
                        currency,
                      })}`}
                      onPress={() => openTransaction(entry)}
                      style={({ pressed }) => [
                        styles.row,
                        styles.rowCenter,
                        { padding: spacing.lg },
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Icon name="calendar" size={18} color={colors.warning} />
                      <View style={styles.grow}>
                        <Text variant="body" numberOfLines={1}>
                          {entry.description || "Payment"}
                        </Text>
                        <Text variant="caption" tone="muted" style={styles.reason}>
                          Due {formatShortDate(entry.payment_due_date)}
                        </Text>
                      </View>
                      <View style={styles.trailing}>
                        <Text
                          variant="caption"
                          style={{
                            color: status === "dueToday" ? colors.warning : colors.textMuted,
                          }}
                        >
                          {PAYMENT_EVENT_LABELS[status]}
                        </Text>
                        <Text variant="body" style={[styles.amount, styles.statusRight]}>
                          {formatCurrency(entry.amount, { currency })}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}

              {duePaymentsAll.length > UPCOMING_LIMIT ? (
                <ShowAllRow
                  count={duePaymentsAll.length}
                  expanded={showAllPayments}
                  noun="payments due"
                  onPress={() => setShowAllPayments((value) => !value)}
                />
              ) : null}

              <View
                style={[
                  styles.groupHead,
                  {
                    borderTopColor: colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Text variant="caption" tone="muted">
                  Reminders
                </Text>
                <Text variant="caption" tone="faint">
                  Next 30 days
                </Text>
              </View>

              {dueReminders.length === 0 ? (
                <Text variant="caption" tone="faint" style={{ padding: spacing.lg }}>
                  No reminders scheduled.
                </Text>
              ) : (
                dueReminders.map((reminder, index) => {
                  const status = deriveReminderStatus(reminder);
                  return (
                    <Pressable
                      key={reminder.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${reminder.notes || reminder.description || "Reminder"}, ${
                        REMINDER_STATUS_LABELS[status]
                      }, ${formatShortDate(reminder.remind_date)} ${formatTime(reminder.remind_time)}`}
                      onPress={() => openReminder(reminder)}
                      style={({ pressed }) => [
                        styles.row,
                        styles.rowCenter,
                        { padding: spacing.lg },
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Icon name="clock" size={18} color={colors.warning} />
                      <View style={styles.grow}>
                        <Text variant="body" numberOfLines={1}>
                          {reminder.notes || reminder.description || "Reminder"}
                        </Text>
                        <Text variant="caption" tone="muted" style={styles.reason}>
                          {formatShortDate(reminder.remind_date)} ·{" "}
                          {formatTime(reminder.remind_time)}
                        </Text>
                      </View>
                      <View style={styles.trailing}>
                        <Text
                          variant="caption"
                          style={{
                            color: status === "overdue" ? colors.expense : colors.textMuted,
                          }}
                        >
                          {REMINDER_STATUS_LABELS[status]}
                        </Text>
                        {reminder.amount == null ? null : (
                          <Text variant="body" style={[styles.amount, styles.statusRight]}>
                            {formatCurrency(reminder.amount, { currency })}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })
              )}

              {upcomingReminders.length > UPCOMING_LIMIT ? (
                <ShowAllRow
                  count={upcomingReminders.length}
                  expanded={showAllReminders}
                  noun="reminders"
                  onPress={() => setShowAllReminders((value) => !value)}
                />
              ) : null}
            </Card>
          </View>

          {recent.length > 0 ? (
            <View>
              <SectionHeader
                title="Recent Transactions"
                action={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open the Budgets tab"
                    onPress={() => router.push("/budgets")}
                    hitSlop={14}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text variant="caption" tone="primary">
                      Budgets
                    </Text>
                  </Pressable>
                }
              />
              <Card padded={false}>
                {recent.map((transaction, index) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    tag={tagById.get(transaction.tag_id) ?? null}
                    currency={currency}
                    isFirst={index === 0}
                    isLast={index === recent.length - 1}
                    onEdit={openTransaction}
                  />
                ))}
              </Card>
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", paddingVertical: 48 },
  summaryRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", gap: 12 },
  rowCenter: { alignItems: "center" },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  grow: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  reason: { marginTop: 2 },
  amount: { fontVariant: ["tabular-nums"] },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trailing: { alignItems: "flex-end" },
  statusRight: { textAlign: "right" },
  pressed: { opacity: 0.7 },
});
