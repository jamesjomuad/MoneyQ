import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { DatePicker } from '../../components/dates/DatePicker';
import { TimePicker } from '../../components/dates/TimePicker';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Screen, SectionHeader } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { useTheme } from '../../components/ui/ThemeProvider';
import { useBudgetsStore } from '../../stores/budgetsStore';
import { useRemindersStore } from '../../stores/remindersStore';
import { showToast } from '../../stores/toastStore';
import { formatCurrency } from '../../utils/currency';
import { formatDate, toIsoDate } from '../../utils/dates';
import {
  REMINDER_STATUS_LABELS,
  buildRemindAt,
  deriveReminderStatus,
  isValidLocalDate,
  reminderValidationError,
  suggestReminderValues,
} from '../../utils/reminders';

/**
 * Create or edit one reminder — standalone or linked to a transaction.
 *
 * Reachable from the Calendar tab's Reminders section:
 *   /reminder/form?date=2026-10-15            → new reminder on that date
 *   /reminder/form?reminderId=rem_…           → edit, complete or delete
 *   /reminder/form?transactionId=tx_…&date=…  → new, pre-linked
 *
 * The save order mirrors the transaction form: the row is written first
 * (through the reminder service, which also arms or cancels the OS
 * notification), and a permission or scheduling problem is reported without
 * ever losing the reminder itself.
 *
 * A reminder created pre-linked to a transaction opens on that transaction's
 * budget day rather than today, since the transaction only belongs to the
 * budget and may be dated outside its period.
 */
