import {
  router,
  Stack,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, View } from 'react-native';

import { DatePicker } from '../../components/dates/DatePicker';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Screen, SectionHeader } from '../../components/ui/Screen';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { useTheme } from '../../components/ui/ThemeProvider';
import { PendingReminders } from '../../components/reminders/PendingReminders';
import { TransactionReminders } from '../../components/reminders/TransactionReminders';
import { useBudgetDetailStore } from '../../stores/budgetDetailStore';
import { useRemindersStore } from '../../stores/remindersStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTagsStore } from '../../stores/tagsStore';
import { formatCurrency, fromMinor, getCurrency, toMinor } from '../../utils/currency';
import { formatShortDate, parseFlexibleDate, toIsoDate } from '../../utils/dates';
import { PAYMENT_OPTIONS, effectivePaymentStatus } from '../../utils/paymentStatus';
import { showToast } from '../../stores/toastStore';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

const DATE_CHIPS = [
  { label: 'Today', offset: 0 },
  { label: 'Yesterday', offset: 1 },
];

/** Today minus `offset` days, as a local 'YYYY-MM-DD' value. */
function offsetIso(offset) {
  const target = new Date();
  target.setDate(target.getDate() - offset);
  return toIsoDate(target);
}

/**
 * New transactions normally start today. If this form is opened from a budget
 * that has not started yet, seed the Date field from the budget's first day so
 * the entry lands in the intended month instead of today.
 */
function defaultNewTransactionDate(budget) {
  const today = toIsoDate(new Date());
  if (!budget?.start_date || budget.start_date <= today) return today;
  return budget.start_date;
}

/**
 * Normalized, deterministic snapshot for the dirty check: amounts are minor
 * units, dates ISO, description trimmed, and payment status only meaningful
 * for expenses. Serialized with one literal key order, so equal values always
 * compare equal — restoring a field to its original value makes the form
 * clean again.
 *
 * An existing transaction's reminders are managed separately (the shared
 * reminder form), so they are not part of the snapshot: adding, editing or
 * removing a reminder must never make the transaction form look dirty.
 */
function formSnapshot(values) {
  return JSON.stringify({
    type: values.type,
    paymentStatus: values.type === 'expense' ? values.paymentStatus : null,
    amountMinor: values.amountMinor,
    tagId: values.tagId || null,
    date: values.date,
    description: values.description?.trim() ? values.description.trim() : null,
  });
}

/** The saved baseline a loaded row starts from. */
function snapshotOfRow(row) {
  return formSnapshot({
    type: row.type,
    paymentStatus: effectivePaymentStatus(row) ?? 'paid',
    amountMinor: row.amount,
    tagId: row.tag_id,
    date: row.transaction_date,
    description: row.description,
  });
}

/**
 * Budgets are period containers, so a transaction dated outside its folder's
 * range inflates date-driven views like Reports. Returns { iso } when the
 * value falls outside the budget's start–end dates — unless it equals the
 * row's already-saved date, which keeps editing an existing out-of-period
 * row (a data fix, a tag change) from re-triggering the confirmation.
 */
function periodStatus(dateValue, budget, savedDate) {
  if (!budget?.start_date || !budget?.end_date) return null;
  // parseFlexibleDate returns a 'YYYY-MM-DD' string (see utils/dates.js),
  // not a Date — pass it straight through; toIsoDate would call
  // getFullYear() on a string and throw.
  const iso = parseFlexibleDate(dateValue);
  if (!iso) return null;
  if (iso >= budget.start_date && iso <= budget.end_date) return null;
  if (savedDate && iso === savedDate) return null;
  return { iso };
}

function askPeriodConfirmation(outside, budget, onProceed) {
  Alert.alert(
    'Outside this folder’s period',
    `This transaction is dated ${formatShortDate(outside.iso)}, but ${
      budget?.name ?? 'this folder'
    } covers ${formatShortDate(budget?.start_date)} – ${formatShortDate(
      budget?.end_date,
    )}. Save it anyway?`,
    [
      { text: 'Save anyway', onPress: onProceed },
      { text: 'Adjust the date', style: 'cancel' },
    ],
  );
}

function validateFields(f, currency) {
  const nextErrors = {};
  const resolvedDate = parseFlexibleDate(f.date);
  const minorAmount = toMinor(f.amount, currency);

  if (minorAmount <= 0) nextErrors.amount = 'Enter an amount greater than zero.';
  if (f.type !== 'transfer' && !f.tagId) nextErrors.tag = 'Choose a tag.';
  if (!resolvedDate) nextErrors.date = 'Pick a date.';
  return nextErrors;
}

