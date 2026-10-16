import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePicker } from '../dates/DatePicker';
import { TimePicker } from '../dates/TimePicker';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/ThemeProvider';
import { isIsoCalendarDate } from '../../utils/breakdown';
import { getCurrency, fromMinor, toMinor } from '../../utils/currency';
import { nowTime, toIsoDate } from '../../utils/dates';

const TYPE_OPTIONS = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'adjustment', label: 'Adjustment' },
];

const NEGATIVE_TOTAL_ERROR = 'The breakdown total cannot be negative.';

/**
 * Bottom sheet that adds or edits one breakdown item, mirroring the shared
 * TimeSheet/CalendarSheet modal pattern. Values live in local pending state:
 *
 *  - Add mode keeps the sheet open so items can be entered consecutively:
 *    "Add item" commits the draft (the parent form appends it and recalculates)
 *    and resets the fields to `defaultPurchaseDate` / now; "Done" closes.
 *    Closing with unsubmitted input asks first — continue editing or discard
 *    just the draft.
 *  - Edit mode commits on "Done" AND on dismissal; edits that fail validation
 *    stay in the sheet, never on the list.
 *
 * Entry type is Purchase (+) or Adjustment (−); the user always types a
 * non-negative amount and the sign follows the type. Switching type when the
 * switched sign would push the parent's total negative is rejected in place,
 * with the entered amount and description untouched. The repository re-checks
 * the same rule, so the sheet can only ever show what a save would accept.
 *
 * `defaultPurchaseDate` seeds a new item's Purchase date — the parent
 * transaction's budget day, passed down by the form — so an item added while
 * editing an existing transaction lands in the budget it belongs to instead
 * of today. Both entry types share the one field, an item being edited always
 * keeps its own saved date, and a caller with no usable day falls back to
 * today's local date. The field is local pending state: the sheet never
 * writes to the budget or the parent transaction.
 */
