import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/ThemeProvider';
import { getCurrency, fromMinor, toMinor } from '../../utils/currency';

const SIGN_OPTIONS = [
  { value: 1, label: '+ Add' },
  { value: -1, label: '− Adjust' },
];

/**
 * Bottom sheet that adds or edits one breakdown item. Mounted (not toggled)
 * with the item to edit, mirroring TimeSheet/CalendarSheet: values live in
 * local pending state until Save commits them, so Cancel can never change
 * the list, and an edit pre-fills description, sign, and magnitude. The
 * positive/negative selector keeps negatives a tap, not a typed minus sign.
 */
export function SubTransactionSheet({ item, currency, onSave, onClose }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const config = getCurrency(currency);

  const [description, setDescription] = useState(item?.description ?? '');
  const [sign, setSign] = useState(item && item.amount < 0 ? -1 : 1);
  const [amount, setAmount] = useState(() =>
    item ? String(fromMinor(Math.abs(item.amount), currency)) : '',
  );
  const [errors, setErrors] = useState({});

  // One commit per open: a double tap must never add the item twice.
  const savedRef = useRef(false);

  function handleSave() {
    if (savedRef.current) return;
    const trimmed = description.trim();
    const nextErrors = {};
    if (!trimmed) nextErrors.description = 'Enter a description.';
    if (amount === '') nextErrors.amount = 'Enter an amount.';
    else if (toMinor(amount, currency) < 0) nextErrors.amount = 'Enter a valid amount.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    savedRef.current = true;
    onSave({
      id: item?.id,
      description: trimmed,
      amount: sign * toMinor(amount, currency),
    });
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss breakdown item"
          onPress={onClose}
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
              {item ? 'Edit item' : 'Add item'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close breakdown item"
              onPress={onClose}
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
            options={SIGN_OPTIONS}
            value={sign}
            onChange={setSign}
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
            {formatPreview(sign, amount, currency)}
          </Text>

          <View style={[styles.footer, { marginTop: spacing.lg }]}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
            <Button label={item ? 'Save item' : 'Add item'} onPress={handleSave} style={styles.footerButton} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
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