/**
 * Assumes validateFields passed. Reminders are not part of the transaction
 * payload: an edit leaves them untouched, and a new transaction's staged
 * reminders are created separately once the row exists.
 */
function buildPayload(f, currency) {
  return {
    type: f.type,
    amount: toMinor(f.amount, currency),
    tagId: f.tagId,
    description: f.description.trim() || null,
    date: parseFlexibleDate(f.date),
    paymentStatus: f.type === 'expense' ? f.paymentStatus : null,
  };
}

function openDeviceSettings() {
  if (Platform.OS !== 'web') Linking.openSettings();
}

/** The device cannot deliver a reminder — never a reason to lose the save. */
function announceReminderOutcome(outcome) {
  if (!outcome) return;
  if (outcome.status === 'blocked') {
    Alert.alert(
      'Notifications are off',
      'Your reminder is saved, but MoneyQ cannot show it until notifications are allowed for this app.',
      [
        { text: 'Open Settings', onPress: openDeviceSettings },
        { text: 'Not now', style: 'cancel' },
      ],
    );
  } else if (outcome.status === 'failed') {
    Alert.alert(
      'Reminder saved',
      'The notification could not be scheduled. MoneyQ will try again the next time it opens.',
    );
  }
}

/**
 * Announces the most important of several reminder outcomes (a new
 * transaction can stage more than one): a blocked or failed schedule is
 * surfaced once, never as several stacked alerts.
 */
function announceReminderOutcomes(outcomes) {
  const notable = outcomes.find(
    (outcome) => outcome?.status === 'blocked' || outcome?.status === 'failed',
  );
  if (notable) announceReminderOutcome(notable);
}