export function SubTransactionSheet({
  item,
  currency,
  otherTotal = 0,
  defaultPurchaseDate,
  onAddItem,
  onApplyItem,
  onClose,
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const config = getCurrency(currency);
  const isEdit = Boolean(item);

  const [entryType, setEntryType] = useState(item && item.amount < 0 ? 'adjustment' : 'purchase');
  const [description, setDescription] = useState(item?.description ?? '');
  const [amount, setAmount] = useState(() =>
    item ? String(fromMinor(Math.abs(item.amount), currency)) : '',
  );
  const [purchaseDate, setPurchaseDate] = useState(
    item?.purchase_date ?? defaultItemDate(defaultPurchaseDate),
  );
  const [purchaseTime, setPurchaseTime] = useState(
    item?.purchase_time ?? nowTime(),
  );
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [notesVisible, setNotesVisible] = useState(Boolean(item?.notes));
  const [errors, setErrors] = useState({});

  // One commit per open: a double tap must never add or overwrite twice.
  const savedRef = useRef(false);

  const sign = entryType === 'adjustment' ? -1 : 1;

  function fieldErrors() {
    const next = {};
    if (!description.trim()) next.description = 'Enter a description.';
    if (amount === '') next.amount = 'Enter an amount.';
    else if (toMinor(amount, currency) < 0) next.amount = 'Enter a valid amount.';
    return next;
  }

  function draft() {
    return {
      id: item?.id,
      description: description.trim(),
      amount: sign * toMinor(amount, currency),
      purchase_date: purchaseDate,
      purchase_time: purchaseTime || null,
      notes: notesVisible ? notes.trim() || null : null,
    };
  }

  function hasUnsubmittedInput() {
    return description.trim() !== '' || amount !== '' || (notesVisible && notes.trim() !== '');
  }

  function handleTypeChange(next) {
    if (next === entryType) return;
    // The switch must never be able to make the total negative — reject it
    // and explain, keeping the typed amount and description intact.
    const minor = amount === '' ? 0 : toMinor(amount, currency);
    if (otherTotal + (next === 'adjustment' ? -1 : 1) * minor < 0) {
      setErrors((current) => ({ ...current, amount: NEGATIVE_TOTAL_ERROR }));
      return;
    }
    setEntryType(next);
    setErrors(({ amount: _dropped, ...rest }) => rest);
  }

  function commitDraft() {
    const invalid = fieldErrors();
    if (Object.keys(invalid).length === 0 && otherTotal + sign * toMinor(amount, currency) < 0) {
      invalid.amount = NEGATIVE_TOTAL_ERROR;
    }
    if (Object.keys(invalid).length > 0) {
      setErrors(invalid);
      return false;
    }
    setErrors({});
    (isEdit ? onApplyItem : onAddItem)(draft());
    return true;
  }

  function handleAddItem() {
    if (isEdit) return;
    if (!commitDraft()) return;
    // Reset for the next item: empty money fields, the caller's default
    // purchase day and the current local time.
    setDescription('');
    setAmount('');
    setEntryType('purchase');
    setPurchaseDate(defaultItemDate(defaultPurchaseDate));
    setPurchaseTime(nowTime());
    setNotes('');
    setNotesVisible(false);
  }

  function handleDone() {
    if (isEdit) {
      // Dismissal applies valid edits; invalid ones stay for correction. One
      // commit per open: a double tap must never write the edit twice.
      if (savedRef.current) return;
      if (commitDraft()) {
        savedRef.current = true;
        onClose();
      }
      return;
    }
    if (!hasUnsubmittedInput()) {
      onClose();
      return;
    }
    askDiscard();
  }

  function askDiscard() {
    Alert.alert(
      'Unsubmitted item',
      'This sheet holds an item that has not been added yet.',
      [
        { text: 'Continue editing', style: 'cancel' },
        { text: 'Discard input', onPress: onClose },
      ],
    );
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={handleDone} accessibilityViewIsModal>
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss breakdown item"
          onPress={handleDone}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.sheetScroll}
          contentContainerStyle={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg,
              paddingHorizontal: spacing.lg,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text variant="heading" accessibilityRole="header" style={styles.title}>
              {isEdit ? 'Edit item' : 'Add item'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close breakdown item"
              onPress={handleDone}
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Rice, fuel, discount…"
            error={errors.description}
            returnKeyType="next"
            style={{ marginTop: spacing.sm }}
          />

          <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
            Amount
          </Text>
          <SegmentedControl
            options={TYPE_OPTIONS}
            value={entryType}
            onChange={handleTypeChange}
            style={{ marginBottom: spacing.sm }}
          />
          <AmountInput
            symbol={config.symbol}
            value={amount}
            onChangeText={setAmount}
            decimalPlaces={config.minorUnits}
          />
          {errors.amount ? (
            <Text variant="caption" tone="expense" style={{ marginTop: spacing.xs }}>
              {errors.amount}
            </Text>
          ) : null}
          <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
            {formatPreview(sign, amount, currency)} · Purchase adds, Adjustment subtracts.
          </Text>

          <View style={{ marginTop: spacing.md }}>
            <DatePicker
              label="Purchase date"
              title="Purchase Date"
              value={purchaseDate}
              onChange={setPurchaseDate}
            />
            <TimePicker
              label="Purchase time"
              title="Purchase Time"
              value={purchaseTime}
              onChange={setPurchaseTime}
            />
          </View>

          {notesVisible ? (
            <TextField
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Card used, receipt number…"
              multiline
              numberOfLines={4}
              inputStyle={{
                borderRadius: 16,
                minHeight: 96,
                paddingTop: spacing.md,
                textAlignVertical: 'top',
              }}
              style={{ marginBottom: spacing.sm }}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add note"
              onPress={() => setNotesVisible(true)}
              hitSlop={6}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginBottom: spacing.sm }]}
            >
              <Text variant="label" tone="primary">
                + Add note
              </Text>
            </Pressable>
          )}

          <View style={[styles.footer, { marginTop: spacing.md }]}>
            {isEdit ? (
              <Button label="Done" icon="check" onPress={handleDone} style={styles.footerButton} />
            ) : (
              <>
                <Button
                  label="Done"
                  icon="check"
                  variant="secondary"
                  onPress={handleDone}
                  style={styles.footerButton}
                />
                <Button label="Add item" icon="add" onPress={handleAddItem} style={styles.footerButton} />
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * The local day a new breakdown item starts on: the caller's preferred day —
 * the parent budget's own date — when it is a real 'YYYY-MM-DD' calendar day,
 * and today's local date otherwise. The stored string is used as-is, so no
 * UTC conversion can shift the day; the field can therefore never hold an
 * invalid date.
 */
function defaultItemDate(preferred) {
  return isIsoCalendarDate(preferred) ? preferred : toIsoDate(new Date());
}

/** Signed live preview, e.g. '+₱1,000.00' / '-₱100.00'; never a double negative. */
function formatPreview(sign, amount, currency) {
  const minor = toMinor(amount, currency);
  if (amount === '' || minor === 0) return ' ';
  const { symbol } = getCurrency(currency);
  return `${sign < 0 ? '-' : '+'}${symbol}${fromMinor(minor, currency)}`;
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheet: {
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    borderRadius: 999,
    height: 4,
    marginBottom: 8,
    width: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingBottom: 4,
  },
  title: {
    flex: 1,
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
  },
  footerButton: {
    flex: 1,
  },
});
