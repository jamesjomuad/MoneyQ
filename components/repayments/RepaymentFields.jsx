import { StyleSheet, View } from 'react-native';

import { DatePicker } from '../dates/DatePicker';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SectionHeader } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { REPAYMENT_DIRECTION_LABELS } from '../../constants/finance';
import { formatShortDate, toIsoDate } from '../../utils/dates';

// 'none' is this control's own value for "not a repayment"; the domain
// stores that as a null direction, so the swap happens at the two edges.
const DIRECTION_OPTIONS = ['none', 'owed_to_me', 'owed_by_me'].map((value) => ({
  value,
  label: REPAYMENT_DIRECTION_LABELS[value],
}));

/**
 * Whether this entry is money owed or owing, when it is due, and — for an
 * existing transaction — its settlement state with an explicit Mark as Paid
 * control. Nothing here settles automatically: a due date that has passed
 * only changes how the row is coloured.
 */
export function RepaymentFields({
  direction,
  onDirectionChange,
  dueDate,
  onDueDateChange,
  errors = {},
  state,
  paidAt,
  isExisting = false,
  busy = false,
  onMarkPaid,
  onMarkUnpaid,
}) {
  const { spacing } = useTheme();
  const active = Boolean(direction);

  return (
    <>
      <SectionHeader title="Repayment" />
      <Card>
        <SegmentedControl
          options={DIRECTION_OPTIONS}
          value={direction || 'none'}
          onChange={(value) => onDirectionChange(value === 'none' ? null : value)}
        />

        {active ? (
          <>
            <View style={{ height: spacing.sm }} />
            <DatePicker
              label="Due Date"
              title="Due Date"
              value={dueDate}
              onChange={onDueDateChange}
              error={errors.dueDate}
              helperText={errors.dueDate ? undefined : 'When the money should be settled.'}
            />

            {isExisting ? (
              <View style={styles.statusBlock}>
                <Text variant="body" tone={stateTone(state)}>
                  {statusLabel(state, dueDate, paidAt)}
                </Text>
                {state === 'paid' ? (
                  <Button
                    label="Mark as Unpaid"
                    variant="secondary"
                    onPress={onMarkUnpaid}
                    disabled={busy}
                    style={{ marginTop: spacing.sm }}
                  />
                ) : (
                  <Button
                    label="Mark as Paid"
                    onPress={onMarkPaid}
                    disabled={busy}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </View>
            ) : (
              <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
                Starts as payment pending until you mark it paid.
              </Text>
            )}
          </>
        ) : null}
      </Card>
    </>
  );
}

function stateTone(state) {
  if (state === 'paid') return 'income';
  if (state === 'overdue') return 'expense';
  return 'default';
}

function statusLabel(state, dueDate, paidAt) {
  if (state === 'paid') {
    const paidOn = paidAt ? toIsoDate(new Date(paidAt)) : null;
    return paidOn ? `🟢 Paid · ${formatShortDate(paidOn)}` : '🟢 Paid';
  }
  const due = dueDate ? `Due ${formatShortDate(dueDate)}` : '';
  if (state === 'overdue') return `🔴 Overdue · ${due}`;
  return `🔵 Payment Pending · ${due}`;
}

const styles = StyleSheet.create({
  statusBlock: {
    marginTop: 4,
  },
});
