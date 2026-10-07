import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

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
import { useBudgetDetailStore } from '../../stores/budgetDetailStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTagsStore } from '../../stores/tagsStore';
import { formatCurrency, fromMinor, getCurrency, toMinor } from '../../utils/currency';
import { parseFlexibleDate, toIsoDate } from '../../utils/dates';

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

export default function TransactionFormScreen() {
  const params = useLocalSearchParams();
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const tags = useTagsStore((state) => state.tags);
  const loadTags = useTagsStore((state) => state.load);
  const addTransaction = useBudgetDetailStore((state) => state.addTransaction);
  const updateTransaction = useBudgetDetailStore((state) => state.updateTransaction);
  const entries = useBudgetDetailStore((state) => state.entries);

  const budgetId = typeof params.budgetId === 'string' ? params.budgetId : '';
  const preselectedTagId = typeof params.tagId === 'string' ? params.tagId : '';
  const transactionId = typeof params.transactionId === 'string' ? params.transactionId : '';
  const editing = transactionId
    ? entries.find((entry) => entry.id === transactionId) ?? null
    : null;

  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [tagId, setTagId] = useState(preselectedTagId);
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [hydratedFrom, setHydratedFrom] = useState(null);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Seed the form from the stored row while rendering: the modal opens over
  // the budget detail screen, whose store already holds the entry. React
  // re-runs the render right after these updates, so there is no effect and
  // no flash of empty fields.
  if (editing && hydratedFrom !== editing.id) {
    setHydratedFrom(editing.id);
    setType(editing.type);
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

  async function handleSave() {
    const nextErrors = {};
    const resolvedDate = parseFlexibleDate(date);
    const minorAmount = toMinor(amount, currency);

    if (minorAmount <= 0) nextErrors.amount = 'Enter an amount greater than zero.';
    if (type !== 'transfer' && !tagId) nextErrors.tag = 'Choose a tag.';
    if (!resolvedDate) nextErrors.date = 'Pick a date.';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      if (transactionId) {
        await updateTransaction({
          id: transactionId,
          type,
          amount: minorAmount,
          tagId,
          description: description.trim() || null,
          date: resolvedDate,
        });
      } else {
        await addTransaction({
          budgetId,
          type,
          amount: minorAmount,
          tagId,
          description: description.trim() || null,
          date: resolvedDate,
        });
      }
      router.back();
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
          onChange={setDate}
          shortcuts
          error={errors.date}
          hint={transactionId ? undefined : 'New transactions start on today.'}
        />
        <View style={styles.wrap}>
          {DATE_CHIPS.map((chip) => (
            <Chip
              key={chip.offset}
              label={chip.label}
              active={date === offsetIso(chip.offset)}
              onPress={() => setDate(offsetIso(chip.offset))}
            />
          ))}
        </View>

        <View style={{ height: spacing.md }} />

        <SectionHeader title="Description" />
        <TextField
          value={description}
          onChangeText={setDescription}
          placeholder="Groceries, rent, salary…"
          returnKeyType="done"
        />

        <View style={{ height: spacing.sm }} />
        <Button
          label={saving ? 'Saving…' : transactionId ? 'Save changes' : 'Add transaction'}
          onPress={handleSave}
          disabled={saving}
        />
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