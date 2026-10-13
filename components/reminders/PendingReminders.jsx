import { useState } from 'react';
import { View } from 'react-native';

import { DatePicker } from '../dates/DatePicker';
import { TimePicker } from '../dates/TimePicker';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SectionHeader } from '../ui/Screen';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/ThemeProvider';
import { toIsoDate } from '../../utils/dates';
import {
  buildRemindAt,
  reminderValidationError,
  suggestReminderValues,
} from '../../utils/reminders';
import { ReminderSection } from './ReminderSection';

let draftSeq = 0;

/**
 * The Reminder section of a *new* transaction. The transaction has no id yet,
 * so reminders cannot be written — they are staged in the form and created,
 * linked to the new transaction, when it is saved (see the transaction form).
 *
 * The section is the same shell the saved-transaction view uses; only the
 * wiring differs: the plus opens an inline editor instead of the reminder
 * form, and each staged row can be removed or tapped to edit.
 */
export function PendingReminders({ value, onChange, permission, onOpenSettings }) {
  const { spacing } = useTheme();
  const [editorId, setEditorId] = useState(null); // null | 'new' | staged id
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [error, setError] = useState(null);

  function openNew() {
    const suggestion = suggestReminderValues();
    setDraftDate(suggestion.date);
    setDraftTime(suggestion.time);
    setDraftNotes('');
    setError(null);
    setEditorId('new');
  }

  function openEdit(reminder) {
    setDraftDate(reminder.remind_date);
    setDraftTime(reminder.remind_time);
    setDraftNotes(reminder.notes ?? '');
    setError(null);
    setEditorId(reminder.id);
  }

  function closeEditor() {
    setError(null);
    setEditorId(null);
  }

  function commit() {
    const message = reminderValidationError(draftDate, draftTime);
    if (message) {
      setError(message);
      return;
    }
    const staged = {
      remind_date: draftDate,
      remind_time: draftTime,
      remind_at: buildRemindAt(draftDate, draftTime),
      notes: draftNotes.trim(),
      status: 'active',
      enabled: 1,
    };
    if (editorId === 'new') {
      draftSeq += 1;
      onChange([...value, { ...staged, id: `draft_${Date.now().toString(36)}_${draftSeq}` }]);
    } else {
      onChange(value.map((reminder) => (reminder.id === editorId ? { ...reminder, ...staged } : reminder)));
    }
    closeEditor();
  }

  function remove(reminder) {
    onChange(value.filter((row) => row.id !== reminder.id));
  }

  if (editorId !== null) {
    const permissionNotice = describePermissionNotice(permission);
    return (
      <>
        <SectionHeader title="Reminders" />
        <Card>
          <DatePicker
            label="Reminder Date"
            title="Reminder Date"
            value={draftDate}
            onChange={setDraftDate}
            minimumDate={toIsoDate(new Date())}
            error={error}
          />
          <TimePicker
            label="Reminder Time"
            title="Reminder Time"
            value={draftTime}
            onChange={setDraftTime}
          />
          <TextField
            label="Notes"
            value={draftNotes}
            onChangeText={setDraftNotes}
            placeholder="What do you need to remember?"
            multiline
            numberOfLines={3}
            maxLength={200}
            inputStyle={{ textAlignVertical: 'top' }}
          />
          {permissionNotice ? (
            <View style={{ marginBottom: spacing.sm }}>
              <Text variant="caption" tone={permissionNotice.tone}>
                {permissionNotice.text}
              </Text>
              {permissionNotice.canOpenSettings && onOpenSettings ? (
                <View style={{ marginTop: spacing.xs }}>
                  <Button
                    label="Open device settings"
                    icon="settings"
                    variant="secondary"
                    onPress={onOpenSettings}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <Button
            label={editorId === 'new' ? 'Add reminder' : 'Save reminder'}
            icon={editorId === 'new' ? 'add' : 'check'}
            onPress={commit}
            style={{ marginBottom: spacing.md }}
          />
          <Button label="Cancel" icon="close" variant="secondary" onPress={closeEditor} />
        </Card>
      </>
    );
  }

  return (
    <ReminderSection
      reminders={value}
      state="ready"
      onAdd={openNew}
      onEdit={openEdit}
      onRemove={remove}
    />
  );
}

/**
 * Explains what the OS will do once this staged reminder is saved. Never
 * blocks the flow — the row is the record, the notification is only delivery.
 */
function describePermissionNotice(permission) {
  if (!permission) return null;
  if (permission.supported === false) {
    return {
      tone: 'faint',
      text: 'Device notifications are unavailable in this build. The reminder is still saved.',
      canOpenSettings: false,
    };
  }
  if (!permission.granted) {
    return {
      tone: 'warning',
      text: 'Notifications are turned off for Budgetarian, so this reminder cannot fire yet. You can still save it.',
      canOpenSettings: true,
    };
  }
  return null;
}
