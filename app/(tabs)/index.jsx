import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";
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
import { computeBudgetBalance, computeTotals } from "../../utils/calculations";
import { resolveRowChip } from "../../utils/colors";
import { formatCurrency } from "../../utils/currency";
import {
  daysInclusive,
  formatDateRange,
  formatShortDate,
  formatTime,
  todayIso,
} from "../../utils/dates";
import { PAYMENT_EVENT_LABELS, derivePaymentEventStatus } from "../../utils/paymentStatus";
import { REMINDER_STATUS_LABELS, deriveReminderStatus } from "../../utils/reminders";

/** How far a budget's period can be from ending and still be worth flagging. */
const ENDING_SOON_DAYS = 7;

/** How many rows each list shows before it stops — a dashboard, not a report. */
const ATTENTION_LIMIT = 3;
const UPCOMING_LIMIT = 4;

/** Why a budget is on the attention list, in the user's words. */
function attentionReason(row) {
  if (row.overBalance) return "Spending ahead of income";
  if (row.daysLeft <= 0) return "Period ends today";
  if (row.daysLeft === 1) return "Period ends in 1 day";
  return `Period ends in ${row.daysLeft} days`;
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
  const { colors, radius, spacing } = useTheme();
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
   * The budgets worth a nudge: one whose spending is already ahead of its
   * income, or one whose period is about to close. A budget holds transactions
   * rather than capping them, so the bar tracks the period itself — there is no
   * limit to compare against.
   */
  const attention = useMemo(() => {
    const rows = [];
    for (const budget of budgets) {
      const remaining = computeBudgetBalance(budget.income ?? 0, budget.spent ?? 0);
      const totalDays = Math.max(daysInclusive(budget.start_date, budget.end_date), 1);
      const daysSoFar = Math.min(Math.max(daysInclusive(budget.start_date, today), 0), totalDays);
      const daysLeft = daysInclusive(today, budget.end_date) - 1;
      const overBalance = (budget.income ?? 0) > 0 && remaining < 0;
      const endingSoon = daysLeft >= 0 && daysLeft <= ENDING_SOON_DAYS && budget.start_date <= today;
      if (!overBalance && !endingSoon) continue;
      rows.push({
        budget,
        remaining,
        progress: daysSoFar / totalDays,
        daysLeft,
        overBalance,
      });
    }
    rows.sort((a, b) => Number(b.overBalance) - Number(a.overBalance) || a.daysLeft - b.daysLeft);
    return rows.slice(0, ATTENTION_LIMIT);
  }, [budgets, today]);

  // The due-date read starts a month back, which is what keeps an overdue
  // payment on the list instead of letting it fall off silently.
  const duePayments = useMemo(
    () =>
      upcomingPayments
        .filter((entry) => derivePaymentEventStatus(entry, today) !== "paid")
        .slice(0, UPCOMING_LIMIT),
    [upcomingPayments, today],
  );

  const dueReminders = useMemo(() => upcomingReminders.slice(0, UPCOMING_LIMIT), [upcomingReminders]);

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
  const ready = !loadingFirst && !failed && !nothingYet;

  return (
    <Screen topInset>
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
            <Text variant="label" tone="faint">
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
                {attention.map((row, index) => (
                  <Pressable
                    key={row.budget.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.budget.name}, ${attentionReason(row)}, ${formatCurrency(
                      row.remaining,
                      { currency },
                    )} remaining`}
                    onPress={() => openBudget(row.budget)}
                    style={({ pressed }) => [
                      styles.row,
                      { padding: spacing.lg },
                      index > 0 && {
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
                        <Text
                          variant="body"
                          tone={row.remaining < 0 ? "expense" : "default"}
                          style={styles.amount}
                        >
                          {formatCurrency(row.remaining, { currency })}
                        </Text>
                      </View>
                      <Text variant="caption" tone="muted" numberOfLines={1} style={styles.reason}>
                        {attentionReason(row)} ·{" "}
                        {formatDateRange(row.budget.start_date, row.budget.end_date)}
                      </Text>
                      <View
                        style={[
                          styles.track,
                          { backgroundColor: colors.surfaceMuted, marginTop: spacing.sm },
                        ]}
                      >
                        <View
                          style={[
                            styles.fill,
                            {
                              width: `${Math.round(row.progress * 100)}%`,
                              backgroundColor: row.overBalance ? colors.expense : colors.primary,
                              borderRadius: radius.pill,
                            },
                          ]}
                        />
                      </View>
                      <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
                        {Math.round(row.progress * 100)}% of the period elapsed
                      </Text>
                    </View>
                  </Pressable>
                ))}
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
                            color:
                              status === "overdue"
                                ? colors.expense
                                : status === "dueToday"
                                  ? colors.warning
                                  : colors.textMuted,
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
  track: { height: 6, borderRadius: 999, overflow: "hidden" },
  fill: { height: 6 },
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