export default function TransactionFormScreen() {
  const params = useLocalSearchParams();
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const tags = useTagsStore((state) => state.tags);
  const loadTags = useTagsStore((state) => state.load);
  const addTransaction = useBudgetDetailStore((state) => state.addTransaction);
  const updateTransaction = useBudgetDetailStore((state) => state.updateTransaction);
  const entries = useBudgetDetailStore((state) => state.entries);
  const storeBudgetId = useBudgetDetailStore((state) => state.budgetId);
  const budget = useBudgetDetailStore((state) => state.budget);
  const isLoadingBudget = useBudgetDetailStore((state) => state.isLoading);
  const loadBudget = useBudgetDetailStore((state) => state.load);
  const refreshPermission = useRemindersStore((state) => state.refreshPermission);
  const permission = useRemindersStore((state) => state.permission);
  const addReminder = useRemindersStore((state) => state.addReminder);

  const budgetId = typeof params.budgetId === 'string' ? params.budgetId : '';
  const preselectedTagId = typeof params.tagId === 'string' ? params.tagId : '';
  const transactionId = typeof params.transactionId === 'string' ? params.transactionId : '';
  const editing = transactionId
    ? entries.find((entry) => entry.id === transactionId) ?? null
    : null;

  const [type, setType] = useState('expense');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [amount, setAmount] = useState('');
  const [tagId, setTagId] = useState(preselectedTagId);
  const [date, setDate] = useState(() =>
    storeBudgetId === budgetId && budget?.id === budgetId
      ? defaultNewTransactionDate(budget)
      : toIsoDate(new Date()),
  );
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [pendingReminders, setPendingReminders] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [hydratedFrom, setHydratedFrom] = useState(null);

  // Auto-save state (edit mode only): one save at a time, at most one
  // scheduled departure, and the freshest saved-row snapshot so a listener
  // from an older render can never write the same values twice. Touched
  // only inside effects and navigation listeners.
  const savePromiseRef = useRef(null);
  const leavePlannedRef = useRef(false);
  const rowSnapshotRef = useRef(null);
  const dateEditedRef = useRef(false);
  const navigation = useNavigation();

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  // A transaction can be opened without its budget screen in front of it —
  // from a tapped notification — so make sure the store actually holds this
  // entry before deciding it is missing.
  const loadRequestedFor = useRef(null);
  useEffect(() => {
    if (!transactionId || !budgetId) return;
    if (storeBudgetId === budgetId && entries.some((entry) => entry.id === transactionId)) return;
    // A ref, not state: the guard must not trigger a render of its own, and
    // it is keyed so opening a second entry still asks the store for it.
    const key = `${budgetId}:${transactionId}`;
    if (loadRequestedFor.current === key) return;
    loadRequestedFor.current = key;
    loadBudget(budgetId);
  }, [transactionId, budgetId, storeBudgetId, entries, loadBudget]);

  // New transactions from a not-yet-started budget should default to that
  // budget's first day. Only seed a date the user has not already chosen.
  useEffect(() => {
    if (transactionId || !budgetId) return;
    if (storeBudgetId !== budgetId || budget?.id !== budgetId) return;
    if (dateEditedRef.current) return;
    const suggested = defaultNewTransactionDate(budget);
    setDate((current) => (current === suggested ? current : suggested));
  }, [transactionId, budgetId, storeBudgetId, budget]);

  function applyDate(nextDate) {
    dateEditedRef.current = true;
    setDate(nextDate);
  }

  // Seed the form from the stored row while rendering: the modal opens over
  // the budget detail screen, whose store already holds the entry. React
  // re-runs the render right after these updates, so there is no effect and
  // no flash of empty fields.
  if (editing && hydratedFrom !== editing.id) {
    setHydratedFrom(editing.id);
    setType(editing.type);
    setPaymentStatus(effectivePaymentStatus(editing) ?? 'paid');
    setAmount(String(fromMinor(editing.amount, currency)));
    setTagId(editing.tag_id ?? '');
    setDate(editing.transaction_date);
    setDescription(editing.description ?? '');
  }

  // Transfers have no creation UI yet, but an existing one must stay editable.
  const typeOptions = useMemo(() => {
    if (!editing || TYPE_OPTIONS.some((option) => option.value === editing.type)) {
      return TYPE_OPTIONS;
    }
    return [
      ...TYPE_OPTIONS,
      { value: editing.type, label: editing.type === 'transfer' ? 'Transfer' : editing.type },
    ];
  }, [editing]);

  const visibleTags = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(needle));
  }, [tags, query]);

  const stillLoading = Boolean(transactionId) && (isLoadingBudget || storeBudgetId !== budgetId);

  const outsidePeriod = periodStatus(date, budget, editing?.transaction_date);
  const futureBudget =
    !transactionId &&
    Boolean(budget) &&
    budget.id === budgetId &&
    storeBudgetId === budgetId &&
    budget.start_date > toIsoDate(new Date());

  // Mirror of the saved row, refreshed whenever the store reloads it. Read
  // inside autoSave so a listener from an older render cannot write twice.
  useEffect(() => {
    rowSnapshotRef.current = editing && hydratedFrom === editing.id ? snapshotOfRow(editing) : null;
  }, [editing, hydratedFrom]);

  // Auto-save for edits: leaving the page (back button, header back, Android
  // hardware back, modal dismiss, or pushing another screen over the form)
  // saves real changes exactly once. The effect only subscribes while the
  // form is meaningfully dirty — comparing normalized snapshots, so
  // restoring a field to its saved value counts as no change. An untouched
  // visit therefore performs zero update calls, zero writes, zero toasts.
  // After a save the store reloads the row, the snapshot re-derives equal to
  // it, listeners unsubscribe, and the scheduled router.back() leaves cleanly.
  useEffect(() => {
    if (!transactionId || !editing || hydratedFrom !== editing.id) return undefined;

    const fields = {
      type,
      paymentStatus,
      amount,
      tagId,
      date,
      description,
    };
    const snapshot = formSnapshot({
      type,
      paymentStatus,
      amountMinor: toMinor(amount, currency),
      tagId,
      date,
      description,
    });
    if (snapshot === snapshotOfRow(editing)) return undefined;

    async function autoSave(skipPeriodCheck = false) {
      // Re-check against the freshest saved row: an in-flight reload may
      // already hold these values, making this save a duplicate.
      const fresh = rowSnapshotRef.current;
      if (fresh !== null && snapshot === fresh) return 'saved';

      if (!skipPeriodCheck && periodStatus(date, budget, editing?.transaction_date)) {
        return 'confirm';
      }

      const nextErrors = validateFields(fields, currency);
      if (Object.keys(nextErrors).length > 0) {
        // Invalid edits are never silently dropped: hold the departure and
        // show what needs fixing.
        setErrors(nextErrors);
        showToast('Some fields need attention before this can be saved.', 'warning');
        return 'invalid';
      }

      setErrors({});
      try {
        await updateTransaction({
          id: transactionId,
          ...buildPayload(fields, currency),
        });
        rowSnapshotRef.current = snapshot;
        showToast('Changes saved successfully', 'success');
        return 'saved';
      } catch {
        showToast("Couldn't save changes. Please try again.", 'error');
        return 'failed';
      }
    }

    // One save at a time, whichever lifecycle path asked for it.
    function ensureSave(skipPeriodCheck = false) {
      if (!savePromiseRef.current) {
        savePromiseRef.current = autoSave(skipPeriodCheck).finally(() => {
          savePromiseRef.current = null;
        });
      }
      return savePromiseRef.current;
    }

    function askPeriod() {
      const outside = periodStatus(date, budget, editing?.transaction_date);
      if (!outside) return;
      askPeriodConfirmation(outside, budget, () => {
        ensureSave(true).then((outcome) => {
          const wasLeaving = leavePlannedRef.current;
          leavePlannedRef.current = false;
          if (outcome === 'saved' && wasLeaving) router.back();
        });
      });
    }

    const beforeRemove = (event) => {
      // The save may already have landed (store reloaded or our own write):
      // treat that as clean and let this departure through untouched.
      if (rowSnapshotRef.current !== null && snapshot === rowSnapshotRef.current) return;
      event.preventDefault();
      if (leavePlannedRef.current) return; // a departure is already scheduled.
      leavePlannedRef.current = true;
      ensureSave().then((outcome) => {
        if (outcome === 'confirm') {
          leavePlannedRef.current = false;
          askPeriod();
          return;
        }
        leavePlannedRef.current = false;
        if (outcome === 'saved') router.back();
      });
    };

    // Blur also saves: pushing "Add or rename tags" over the form must not
    // strand edits, and a swipe-dismiss that already removed the screen
    // still lands here before unmount.
    const onBlur = () => {
      if (rowSnapshotRef.current !== null && snapshot === rowSnapshotRef.current) return;
      ensureSave().then((outcome) => {
        if (outcome === 'confirm') askPeriod();
      });
    };

    const unsubscribeRemove = navigation.addListener('beforeRemove', beforeRemove);
    const unsubscribeBlur = navigation.addListener('blur', onBlur);
    return () => {
      unsubscribeRemove();
      unsubscribeBlur();
    };
  }, [
    transactionId,
    editing,
    hydratedFrom,
    type,
    paymentStatus,
    amount,
    tagId,
    date,
    description,
    currency,
    budget,
    editing?.transaction_date,
    updateTransaction,
    navigation,
  ]);

  // Create mode keeps its explicit button: a half-typed new transaction left
  // by mistake should not land in the budget.
  async function handleSave(opts) {
    if (opts?.skipPeriodCheck !== true && outsidePeriod) {
      askPeriodConfirmation(outsidePeriod, budget, () =>
        handleSave({ skipPeriodCheck: true }),
      );
      return;
    }
    const fields = {
      type,
      paymentStatus,
      amount,
      tagId,
      date,
      description,
    };
    const nextErrors = validateFields(fields, currency);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const { transaction } = await addTransaction({
        budgetId,
        ...buildPayload(fields, currency),
      });
      // Reminders staged in this form are created now, linked to the row that
      // was just written. The transaction is already saved, so a single
      // reminder failure is reported by outcome, never as a failed save.
      const outcomes = [];
      for (const reminder of pendingReminders) {
        try {
          outcomes.push(
            await addReminder({
              date: reminder.remind_date,
              time: reminder.remind_time,
              notes: reminder.notes ?? '',
              transactionId: transaction.id,
            }),
          );
        } catch {
          // Keep the saved transaction; move on to the next reminder.
        }
      }
      router.back();
      announceReminderOutcomes(outcomes);
    } catch (error) {
      setSaving(false);
      Alert.alert('Could not save', error?.message ?? 'Please try again.');
    }
  }

  if (!budgetId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="list"
          title="No budget selected"
          description="Open a budget first, then add a transaction from inside it."
        >
          <Button label="Back to Home" onPress={() => router.replace('/')} />
        </EmptyState>
      </View>
    );
  }

  if (transactionId && !editing && stillLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
          Opening transaction…
        </Text>
      </View>
    );
  }

  if (transactionId && !editing && hydratedFrom === null) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="list"
          title="Transaction not found"
          description="This entry may have been deleted. Go back and pick another one."
        >
          <Button label="Back" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: transactionId ? 'Edit Transaction' : 'Add Transaction' }} />

      <Screen contentContainerStyle={{ paddingBottom: 48 }}>
        <SectionHeader title="Type" />
        <SegmentedControl
          options={typeOptions}
          value={type}
          onChange={setType}
          style={{ marginBottom: spacing.lg }}
        />

        {type === 'expense' ? (
          <>
            <SectionHeader title="Payment" />
            <SegmentedControl
              options={PAYMENT_OPTIONS}
              value={paymentStatus}
              onChange={setPaymentStatus}
            />
            <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
              Unpaid expenses still count toward every budget total.
            </Text>
            <View style={{ height: spacing.lg }} />
          </>
        ) : null}

        <SectionHeader title="Amount" />
        <AmountInput
          symbol={getCurrency(currency).symbol}
          value={amount}
          onChangeText={setAmount}
          decimalPlaces={getCurrency(currency).minorUnits}
          autoFocus={!transactionId}
        />
        {errors.amount ? (
          <Text variant="caption" tone="expense" style={{ marginTop: spacing.xs }}>
            {errors.amount}
          </Text>
        ) : null}
        <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
          {formatCurrency(toMinor(amount, currency), { currency })}
        </Text>

        <View style={{ height: spacing.lg }} />

        <SectionHeader title="Tag" />
        {tags.length === 0 ? (
          <EmptyState
            icon="tag"
            title="No tags available"
            description="Tags group transactions by what you spent on. Add one to continue."
          >
            <Button label="Manage tags" onPress={() => router.push('/tags')} />
          </EmptyState>
        ) : (
          <>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Search tags"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{ marginBottom: spacing.sm }}
            />
            <View style={styles.wrap}>
              {visibleTags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  emoji={tag.emoji}
                  active={tag.id === tagId}
                  onPress={() => setTagId(tag.id === tagId ? '' : tag.id)}
                />
              ))}
            </View>
            {visibleTags.length === 0 ? (
              <Text variant="caption" tone="faint">
                No tag matches “{query.trim()}”.
              </Text>
            ) : null}
            {errors.tag ? (
              <Text variant="caption" tone="expense" style={{ marginTop: spacing.xs }}>
                {errors.tag}
              </Text>
            ) : null}
            <SecondaryLink label="Add or rename tags" onPress={() => router.push('/tags')} />
          </>
        )}

        <View style={{ height: spacing.lg }} />

        <SectionHeader title="Date" />
        <DatePicker
          label="Transaction Date"
          title="Transaction Date"
          value={date}
          onChange={applyDate}
          shortcuts
          error={errors.date}
          hint={
            transactionId
              ? undefined
              : futureBudget
                ? `New transactions start on ${formatShortDate(budget.start_date)}.`
                : 'New transactions start on today.'
          }
        />
        <View style={styles.wrap}>
          {DATE_CHIPS.map((chip) => (
            <Chip
              key={chip.offset}
              label={chip.label}
              active={date === offsetIso(chip.offset)}
              onPress={() => applyDate(offsetIso(chip.offset))}
            />
          ))}
        </View>
        {outsidePeriod ? (
          <Text variant="caption" tone="warning" style={{ marginTop: spacing.xs }}>
            Dated outside this folder’s period (
            {formatShortDate(budget?.start_date)} – {formatShortDate(budget?.end_date)});
            saving it will ask you to confirm.
          </Text>
        ) : null}

        <View style={{ height: spacing.md }} />

        <SectionHeader title="Description" />
        <TextField
          value={description}
          onChangeText={setDescription}
          placeholder="Groceries, rent, salary…"
          returnKeyType="done"
        />

        <View style={{ height: spacing.lg }} />

        {transactionId ? (
          <TransactionReminders transactionId={transactionId} />
        ) : (
          <PendingReminders
            value={pendingReminders}
            onChange={setPendingReminders}
            permission={permission}
            onOpenSettings={openDeviceSettings}
          />
        )}

        {transactionId ? (
          <Text
            variant="caption"
            tone="faint"
            style={{ marginTop: spacing.md, textAlign: 'center' }}
          >
            Changes save automatically when you leave this screen.
          </Text>
        ) : (
          <>
            <View style={{ height: spacing.sm }} />
            <Button
              label={saving ? 'Saving…' : 'Add transaction'}
              onPress={handleSave}
              disabled={saving}
            />
          </>
        )}
      </Screen>
    </View>
  );
}

function SecondaryLink({ label, onPress }) {
  const { spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.xs }}>
      <Button label={label} variant="secondary" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
