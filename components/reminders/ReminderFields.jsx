import { Platform, StyleSheet, Switch, View } from 'react-native';

import { DatePicker } from '../dates/DatePicker';
import { TimePicker } from '../dates/TimePicker';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SectionHeader } from '../ui/Screen';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/ThemeProvider';
import { toIsoDate } from '../../utils/dates';
import { formatReminderWhen } from '../../utils/reminders';

/**
 * The reminder half of the transaction form: one switch, one date, one time.
 *
 * The date and time are kept apart while editing and only treated as a single
 * instant at save time, so the notification can never be scheduled from a
 * half-filled pair. Everything about scheduling lives in the reminder service;
 * this component only collects the choice and explains what the device will
 * (or will not) do with it.
 */
export function ReminderFields({
  enabled,
  onEnabledChange,
  date,
  onDateChange,
  time,
  onTimeChange,
  notes,
  onNotesChange,
  error,
  permission,
  onOpenSettings,
}) {
  const { colors, spacing } = useTheme();
  const today = toIsoDate(new Date());

  const permissionNotice = describePermission(permission);

  return (
    <>
      <SectionHeader title="Reminder" />
      <Card>
        <View style={styles.row}>
          <View style={styles.labels}>
            <Text variant="body">Set Reminder</Text>
            <Text variant="caption" tone="faint">
              A local notification at the chosen time
            </Text>
          </View>
          <Switch
            accessibilityRole="switch"
            accessibilityLabel="Set reminder"
            value={enabled}
            onValueChange={onEnabledChange}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.border}
          />
        </View>

        {enabled ? (
          <>
            <Text variant="label" tone="muted" style={{ marginTop: spacing.md }}>
              Remind me on
            </Text>
            <View style={{ height: spacing.xs }} />
            <DatePicker
              label="Reminder Date"
              title="Reminder Date"
              value={date}
              onChange={onDateChange}
              minimumDate={today}
              error={error}
            />
            <TimePicker
              label="Reminder Time"
              title="Reminder Time"
              value={time}
              onChange={onTimeChange}
            />

            <TextField
              label="Notes"
              value={notes}
              onChangeText={onNotesChange}
              placeholder="What do you need to remember?"
              multiline
              numberOfLines={3}
              maxLength={200}
              inputStyle={{ textAlignVertical: 'top' }}
            />

            <View style={[styles.summary, { backgroundColor: colors.surfaceMuted, borderRadius: 12 }]}>
              <Text variant="caption" tone="muted">
                🔔 Reminder set for
              </Text>
              <Text variant="body" style={{ marginTop: 2 }}>
                {formatReminderWhen(date, time)}
              </Text>
            </View>
          </>
        ) : null}

        {permissionNotice ? (
          <View style={{ marginTop: spacing.sm }}>
            <Text variant="caption" tone={permissionNotice.tone}>
              {permissionNotice.text}
            </Text>
            {permissionNotice.canOpenSettings && onOpenSettings ? (
              <View style={{ marginTop: spacing.xs }}>
                <Button label="Open device settings" variant="secondary" onPress={onOpenSettings} />
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
    </>
  );
}

/**
 * Explains what the OS will do with a saved reminder. Never blocks a save —
 * the row is the record, the notification is only delivery.
 */
function describePermission(permission) {
  if (!permission) return null;

  if (permission.supported === false) {
    return {
      tone: 'faint',
      text:
        Platform.OS === 'web'
          ? 'Device notifications are not available in the browser preview. The reminder is still saved and will notify you in the Android app.'
          : 'Device notifications are unavailable in this build. The reminder is still saved.',
      canOpenSettings: false,
    };
  }
  if (!permission.granted) {
    return {
      tone: 'warning',
      text: 'Notifications are turned off for MoneyQ, so this reminder cannot fire yet. You can still save it.',
      canOpenSettings: true,
    };
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labels: {
    flex: 1,
    paddingRight: 12,
  },
  summary: {
    marginTop: 4,
    padding: 12,
  },
});
