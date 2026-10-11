import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useRemindersStore } from '../../stores/remindersStore';
import { ReminderSection } from './ReminderSection';

/**
 * The Reminder section for an already-saved transaction.
 *
 * The list is read through the reminder store (never the database directly)
 * and scoped to one transaction id, so a reminder loaded for a previously
 * viewed transaction is never shown here. Adding or tapping a reminder opens
 * the shared reminder form — the one place a reminder is edited, completed or
 * deleted — so no reminder behaviour is duplicated here. Reloading on focus
 * covers every return from that form.
 */
export function TransactionReminders({ transactionId }) {
  const loadedTransactionId = useRemindersStore((state) => state.transactionId);
  const reminders = useRemindersStore((state) => state.transactionReminders);
  const isLoading = useRemindersStore((state) => state.transactionIsLoading);
  const error = useRemindersStore((state) => state.transactionError);
  const loadForTransaction = useRemindersStore((state) => state.loadForTransaction);

  useFocusEffect(
    useCallback(() => {
      loadForTransaction(transactionId);
    }, [loadForTransaction, transactionId]),
  );

  // Trust the store's list only once it has caught up with this transaction.
  const isCurrent = loadedTransactionId === transactionId;
  const state = !isCurrent || isLoading ? 'loading' : error ? 'error' : 'ready';

  function addReminder() {
    router.push({ pathname: '/reminder/form', params: { transactionId } });
  }

  function openReminder(reminder) {
    router.push({ pathname: '/reminder/form', params: { reminderId: reminder.id } });
  }

  return (
    <ReminderSection
      reminders={isCurrent ? reminders : []}
      state={state}
      onAdd={addReminder}
      onEdit={openReminder}
    />
  );
}
