import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  REMINDER_STATUS_LABELS,
  deriveReminderStatus,
  formatReminderWhen,
  sortRemindersForList,
} from '../../utils/reminders';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { SectionHeader } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * The Reminder section shell, shared by the transaction view (a saved
 * transaction's reminders) and the new-transaction view (reminders staged in
 * the form before saving). It only draws what it is handed — the two callers
 * own where the data comes from and what adding or tapping a reminder means.
 *
 * `state` is one of:
 *   'loading' — a read is in flight;
 *   'error'   — the read failed;
 *   'ready'   — show the list, or the empty state when there is none.
 *
 * When the list is empty the section offers a single, centred "add"
 * affordance and hides the heading's plus; once reminders exist the heading's
 * plus takes over, so the two are never shown together.
 */
export function ReminderSection({
  reminders,
  state = 'ready',
  onAdd,
  onEdit,
  onRemove,
  emptyTitle = 'No reminders yet',
  emptyLabel = 'Add your first reminder',
}) {
  const { colors, spacing, radius } = useTheme();
  const ordered = useMemo(() => sortRemindersForList(reminders), [reminders]);
  const hasReminders = state === 'ready' && ordered.length > 0;

  return (
    <>
      <SectionHeader
        title="Reminders"
        action={
          hasReminders ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add reminder"
              onPress={onAdd}
              hitSlop={8}
              style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="add" size={20} color={colors.primary} />
            </Pressable>
          ) : null
        }
      />
      <Card>
        {state === 'loading' ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : state === 'error' ? (
          <Text variant="caption" tone="expense">
            Couldn’t load reminders for this transaction.
          </Text>
        ) : hasReminders ? (
          ordered.map((reminder, index) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              index={index}
              onPress={() => onEdit?.(reminder)}
              onRemove={onRemove ? () => onRemove(reminder) : undefined}
            />
          ))
        ) : (
          <EmptyState icon="clock" title={emptyTitle}>
            <View style={styles.emptyAction}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={emptyLabel}
                onPress={onAdd}
                style={({ pressed }) => [
                  styles.addCircle,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: radius.pill,
                    opacity: pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <Icon name="add" size={26} color={colors.onPrimary} />
              </Pressable>
              <Text
                variant="label"
                tone="primary"
                style={{ marginTop: spacing.sm, textAlign: 'center' }}
              >
                {emptyLabel}
              </Text>
            </View>
          </EmptyState>
        )}
      </Card>
    </>
  );
}

/**
 * One reminder row: its note (or a neutral label), the scheduled date and
 * time, and its status. A completed reminder reads as done — check icon,
 * struck-through title — so pending and finished reminders are easy to tell
 * apart at a glance. An optional remove control is shown only where removal
 * is meaningful (a reminder staged in the new-transaction form).
 */
function ReminderRow({ reminder, index, onPress, onRemove }) {
  const { colors, spacing } = useTheme();
  const status = deriveReminderStatus(reminder);
  const completed = status === 'completed';
  const statusColor = completed
    ? colors.income
    : status === 'overdue'
      ? colors.expense
      : colors.warning;
  const when = formatReminderWhen(reminder.remind_date, reminder.remind_time, { short: true });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit reminder ${reminder.notes || when}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.reminderRow,
        index > 0 && {
          marginTop: spacing.sm,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: spacing.sm,
        },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={completed ? 'check' : 'clock'} size={18} color={statusColor} />
      <View style={styles.reminderCopy}>
        <Text
          variant="body"
          numberOfLines={1}
          tone={completed ? 'faint' : 'default'}
          style={completed ? styles.completedTitle : null}
        >
          {reminder.notes || 'Reminder'}
        </Text>
        <Text variant="caption" tone={completed ? 'faint' : 'muted'} numberOfLines={1}>
          {when}
        </Text>
      </View>
      <Text variant="caption" style={{ color: statusColor }}>
        {REMINDER_STATUS_LABELS[status]}
      </Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove reminder"
          onPress={onRemove}
          hitSlop={12}
          style={({ pressed }) => ({
            opacity: pressed ? 0.55 : 1,
            paddingLeft: spacing.sm,
            minWidth: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Icon name="trash" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  addCircle: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  emptyAction: {
    alignItems: 'center',
  },
  reminderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  reminderCopy: {
    flex: 1,
    minWidth: 0,
  },
  completedTitle: {
    textDecorationLine: 'line-through',
  },
  loadingRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});
