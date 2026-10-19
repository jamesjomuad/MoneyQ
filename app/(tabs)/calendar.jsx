import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { MonthCalendar } from "../../components/calendar/MonthCalendar";
import { TransactionRow } from "../../components/transactions/TransactionRow";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useCalendarStore } from "../../stores/calendarStore";
import { useRemindersStore } from "../../stores/remindersStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagsStore } from "../../stores/tagsStore";
import { computeTotals } from "../../utils/calculations";
import { formatCurrency } from "../../utils/currency";
import { formatDate, formatShortDate, formatTime, todayIso } from "../../utils/dates";
import { REMINDER_STATUS_LABELS, deriveReminderStatus } from "../../utils/reminders";
import { PAYMENT_EVENT_LABELS, derivePaymentEventStatus } from "../../utils/paymentStatus";

export default function CalendarScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const tags = useTagsStore((state) => state.tags);
  const loadTags = useTagsStore((state) => state.load);

  const monthKey = useCalendarStore((state) => state.monthKey);
  const selectedDate = useCalendarStore((state) => state.selectedDate);
  const transactions = useCalendarStore((state) => state.transactions);
  const monthReminders = useCalendarStore((state) => state.reminders);
  const purchases = useCalendarStore((state) => state.purchases);
  const paymentParents = useCalendarStore((state) => state.paymentParents);
  const isLoading = useCalendarStore((state) => state.isLoading);
  const load = useCalendarStore((state) => state.load);
  const setMonth = useCalendarStore((state) => state.setMonth);
  const selectDate = useCalendarStore((state) => state.selectDate);

  const dayCache = useRemindersStore((state) => state.dayCache);
  const reminderDate = useRemindersStore((state) => state.dayDate);
  const remindersLoading = useRemindersStore((state) => state.dayIsLoading);
  const loadDay = useRemindersStore((state) => state.loadDay);

  // One stable edit handler for every day-list row (rows carry their own
  // budget_id), so memoized rows can skip re-rendering untouched items.
  const handleEditTransaction = useCallback(
    (entry) =>
      router.push({
        pathname: "/transaction/form",
        params: {
          budgetId: entry.budget_id,
          transactionId: entry.id,
        },
      }),
    [],
  );

  // Reload the visible month on focus so edits made elsewhere show up; the
  // store keeps the selection when it still belongs to that month. The day
  // list is cached per date, so it is re-read as well: archiving or restoring
  // a budget on another screen must not leave that budget's reminders here.
  // The date is read from the store at focus time, so `selectedDate` stays out
  // of the dependencies and tapping through days still uses the cache.
  useFocusEffect(
    useCallback(() => {
      load();
      loadTags();
      loadDay(useCalendarStore.getState().selectedDate, { force: true });
    }, [load, loadTags, loadDay]),
  );

  // The interactive reminder list is scoped to one date at a time: changing
  // the selection claims the scope and re-reads, so a stale day can never
  // show under another day's header.
  useEffect(() => {
    loadDay(selectedDate);
  }, [loadDay, selectedDate]);

  // Dots mark every kind of visible activity: financial rows, breakdown
  // purchases, and scheduled payments alike.
  const activityDates = useMemo(
    () =>
      new Set([
        ...transactions.map((entry) => entry.transaction_date),
        ...purchases.map((item) => item.purchase_date),
        ...paymentParents.map((entry) => entry.payment_due_date),
      ]),
    [transactions, purchases, paymentParents],
  );
  const reminderDates = useMemo(
    () => new Set(monthReminders.map((reminder) => reminder.remind_date)),
    [monthReminders],
  );

  const dayTransactions = useMemo(
    () => transactions.filter((entry) => entry.transaction_date === selectedDate),
    [transactions, selectedDate],
  );
  const dayPurchases = useMemo(
    () => purchases.filter((item) => item.purchase_date === selectedDate),
    [purchases, selectedDate],
  );
  const dayPayments = useMemo(
    () => paymentParents.filter((entry) => entry.payment_due_date === selectedDate),
    [paymentParents, selectedDate],
  );
  // Results are cached per date; a date that was never fetched renders empty
  // until its first load lands.
  const remindersForDay = dayCache[selectedDate] ?? [];
  const dayLoading = remindersLoading && reminderDate === selectedDate;
  const totals = useMemo(() => computeTotals(dayTransactions), [dayTransactions]);
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  function addReminder() {
    router.push({ pathname: "/reminder/form", params: { date: selectedDate } });
  }

  function openReminder(reminder) {
    router.push({ pathname: "/reminder/form", params: { reminderId: reminder.id } });
  }

  return (
    <Screen topInset>
      <Card>
        <MonthCalendar
          monthKey={monthKey}
          selectedDate={selectedDate}
          activityDates={activityDates}
          reminderDates={reminderDates}
          onChangeMonth={setMonth}
          onSelectDate={selectDate}
        />
      </Card>

      <SectionHeader
        title={formatDate(selectedDate)}
        action={
          isLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null
        }
      />

      {dayTransactions.length > 0 ? (
        <>
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.summaryRow}>
              <Text variant="body" tone="muted">
                Income
              </Text>
              <Text variant="body" tone="income" style={styles.summaryAmount}>
                +{formatCurrency(totals.income, { currency })}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="body" tone="muted">
                Expenses
              </Text>
              <Text variant="body" tone="expense" style={styles.summaryAmount}>
                -{formatCurrency(totals.expense, { currency })}
              </Text>
            </View>
            <View
              style={[
                styles.summaryRow,
                styles.summaryTotal,
                { borderTopColor: colors.border },
              ]}
            >
              <Text variant="heading">Total spent</Text>
              <Text variant="heading" style={styles.summaryAmount}>
                {formatCurrency(totals.expense, { currency })}
              </Text>
            </View>
          </Card>

          <Card padded={false} style={{ marginBottom: spacing.md }}>
            {dayTransactions.map((transaction, index) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                tag={tagById.get(transaction.tag_id) ?? null}
                currency={currency}
                isFirst={index === 0}
                isLast={index === dayTransactions.length - 1}
                onEdit={handleEditTransaction}
              />
            ))}
          </Card>
        </>
      ) : null}

      {dayPurchases.length > 0 ? (
        <Card padded={false} style={{ marginBottom: spacing.md }}>
          <View style={[styles.eventHeader, { borderBottomColor: colors.border }]}>
            <Text variant="label" tone="muted">
              Purchases
            </Text>
            <Text variant="caption" tone="faint">
              breakdown items · not counted again
            </Text>
          </View>
          {dayPurchases.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open parent of purchase ${item.description}`}
              onPress={() =>
                router.push({
                  pathname: "/transaction/form",
                  params: {
                    budgetId: item.parent_budget_id,
                    transactionId: item.transaction_id,
                    subId: item.id,
                  },
                })
              }
              style={({ pressed }) => [
                styles.eventRow,
                index > 0 && {
                  marginTop: spacing.sm,
                  borderTopColor: colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  paddingTop: spacing.sm,
                },
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Icon name="shopping" size={18} color={colors.textFaint} />
              <View style={styles.reminderCopy}>
                <Text variant="body" numberOfLines={1}>
                  {item.description}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.purchase_time ? `${formatTime(item.purchase_time)} · ` : ''}
                  {item.parent_description ? `in ${item.parent_description}` : 'breakdown item'}
                </Text>
              </View>
              <Text
                variant="body"
                style={{
                  color: item.amount < 0 ? colors.expense : colors.income,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatCurrency(item.amount, { currency, showSign: true })}
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {dayPayments.length > 0 ? (
        <Card padded={false} style={{ marginBottom: spacing.md }}>
          <View style={[styles.eventHeader, { borderBottomColor: colors.border }]}>
            <Text variant="label" tone="muted">
              Payments due
            </Text>
            <Text variant="caption" tone="faint">
              all-day · parent schedule
            </Text>
          </View>
          {dayPayments.map((entry, index) => {
            const status = derivePaymentEventStatus(entry, todayIso());
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={`Open transaction due today: ${entry.description || entry.type}`}
                onPress={() =>
                  router.push({
                    pathname: "/transaction/form",
                    params: { budgetId: entry.budget_id, transactionId: entry.id },
                  })
                }
                style={({ pressed }) => [
                  styles.eventRow,
                  index > 0 && {
                    marginTop: spacing.sm,
                    borderTopColor: colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    paddingTop: spacing.sm,
                  },
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Icon name="calendar" size={18} color={colors.warning} />
                <View style={styles.reminderCopy}>
                  <Text variant="body" numberOfLines={1}>
                    {entry.description || formatShortDate(entry.payment_due_date)}
                  </Text>
                  {entry.has_breakdown === 1 ? (
                    <Text variant="caption" tone="muted">
                      payment commitment
                    </Text>
                  ) : null}
                </View>
                {status ? (
                  <Text
                    variant="caption"
                    style={{
                      color:
                        status === 'overdue'
                          ? colors.expense
                          : status === 'paid'
                            ? colors.income
                            : colors.textFaint,
                    }}
                  >
                    {PAYMENT_EVENT_LABELS[status]}
                  </Text>
                ) : null}
                <Text variant="body" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatCurrency(entry.amount, { currency })}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <SectionHeader
        title="Reminders"
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add reminder"
            onPress={addReminder}
            hitSlop={8}
            style={({ pressed }) => [styles.addButton, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Icon name="add" size={20} color={colors.primary} />
          </Pressable>
        }
      />

      {dayLoading ? (
        <Card style={{ marginBottom: spacing.md }}>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        </Card>
      ) : remindersForDay.length > 0 ? (
        <Card style={{ marginBottom: spacing.md }}>
          {remindersForDay.map((reminder, index) => (
              <Pressable
                key={reminder.id}
                accessibilityRole="button"
                accessibilityLabel={`Edit reminder ${reminder.notes || reminder.description || ""}`}
                onPress={() => openReminder(reminder)}
                style={({ pressed }) => [
                  styles.reminderRow,
                  index > 0 && { marginTop: spacing.sm, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Icon name="clock" size={18} color={colors.warning} />
                <View style={styles.reminderCopy}>
                  <Text variant="body" numberOfLines={1}>
                    {reminder.notes || reminder.description || "Reminder"}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {formatTime(reminder.remind_time)}
                    {reminder.amount != null
                      ? ` · ${formatCurrency(reminder.amount, { currency })}`
                      : ""}
                    {reminder.description && reminder.notes ? ` · ${reminder.description}` : ""}
                  </Text>
                </View>
                <ReminderStatusChip reminder={reminder} />
              </Pressable>
            ))}
        </Card>
      ) : (
        <Card style={{ marginBottom: spacing.md }}>
          <EmptyState
            icon="clock"
            title="No reminders"
            description="Nothing is scheduled for this date."
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add reminder"
              onPress={addReminder}
              style={({ pressed }) => [
                styles.addRow,
                { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Icon name="add" size={18} color={colors.primary} />
              <Text variant="label" tone="primary">
                Add reminder
              </Text>
            </Pressable>
          </EmptyState>
        </Card>
      )}
    </Screen>
  );
}

/**
 * A reminder's status comes from its own schedule and completion state —
 * never from the date the user happens to be viewing.
 */
function ReminderStatusChip({ reminder }) {
  const { colors } = useTheme();
  const status = deriveReminderStatus(reminder);
  const toneColor =
    status === "completed" ? colors.income : status === "overdue" ? colors.expense : colors.textFaint;
  return (
    <Text variant="caption" style={{ color: toneColor }}>
      {REMINDER_STATUS_LABELS[status]}
    </Text>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  summaryTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    paddingTop: 10,
  },
  summaryAmount: {
    fontVariant: ["tabular-nums"],
  },
  eventHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  eventRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reminderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 2,
  },
  reminderCopy: {
    flex: 1,
    minWidth: 0,
  },
  loadingRow: {
    alignItems: "center",
    paddingVertical: 12,
  },
  addButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  addRow: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    columnGap: 6,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