export default function ReminderFormScreen() {
  const params = useLocalSearchParams();
  const reminderId = typeof params.reminderId === 'string' ? params.reminderId : null;
  const paramDate = typeof params.date === 'string' ? params.date : null;
  const paramTransactionId =
    typeof params.transactionId === 'string' ? params.transactionId : null;

  const { colors, radius, spacing } = useTheme();
  const navigation = useNavigation();

  const fetchReminder = useRemindersStore((state) => state.fetchReminder);
  const fetchTransaction = useRemindersStore((state) => state.fetchTransaction);
  const fetchBudget = useBudgetsStore((state) => state.fetchBudget);
  const addReminder = useRemindersStore((state) => state.addReminder);
  const editReminder = useRemindersStore((state) => state.editReminder);
  const completeReminder = useRemindersStore((state) => state.completeReminder);
  const removeReminder = useRemindersStore((state) => state.removeReminder);
  const loadDay = useRemindersStore((state) => state.loadDay);
  const permission = useRemindersStore((state) => state.permission);
  const refreshPermission = useRemindersStore((state) => state.refreshPermission);
  const linkResults = useRemindersStore((state) => state.linkResults);
  const searchLink = useRemindersStore((state) => state.searchLink);
  const resetLinkSearch = useRemindersStore((state) => state.resetLinkSearch);

  const editing = Boolean(reminderId);
  // Opened from a transaction's Reminder section ("add"): the link is fixed to
  // that transaction, so the screen never asks the user to pick one.
  const lockedTransaction = !editing && Boolean(paramTransactionId);
  const [loading, setLoading] = useState(editing);
  const [status, setStatus] = useState(null); // 'active' | 'completed'
  // Create mode seeds from the tapped calendar date when it is still
  // pickable, otherwise the same suggestion the transaction form uses
  // (today at 9:00, stepping a day forward once 9:00 has passed). Edit mode
  // starts blank and hydrates from storage.
  const [date, setDate] = useState(() => {
    if (editing) return '';
    const suggested = suggestReminderValues();
    const usable =
      isValidLocalDate(paramDate) && !reminderValidationError(paramDate, suggested.time);
    return usable ? paramDate : suggested.date;
  });
  const [time, setTime] = useState(() => (editing ? '' : suggestReminderValues().time));
  const [notes, setNotes] = useState('');
  const [transactionId, setTransactionId] = useState(paramTransactionId);
  const [linkedTransaction, setLinkedTransaction] = useState(null);
  const [search, setSearch] = useState('');
  const [dateError, setDateError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  // The schedule as stored when editing began. Re-saving an overdue reminder
  // whose date and time were not touched is allowed (mirrors the repository
  // rule), so editing only the notes never traps the user on a past instant.
  const savedScheduleRef = useRef(null);
  // Latches the moment the user picks a day themselves, so the parent-budget
  // default below can never overwrite a deliberate choice.
  const dateTouchedRef = useRef(false);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  // A reminder created from a transaction starts on that transaction's budget
  // day instead of today: a transaction belongs to its budget, so its own date
  // can sit outside the budget's period and is not the parent's date. The
  // budget is reached through the linked transaction's `budget_id`, never
  // through the transaction's own date. Only a create opened pre-linked is
  // touched: an edited reminder hydrates from its stored row, and a
  // standalone one keeps the tapped or suggested day. A budget with no usable
  // day leaves that existing day in place.
  useEffect(() => {
    if (editing || !paramTransactionId) return undefined;
    let cancelled = false;

    // The link is followed read-only — the reminder row is still written only
    // on save — so a failed lookup just leaves the suggested day untouched.
    fetchTransaction(paramTransactionId)
      .then((transaction) =>
        transaction?.budget_id ? fetchBudget(transaction.budget_id) : null,
      )
      .catch(() => null)
      .then((budget) => {
        if (cancelled || dateTouchedRef.current) return;
        if (isValidLocalDate(budget?.start_date)) setDate(budget.start_date);
      });

    return () => {
      cancelled = true;
    };
  }, [editing, paramTransactionId, fetchTransaction, fetchBudget]);

  // Hydrate the editor from the stored row when editing.
  useEffect(() => {
    if (!editing) return undefined;
    let cancelled = false;

    fetchReminder(reminderId)
      .then((row) => {
        if (cancelled || !row) {
          if (!row) setFormError('That reminder no longer exists.');
          return;
        }
        setDate(row.remind_date);
        setTime(row.remind_time);
        setNotes(row.notes ?? '');
        setTransactionId(row.transaction_id);
        setStatus(row.status);
        savedScheduleRef.current = { date: row.remind_date, time: row.remind_time };
      })
      .catch((error) => {
        if (!cancelled) setFormError(error?.message ?? 'Could not load this reminder.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editing, reminderId, fetchReminder]);

  // Show what the current link points at, so the row is more than an id.
  // Picking and unlinking set the companion row directly in their handlers.
  useEffect(() => {
    if (!transactionId) return undefined;
    let cancelled = false;
    fetchTransaction(transactionId)
      .then((row) => {
        if (!cancelled) setLinkedTransaction(row);
      })
      .catch(() => {
        if (!cancelled) setLinkedTransaction(null);
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId, fetchTransaction]);

  const statusLabel = useMemo(() => {
    if (!status) return null;
    const derived = deriveReminderStatus({
      status,
      remind_at: buildRemindAt(date, time) ?? null,
    });
    return REMINDER_STATUS_LABELS[derived] ?? null;
  }, [status, date, time]);

  const leave = useCallback(() => {
    resetLinkSearch();
    if (navigation.canGoBack()) router.back();
    else router.replace('/calendar');
  }, [navigation, resetLinkSearch]);

  function handlePickDate(day) {
    dateTouchedRef.current = true;
    setDate(day);
  }

  async function handleSave() {
    // Mirrors updateReminder's rule: only a changed schedule must be in the
    // future, so an overdue reminder can still be saved when just its notes
    // or link were edited.
    const saved = savedScheduleRef.current;
    const scheduleUntouched =
      editing && saved && saved.date === date && saved.time === time;
    const error = scheduleUntouched ? null : reminderValidationError(date, time);
    if (error) {
      setDateError(error);
      return;
    }
    setDateError(null);
    setFormError(null);
    setSaving(true);
    try {
      const input = { date, time, notes: notes.trim(), transactionId: transactionId ?? null };
      const outcome = editing
        ? await editReminder(reminderId, input)
        : await addReminder(input);
      announceOutcome(outcome);
      await loadDay();
      leave();
    } catch (caught) {
      setFormError(caught?.message ?? 'Could not save this reminder.');
    } finally {
      setSaving(false);
    }
  }

  function handleComplete() {
    Alert.alert('Mark as completed?', 'The reminder stops notifying and moves to Completed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          try {
            await completeReminder(reminderId);
            await loadDay();
            leave();
          } catch (error) {
            setFormError(error?.message ?? 'Could not complete this reminder.');
          }
        },
      },
    ]);
  }

  function handleDelete() {
    Alert.alert('Delete reminder?', 'This removes the reminder and its notification.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeReminder(reminderId);
            await loadDay();
            leave();
          } catch (error) {
            setFormError(error?.message ?? 'Could not delete this reminder.');
          }
        },
      },
    ]);
  }

  function pickTransaction(transaction) {
    setTransactionId(transaction.id);
    setLinkedTransaction(transaction);
    setSearch('');
    resetLinkSearch();
  }

  function unlinkTransaction() {
    setTransactionId(null);
    setLinkedTransaction(null);
  }

  if (loading) {
    return (
      <Screen>
        <EmptyState icon="clock" title="Loading reminder…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.formBody}>
      {statusLabel ? (
        <View
          style={[
            styles.statusRow,
            { backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
          ]}
        >
          <Icon
            name={status === 'completed' ? 'check' : 'clock'}
            size={16}
            color={status === 'completed' ? colors.income : colors.warning}
          />
          <Text
            variant="caption"
            tone={status === 'completed' ? 'income' : 'default'}
          >
            {statusLabel}
          </Text>
        </View>
      ) : null}

      <SectionHeader title="Reminder" />
      <Card style={{ marginBottom: spacing.md }}>
        <DatePicker
          label="Reminder Date"
          title="Reminder Date"
          value={date}
          onChange={handlePickDate}
          minimumDate={toIsoDate(new Date())}
          error={dateError}
        />
        <TimePicker
          label="Reminder Time"
          title="Reminder Time"
          value={time}
          onChange={setTime}
        />
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="What do you need to remember?"
          multiline
          numberOfLines={3}
          maxLength={200}
          inputStyle={{ textAlignVertical: 'top' }}
        />
      </Card>

      <SectionHeader title="Linked transaction" />
      <Card style={{ marginBottom: spacing.md }}>
        {linkedTransaction ? (
          <View
            style={[
              styles.linkRow,
              lockedTransaction
                ? { marginBottom: 0, borderBottomWidth: 0 }
                : { borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.linkCopy}>
              <Text variant="body" numberOfLines={1}>
                {linkedTransaction.description || 'Transaction'}
              </Text>
              <Text variant="caption" tone="muted">
                {formatDate(linkedTransaction.transaction_date)} ·{' '}
                {formatCurrency(linkedTransaction.amount)}
              </Text>
            </View>
            {lockedTransaction ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unlink transaction"
                onPress={unlinkTransaction}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
              >
                <Icon name="close" size={18} color={colors.textFaint} />
              </Pressable>
            )}
          </View>
        ) : (
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
            {lockedTransaction
              ? 'Linked to this transaction.'
              : 'None — this is a standalone reminder. Search below to link one.'}
          </Text>
        )}

        {lockedTransaction ? null : (
          <>
            <TextField
              label="Find a transaction"
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                searchLink(value);
              }}
              placeholder="Search by description or tag"
              autoCapitalize="none"
            />

            {linkResults.map((transaction) => (
              <Pressable
                key={transaction.id}
                accessibilityRole="button"
                onPress={() => pickTransaction(transaction)}
                style={({ pressed }) => [
                  styles.resultRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View style={styles.linkCopy}>
                  <Text variant="body" numberOfLines={1}>
                    {transaction.description || 'Transaction'}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {transaction.budget_name ? `${transaction.budget_name} · ` : ''}
                    {formatDate(transaction.transaction_date)} ·{' '}
                    {formatCurrency(transaction.amount)}
                  </Text>
                </View>
                <Icon name="add" size={18} color={colors.primary} />
              </Pressable>
            ))}
          </>
        )}
      </Card>

      {formError ? (
        <Text variant="caption" tone="expense" style={{ marginBottom: spacing.md }}>
          {formError}
        </Text>
      ) : null}
      </View>

      <View>
        <Button
          label={saving ? 'Saving…' : 'Save reminder'}
          icon={saving ? undefined : 'check'}
          onPress={handleSave}
          disabled={saving}
          style={{ marginBottom: spacing.md }}
        />

        {editing && status === 'active' ? (
          <Button
            label="Mark as completed"
            icon="paid"
            variant="secondary"
            onPress={handleComplete}
            style={{ marginBottom: spacing.md }}
          />
        ) : null}

        {editing ? <Button label="Delete reminder" icon="trash" variant="danger" onPress={handleDelete} /> : null}
      </View>

      {permission?.supported === false || permission?.granted === false ? (
        <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
          Notifications are turned off for Budgetarian, so this reminder cannot fire
          yet. You can still save it.
        </Text>
      ) : null}
    </Screen>
  );
}

/**
 * The device cannot deliver a reminder — never a reason to lose the save.
 * Mirrors the transaction form's outcome announcements.
 */
function announceOutcome(outcome) {
  if (outcome?.status === 'scheduled') {
    showToast('Reminder saved');
    return;
  }
  if (outcome?.status === 'blocked') {
    Alert.alert(
      'Notifications are off',
      'Your reminder is saved, but Budgetarian cannot show it until notifications are allowed for this app.',
    );
    return;
  }
  if (outcome?.status === 'unsupported') {
    showToast('Reminder saved — notifications arrive in the Android app.');
    return;
  }
  if (outcome?.status === 'failed') {
    Alert.alert(
      'Reminder saved',
      'Budgetarian could not schedule the notification and will try again the next time it opens.',
    );
    return;
  }
  showToast('Reminder saved');
}

const styles = StyleSheet.create({
  formBody: {
    flexGrow: 1,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
  },
  linkCopy: {
    flex: 1,
    minWidth: 0,
  },
  resultRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
});
