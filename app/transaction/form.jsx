import {
  router,
  Stack,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DatePicker } from '../../components/dates/DatePicker';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Icon } from '../../components/ui/Icon';
import { EmptyState } from '../../components/ui/EmptyState';
import { Screen, SectionHeader } from '../../components/ui/Screen';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { useTheme } from '../../components/ui/ThemeProvider';
import { PendingReminders } from '../../components/reminders/PendingReminders';
import { TransactionReminders } from '../../components/reminders/TransactionReminders';
import { useBudgetDetailStore } from '../../stores/budgetDetailStore';
import { useReceiptImportStore } from '../../stores/receiptImportStore';
import { useRemindersStore } from '../../stores/remindersStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTagsStore } from '../../stores/tagsStore';
import { BreakdownSection } from '../../components/transactions/BreakdownSection';
import { SubTransactionDetailSheet } from '../../components/transactions/SubTransactionDetailSheet';
import { SubTransactionSheet } from '../../components/transactions/SubTransactionSheet';
import { computeBreakdownTotal } from '../../utils/breakdown';
import { isHexColor, resolveFolderPalette } from '../../utils/colors';
import { formatCurrency, fromMinor, getCurrency, toMinor } from '../../utils/currency';
import { formatDateRange, formatShortDate, parseFlexibleDate, toIsoDate } from '../../utils/dates';
import { createId } from '../../utils/id';
import { PAYMENT_OPTIONS, effectivePaymentStatus } from '../../utils/paymentStatus';
import { showToast } from '../../stores/toastStore';
import { removeStagedFile } from '../../services/receiptShareService';
import { deleteReceiptFile, persistReceipt } from '../../services/receiptFiles';
import { pickImagesAsync } from '../../services/fileService';
import { useAttachmentStore } from '../../stores/attachmentStore';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense', icon: 'expense' },
  { value: 'income', label: 'Income', icon: 'income' },
];

const DATE_CHIPS = [
  { label: 'Today', offset: 0 },
  { label: 'Yesterday', offset: 1 },
  { label: 'Tomorrow', offset: -1 },
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
 * A breakdown snapshot compares only what persists: description, signed
 * amount, and order. Item ids stay out — a save rewrites the same items, so
 * identity cannot make a form look dirty.
 */
function breakdownSnapshot(active, items) {
  if (!active) return null;
  return (items ?? []).map((item) => [
    item.description.trim(),
    item.amount,
    item.purchase_date ?? null,
    item.purchase_time ?? null,
    item.notes ?? null,
  ]);
}

/**
 * Normalized, deterministic snapshot for the dirty check: amounts are minor
 * units, dates ISO, description trimmed, and payment status only meaningful
 * for expenses. Serialized with one literal key order, so equal values always
 * compare equal — restoring a field to its original value makes the form
 * clean again. While a breakdown is active the amount field no longer holds
 * a user-entered value, so the dirty check reads the calculated total and the
 * ordered item list instead.
 *
 * An existing transaction's reminders are managed separately (the shared
 * reminder form), so they are not part of the snapshot: adding, editing or
 * removing a reminder must never make the transaction form look dirty.
 */
function formSnapshot(values) {
  return JSON.stringify({
    type: values.type,
    paymentStatus: values.type === 'expense' ? values.paymentStatus : null,
    amountMinor: values.breakdownActive
      ? computeBreakdownTotal(values.items)
      : values.amountMinor,
    tagId: values.tagId || null,
    date: values.date,
    dueDate:
      values.type === 'expense' && values.paymentStatus === 'unpaid'
        ? values.dueDate || null
        : null,
    description: values.description?.trim() ? values.description.trim() : null,
    breakdown: breakdownSnapshot(values.breakdownActive, values.items),
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
    dueDate: row.payment_due_date ?? null,
    description: row.description,
    breakdownActive: row.has_breakdown === 1,
    items: row.subTransactions ?? [],
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

  if (f.breakdownActive) {
    // The parent amount is calculated; only the total rule can fail here.
    // Zero is valid, negative never is, and the repository re-checks both.
    if (computeBreakdownTotal(f.items) < 0) {
      nextErrors.breakdown = 'The breakdown total cannot be negative.';
    }
  } else {
    const minorAmount = toMinor(f.amount, currency);
    if (minorAmount <= 0) nextErrors.amount = 'Enter an amount greater than zero.';
  }
  if (f.type !== 'transfer' && !f.tagId) nextErrors.tag = 'Choose a tag.';
  if (!resolvedDate) nextErrors.date = 'Pick a date.';
  return nextErrors;
}

/**
 * Assumes validateFields passed. Reminders are not part of the transaction
 * payload: an edit leaves them untouched, and a new transaction's staged
 * reminders are created separately once the row exists. While a breakdown is
 * active the payload carries the ordered signed items; the repository
 * recalculates the parent amount from them and never trusts the amount field.
 */
function buildPayload(f, currency) {
  return {
    type: f.type,
    amount: f.breakdownActive
      ? computeBreakdownTotal(f.items)
      : toMinor(f.amount, currency),
    tagId: f.tagId,
    description: f.description.trim() || null,
    date: parseFlexibleDate(f.date),
    paymentStatus: f.type === 'expense' ? f.paymentStatus : null,
    paymentDueDate:
      f.type === 'expense' && f.paymentStatus === 'unpaid' ? f.dueDate || null : null,
    ...(f.breakdownActive
      ? {
          hasBreakdown: true,
          subTransactions: f.items.map((item) => ({
            id: item.id,
            description: item.description,
            amount: item.amount,
            purchase_date: item.purchase_date ?? null,
            purchase_time: item.purchase_time ?? null,
            notes: item.notes ?? null,
          })),
        }
      : {}),
  };
}

function openDeviceSettings() {
  if (Platform.OS !== 'web') Linking.openSettings();
}

/** File-type phrase for a stored receipt, e.g. `receipts/x.jpg` → 'JPG image'. */
function receiptTypeLabel(path) {
  const guess = /\.(png|jpe?g|webp|gif|bmp|heic|heif)(?=($|[?#]))/i.exec(String(path ?? ''));
  return guess ? `${guess[1].toUpperCase()} image` : 'Image';
}

/**
 * The receipt image card shared by the create-mode import preview and the
 * saved transaction's Attachments section: one aspect-preserved thumbnail
 * inside a capped frame, a full-screen viewer behind the tap, an optional
 * label line, and the Remove action. `uri` is either the staged import
 * copy or the resolved persistent document file — they render the same.
 * A missing or unreadable image degrades to the fallback text, keeping
 * Remove available so the dead reference can be unlinked.
 */
function ReceiptPreview({ caption, failed, onFail, onRemove, onView, uri }) {
  const { radius, spacing } = useTheme();
  return (
    <>
      <Pressable
        onPress={() => uri && onView()}
        accessibilityRole="imagebutton"
        accessibilityLabel="View receipt"
      >
        <Card padded={false} style={{ overflow: 'hidden', borderRadius: radius.lg }}>
          {failed || !uri ? (
            <View style={styles.receiptFallback}>
              <Text variant="body" tone="muted">
                The receipt image could not be displayed.
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri }}
              style={styles.receiptPreview}
              resizeMode="contain"
              onError={onFail}
            />
          )}
        </Card>
      </Pressable>
      {caption ? (
        <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
          {caption}
        </Text>
      ) : null}
      <View style={styles.receiptActions}>
        {uri && !failed ? (
          <Button
            label="View receipt"
            icon="eye"
            variant="secondary"
            onPress={onView}
            style={{ borderRadius: radius.pill }}
          />
        ) : null}
        <Button
          label="Remove"
          icon="trash"
          variant="secondary"
          onPress={onRemove}
          style={{ borderRadius: radius.pill }}
        />
      </View>
    </>
  );
}

/** The device cannot deliver a reminder — never a reason to lose the save. */
function announceReminderOutcome(outcome) {
  if (!outcome) return;
  if (outcome.status === 'blocked') {
    Alert.alert(
      'Notifications are off',
      'Your reminder is saved, but Budgetarian cannot show it until notifications are allowed for this app.',
      [
        { text: 'Open Settings', onPress: openDeviceSettings },
        { text: 'Not now', style: 'cancel' },
      ],
    );
  } else if (outcome.status === 'failed') {
    Alert.alert(
      'Reminder saved',
      'The notification could not be scheduled. Budgetarian will try again the next time it opens.',
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
  const highlightSubId = typeof params.subId === 'string' ? params.subId : '';
  const editing = transactionId
    ? entries.find((entry) => entry.id === transactionId) ?? null
    : null;

  // Shared-receipt import (create mode only): the receipt-import screen
  // stages exactly one pending record and links here with its id. The form
  // prefills from it once on mount; the record and its staged image copy
  // are discarded when this screen unmounts, whichever way the user leaves.
  const importId = typeof params.importId === 'string' ? params.importId : '';
  const importRef = useRef(
    importId && !transactionId && useReceiptImportStore.getState().pending?.id === importId
      ? useReceiptImportStore.getState().pending
      : null,
  );
  const imported = importRef.current?.parsed ?? null;

  // Receipt attachment state (create mode): `receiptUri` is the staged
  // cache copy the share-import screen handed over, previewed until the
  // user discards it or a successful save promotes it to a permanent
  // attachment row. `viewerUri` opens the full-screen viewer for either
  // the staged copy or any saved attachment tile.
  const [receiptUri, setReceiptUri] = useState(() => importRef.current?.imageUri ?? null);
  const [receiptFailed, setReceiptFailed] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);

  // Attachments of a saved transaction live in their own store: adding or
  // removing an image is an immediate, self-contained write (like
  // reminders), deliberately outside the form's dirty-check/autosave.
  // Tiles whose image fails to decode are remembered locally for this
  // session; a missing file arrives from the store with uri === null.
  const attachments = useAttachmentStore((state) => state.attachments);
  const isLoadingAttachments = useAttachmentStore((state) => state.isLoading);
  const loadAttachments = useAttachmentStore((state) => state.load);
  const attachImage = useAttachmentStore((state) => state.addImage);
  const detachAttachment = useAttachmentStore((state) => state.remove);
  const [addingAttachments, setAddingAttachments] = useState(false);
  const [failedAttachmentIds, setFailedAttachmentIds] = useState(() => new Set());

  const [type, setType] = useState('expense');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [amount, setAmount] = useState(imported?.amount ?? '');
  const [tagId, setTagId] = useState(preselectedTagId);
  const [dueDate, setDueDate] = useState('');
  const [date, setDate] = useState(() =>
    imported?.date ??
    (storeBudgetId === budgetId && budget?.id === budgetId
      ? defaultNewTransactionDate(budget)
      : toIsoDate(new Date())),
  );
  const [description, setDescription] = useState(imported?.notes ?? '');
  const [pendingReminders, setPendingReminders] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [hydratedFrom, setHydratedFrom] = useState(null);
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Sticky card height: measured so the overlaid scroll body starts its
  // content exactly below the card and its shadow falloff.
  const [cardHeight, setCardHeight] = useState(0);
  // Bottom action bar height (create mode): measured so the overlaid scroll
  // body also pads its content clear of the bar pinned over it.
  const [barHeight, setBarHeight] = useState(0);

  // The sticky action bar rides the keyboard: with the Android window in pan
  // mode it would otherwise sit behind the keyboard, so it lifts by exactly
  // the keyboard height minus the home-bar clearance it already reserves.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) =>
      setKeyboardHeight(event.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Breakdown editing state: the mode flag mirrors has_breakdown, items is
  // the live ordered list, and everything here is unsaved until the parent
  // transaction saves (auto-save on leave in edit mode, the button in create
  // mode). Leaving the create form discards it all — nothing was written.
  const [breakdownActive, setBreakdownActive] = useState(false);
  const [items, setItems] = useState([]);
  // While a breakdown row is held by its drag handle the page scroll is
  // disabled; Android's native ScrollView would otherwise force-cancel the
  // handle's responder the moment it intercepts the touch stream.
  const [breakdownDragging, setBreakdownDragging] = useState(false);
  const [itemSheet, setItemSheet] = useState(null); // { item | null }
  const [itemDetail, setItemDetail] = useState(null); // item being viewed
  const undoRef = useRef(null); // latest undo closure, read by the snackbar

  // Auto-save state (edit mode only): one save at a time, at most one
  // scheduled departure, and the freshest saved-row snapshot so a listener
  // from an older render can never write the same values twice. Touched
  // only inside effects and navigation listeners.
  const savePromiseRef = useRef(null);
  const leavePlannedRef = useRef(false);
  const rowSnapshotRef = useRef(null);
  const dateEditedRef = useRef(Boolean(imported?.date));
  const navigation = useNavigation();

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  // Imported receipts are transient: save, swipe-away, or back — leaving
  // this form drops the pending record and its staged cache copy for good.
  // A newer share (different id) is never touched by this cleanup, and
  // neither is the persistent document copy a successful save created.
  useEffect(() => {
    const snapshot = importRef.current;
    if (!snapshot) return undefined;
    return () => {
      const { pending, clear } = useReceiptImportStore.getState();
      if (pending?.id !== snapshot.id) return;
      if (pending.imageUri) removeStagedFile(pending.imageUri);
      clear();
    };
  }, []);

  // Discarding the receipt hides the section and leaves every other value
  // untouched. A staged (unsaved) import loses its cache copy right away —
  // the store record is updated first so the unmount cleanup above does
  // not try to remove the same file twice.
  const handleRemoveReceipt = () => {
    const uri = receiptUri;
    if (!uri) return;
    const { pending, setPending } = useReceiptImportStore.getState();
    if (pending?.id === importRef.current?.id && pending.imageUri === uri) {
      setPending({ ...pending, imageUri: null });
    }
    removeStagedFile(uri);
    setReceiptUri(null);
    setViewerUri(null);
    setReceiptFailed(false);
  };

  // Attachments are immediate writes outside the autosave: pick images,
  // copy each into permanent storage, attach its row. Partial success is
  // kept (the images that landed stay attached) and only the failures are
  // announced — the picker already gave the user their choice.
  const handleAddAttachments = async () => {
    let uris;
    try {
      uris = await pickImagesAsync();
    } catch (error) {
      Alert.alert('Could not open the picker', error?.message ?? 'Please try again.');
      return;
    }
    if (!uris || uris.length === 0) return;
    setAddingAttachments(true);
    let failed = 0;
    for (const uri of uris) {
      try {
        await attachImage(transactionId, uri);
      } catch {
        failed += 1;
      }
    }
    setAddingAttachments(false);
    if (failed > 0) {
      Alert.alert(
        'Some receipts could not be attached',
        failed === uris.length
          ? 'None of the picked images could be saved. Please try again.'
          : `${failed} of ${uris.length} picked images could not be saved.`,
      );
    }
  };

  const markAttachmentFailed = (id) =>
    setFailedAttachmentIds((previous) => new Set(previous).add(id));

  // Saved attachments are fetched once per form session; the store's add
  // and remove actions reload internally, so the tiles always mirror the
  // committed rows without touching the field autosave.
  useEffect(() => {
    if (transactionId) void loadAttachments(transactionId);
  }, [transactionId, loadAttachments]);

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
    setDueDate(editing.payment_due_date ?? '');
    setDescription(editing.description ?? '');
    setBreakdownActive(editing.has_breakdown === 1);
    setItems(
      (editing.subTransactions ?? []).map((item) => ({
        id: item.id,
        description: item.description,
        amount: item.amount,
        purchase_date: item.purchase_date ?? null,
        purchase_time: item.purchase_time ?? null,
        notes: item.notes ?? null,
      })),
    );
    // A Calendar purchase event names its item: open the parent with the
    // breakdown (always expanded) and the item's details on screen.
    if (
      highlightSubId &&
      (editing.subTransactions ?? []).some((item) => item.id === highlightSubId)
    ) {
      setItemDetail(editing.subTransactions.find((item) => item.id === highlightSubId));
    }
  }

  const breakdownTotal = useMemo(
    () => computeBreakdownTotal(items),
    [items],
  );

  // Deletion is immediate but reversible for a moment, announced through the
  // app-wide bottom snackbar (the same toast pill, now with an action). The
  // in-memory undo record holds the exact item and index; the snackbar calls
  // through a ref so it can never act on a stale closure. Other breakdown
  // changes clear the slot, and an undo id-guard skips a double restore.

  function openAddItemSheet() {
    if (!breakdownActive) {
      setBreakdownActive(true);
      setErrors((current) => ({ ...current, breakdown: undefined }));
    }
    setItemSheet({ item: null });
  }

  function handleAddItem(draft) {
    // A successful add closes the drawer and returns to the form: the toast
    // lives under the native Modal, so it is only ever visible once the
    // sheet is gone. The section re-renders instantly with the new row,
    // count and total. A newer add invalidates any pending Undo.
    undoRef.current = null;
    setBreakdownActive(true);
    setItems((list) => [...list, { ...draft, id: createId('subtx') }]);
    setItemSheet(null);
    showToast('Breakdown item added', 'success');
  }

  function handleApplyItem(draft) {
    undoRef.current = null;
    setItems((list) => list.map((item) => (item.id === draft.id ? { ...item, ...draft } : item)));
    setItemSheet(null);
  }

  function handleDeleteItem(deleted) {
    const index = items.findIndex((item) => item.id === deleted.id);
    if (index < 0) return;
    setItems((list) => list.filter((item) => item.id !== deleted.id));
    if (items.length === 1) setBreakdownActive(false);
    // Restore position on the same tick's index: the item leaves with its
    // slot remembered, and reinserting it there puts the order back exactly.
    const slot = { item: deleted, index };
    undoRef.current = () => {
      setBreakdownActive(true);
      setItems((list) => {
        if (list.some((item) => item.id === slot.item.id)) return list;
        const next = [...list];
        next.splice(Math.min(slot.index, next.length), 0, slot.item);
        return next;
      });
    };
    showToast('Item deleted', 'warning', {
      label: 'Undo',
      icon: 'undo',
      onPress: () => {
        const run = undoRef.current;
        if (run) run();
      },
    });
  }

  function handleReorder(from, to) {
    undoRef.current = null;
    setItems((list) => {
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
        return list;
      }
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // Transfers have no creation UI yet, but an existing one must stay editable.
  const typeOptions = useMemo(() => {
    if (!editing || TYPE_OPTIONS.some((option) => option.value === editing.type)) {
      return TYPE_OPTIONS;
    }
    return [
      ...TYPE_OPTIONS,
      {
        value: editing.type,
        label: editing.type === 'transfer' ? 'Transfer' : editing.type,
        icon: editing.type === 'transfer' ? 'transfer' : undefined,
      },
    ];
  }, [editing]);

  // Horizontal tag row edge fades: track the scroll position, the total tag
  // row width, and the visible viewport width. A fade only appears while
  // there is real overflow hidden behind its edge — no scroll overflow means
  // no fades, at the start means no left fade, at the end no right fade.
  const tagMetricsRef = useRef({ x: 0, contentWidth: 0, viewportWidth: 0 });
  const [tagFades, setTagFades] = useState({ left: false, right: false });

  function refreshTagFades() {
    const { x, contentWidth, viewportWidth } = tagMetricsRef.current;
    const overflow = contentWidth > viewportWidth + 1;
    const next = { left: overflow && x > 1, right: overflow && x + viewportWidth < contentWidth - 1 };
    setTagFades((current) =>
      current.left === next.left && current.right === next.right ? current : next,
    );
  }

  function handleTagScroll(event) {
    tagMetricsRef.current.x = event.nativeEvent.contentOffset.x;
    refreshTagFades();
  }

  function handleTagContentSize(width) {
    tagMetricsRef.current.contentWidth = width;
    refreshTagFades();
  }

  function handleTagLayout(event) {
    tagMetricsRef.current.viewportWidth = event.nativeEvent.layout.width;
    refreshTagFades();
  }

  const stillLoading = Boolean(transactionId) && (isLoadingBudget || storeBudgetId !== budgetId);

  const outsidePeriod = periodStatus(date, budget, editing?.transaction_date);
  const futureBudget =
    !transactionId &&
    Boolean(budget) &&
    budget.id === budgetId &&
    storeBudgetId === budgetId &&
    budget.start_date > toIsoDate(new Date());

  // Sticky summary card palette: a budget's saved custom color paints the
  // card directly (same WCAG-derived ink/border as folder cards). No custom
  // or invalid color → the theme's own card surface, i.e. the Card default.
  const activeBudget = storeBudgetId === budgetId && budget?.id === budgetId ? budget : null;
  const summaryPalette = isHexColor(activeBudget?.color)
    ? resolveFolderPalette(activeBudget.color, colors)
    : null;
  const summaryInk = summaryPalette ? summaryPalette.folderInk : null;

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
      dueDate,
      description,
      breakdownActive,
      items,
    };
    const snapshot = formSnapshot({
      type,
      paymentStatus,
      amountMinor: toMinor(amount, currency),
      tagId,
      date,
      dueDate,
      description,
      breakdownActive,
      items,
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
    dueDate,
    description,
    breakdownActive,
    items,
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
      dueDate,
      description,
      breakdownActive,
      items,
    };
    const nextErrors = validateFields(fields, currency);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    // The receipt's permanent copy is written first: the row may only
    // reference a file that already exists. A failed copy aborts the whole
    // save with everything (staged import included) left in place.
    let freshReceiptPath = null;
    try {
      if (receiptUri) {
        freshReceiptPath = await persistReceipt(receiptUri);
      }
      const { transaction, attachmentError } = await addTransaction({
        budgetId,
        ...buildPayload(fields, currency),
        receiptPath: freshReceiptPath,
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
      if (attachmentError) {
        // The financial record is safe; only the image reference was lost.
        showToast('The transaction saved without its receipt image.', 'warning');
      }
    } catch (error) {
      // The row never committed: the receipt copy made for it would be an
      // orphan no transaction references, so it goes back out with the
      // failure. The staged import copy is untouched — retrying still works.
      if (freshReceiptPath) deleteReceiptFile(freshReceiptPath);
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
          <Button label="Back to Home" icon="home" onPress={() => router.replace('/')} />
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
          <Button label="Back" icon="chevronLeft" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: transactionId ? 'Edit Transaction' : 'Add Transaction' }} />

      <View style={StyleSheet.absoluteFill}>
        <Screen
          scrollEnabled={!breakdownDragging}
          contentContainerStyle={{
            paddingTop: spacing.md + cardHeight + spacing.xl,
            paddingBottom: (transactionId ? 48 : barHeight) + keyboardHeight,
          }}
        >
        {/* The share-import preview belongs at the top of a NEW transaction:
            it shows the staged copy the import handed over. Once the row is
            saved the image lives in the Attachments section of the detail
            view below instead. */}
        {!transactionId && receiptUri ? (
          <>
            <SectionHeader title="Receipt" />
            <ReceiptPreview
              failed={receiptFailed}
              uri={receiptUri}
              onFail={() => setReceiptFailed(true)}
              onRemove={handleRemoveReceipt}
              onView={() => setViewerUri(receiptUri)}
            />
            <View style={{ height: spacing.lg }} />
          </>
        ) : null}

        <SectionHeader title="Description" />
        <TextField
          value={description}
          onChangeText={setDescription}
          placeholder="Groceries, rent, salary…"
          returnKeyType="next"
        />

        <SectionHeader title="Transaction Date" />
        <DatePicker
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

        <View style={{ height: spacing.lg }} />

        <SectionHeader title="Tag" />
        {tags.length === 0 ? (
          <EmptyState
            icon="tag"
            title="No tags available"
            description="Tags group transactions by what you spent on. Add one to continue."
          >
            <Button label="Manage tags" icon="tag" onPress={() => router.push('/tags')} />
          </EmptyState>
        ) : (
          <>
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={handleTagScroll}
                onContentSizeChange={handleTagContentSize}
                onLayout={handleTagLayout}
                contentContainerStyle={styles.tagRow}
              >
                {tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    emoji={tag.emoji}
                    active={tag.id === tagId}
                    onPress={() => setTagId(tag.id === tagId ? '' : tag.id)}
                  />
                ))}
              </ScrollView>
              {tagFades.left ? <TagEdgeFade side="left" color={colors.background} /> : null}
              {tagFades.right ? <TagEdgeFade side="right" color={colors.background} /> : null}
            </View>
            {errors.tag ? (
              <Text variant="caption" tone="expense" style={{ marginTop: spacing.xs }}>
                {errors.tag}
              </Text>
            ) : null}
            <SecondaryLink label="Add or rename tags" icon="pencil" onPress={() => router.push('/tags')} />
          </>
        )}

        {/* Everything below is optional: a hairline divider and quieter
            section titles mark the switch from core details to settings. */}
        <View
          style={{
            backgroundColor: colors.border,
            height: StyleSheet.hairlineWidth,
            marginTop: spacing.xl,
          }}
        />

        {type !== 'transfer' ? (
          <>
            <View style={{ height: spacing.lg }} />
            <SectionHeader
              title={items.length > 0 ? `Breakdown · ${items.length}` : 'Breakdown'}
              fontSize={14}
            />
            <BreakdownSection
              items={items}
              currency={currency}
              onAddItem={openAddItemSheet}
              onOpenItem={(item) => setItemDetail(item)}
              onReorder={handleReorder}
              onDragStateChange={setBreakdownDragging}
            />
            {errors.breakdown ? (
              <Text variant="caption" tone="expense" style={{ marginTop: spacing.xs }}>
                {errors.breakdown}
              </Text>
            ) : null}
          </>
        ) : null}

        {type === 'expense' && paymentStatus === 'unpaid' ? (
          <>
            <View style={{ height: spacing.lg }} />
            <SectionHeader title="Payment Due Date" fontSize={14} />
            <DatePicker
              label="Due date (optional)"
              title="Payment Due Date"
              value={dueDate}
              onChange={setDueDate}
              hint={
                dueDate
                  ? undefined
                  : 'Shown as an all-day payment event on the Calendar, separate from the folder period and item purchase dates.'
              }
            />
            {dueDate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear payment due date"
                onPress={() => setDueDate('')}
                hitSlop={6}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              >
                <Text variant="label" tone="primary">
                  Clear due date
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

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

        {/* Attachments — every image attached to this saved transaction,
            read from permanent document storage (never the share-import
            cache). Adding and removing are immediate, committed writes of
            their own — like reminders — independent of the field autosave.
            The section is the transaction's photo library: always present
            while editing on a device that can pick images, so a receipt
            that has none yet is one tap from having one. */}
        {transactionId && (Platform.OS !== 'web' || attachments.length > 0) ? (
          <>
            <View style={{ height: spacing.lg }} />
            <SectionHeader
              title="Attachments"
              action={
                Platform.OS !== 'web' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add receipt image"
                    hitSlop={8}
                    disabled={addingAttachments}
                    onPress={handleAddAttachments}
                    style={({ pressed }) => [
                      styles.headerAction,
                      { opacity: pressed || addingAttachments ? 0.55 : 1 },
                    ]}
                  >
                    <Icon name="add" size={20} color={colors.primary} />
                  </Pressable>
                ) : null
              }
            />
            <Card>
              {isLoadingAttachments ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : attachments.length > 0 ? (
                attachments.map((attachment, index) => {
                  const broken =
                    !attachment.uri || failedAttachmentIds.has(attachment.id);
                  return (
                    <Pressable
                      key={attachment.id}
                      accessibilityRole="button"
                      accessibilityLabel="View attachment"
                      disabled={broken}
                      onPress={() => setViewerUri(attachment.uri)}
                      style={({ pressed }) => [
                        styles.attachmentRow,
                        index > 0 && {
                          marginTop: spacing.sm,
                          borderTopColor: colors.border,
                          borderTopWidth: StyleSheet.hairlineWidth,
                          paddingTop: spacing.sm,
                        },
                        !broken && { opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <View style={styles.attachmentThumb}>
                        {broken ? (
                          <View style={styles.attachmentMissing}>
                            <Text variant="caption" tone="muted">
                              ?
                            </Text>
                          </View>
                        ) : (
                          <Image
                            source={{ uri: attachment.uri }}
                            style={styles.attachmentImage}
                            resizeMode="cover"
                            onError={() => markAttachmentFailed(attachment.id)}
                          />
                        )}
                      </View>
                      <View style={styles.attachmentCopy}>
                        <Text variant="body" numberOfLines={1}>
                          {receiptTypeLabel(attachment.path)}
                        </Text>
                        {broken ? (
                          <Text variant="caption" tone="muted">
                            File missing
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove attachment"
                        hitSlop={8}
                        onPress={() => void detachAttachment(attachment.id)}
                        style={({ pressed }) => [
                          styles.attachmentRemove,
                          { opacity: pressed ? 0.55 : 1 },
                        ]}
                      >
                        <Icon name="trash" size={16} color={colors.textFaint} />
                      </Pressable>
                    </Pressable>
                  );
                })
              ) : (
                <EmptyState icon="bills" title="No attachments yet">
                  <View style={styles.emptyAction}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add receipt image"
                      disabled={addingAttachments}
                      onPress={handleAddAttachments}
                      style={({ pressed }) => [
                        styles.addCircle,
                        { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      {addingAttachments ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <Icon name="add" size={26} color={colors.onPrimary} />
                      )}
                    </Pressable>
                    <Text
                      variant="label"
                      tone="primary"
                      style={{ marginTop: spacing.sm, textAlign: 'center' }}
                    >
                      Add a receipt image
                    </Text>
                  </View>
                </EmptyState>
              )}
            </Card>
          </>
        ) : null}

        {transactionId ? (
          <Text
            variant="caption"
            tone="faint"
            style={{ marginTop: spacing.lg, textAlign: 'center' }}
          >
            Changes save automatically when you leave this screen.
          </Text>
        ) : null}
        </Screen>
      </View>

      {/* The scroll body fills the whole scene behind the sticky amount card,
          so rows slide cleanly under its opaque surface instead of being cut
          off at a straight edge below it. The card paints on top (it follows
          the ScrollView in JSX) and paddingTop clears its measured height. */}
      <Card
        onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        style={{
          borderRadius: 25,
          borderWidth: 0,
          marginHorizontal: spacing.lg,
          marginTop: spacing.md,
          padding: spacing.md,
          // Soft, diffuse drop shadow so the card floats above the page;
          // the theme shadow token carries its own alpha.
          boxShadow: `0 6px 16px ${colors.shadow}`,
          ...(summaryPalette
            ? { backgroundColor: summaryPalette.folder, borderColor: summaryPalette.folderBorder }
            : null),
        }}
      >
        <SectionHeader title="Amount" color={summaryInk} />
        {breakdownActive ? (
          <>
            <AmountInput
              symbol={getCurrency(currency).symbol}
              value={String(fromMinor(breakdownTotal, currency))}
              editable={false}
              decimalPlaces={getCurrency(currency).minorUnits}
              bare
              large
              align="left"
              ink={summaryInk ?? undefined}
            />
            <Text
              variant="caption"
              tone="faint"
              style={{
                marginTop: spacing.xs,
                ...(summaryInk ? { color: summaryInk, opacity: 0.85 } : null),
              }}
            >
              Calculated from items · {items.length} item{items.length === 1 ? '' : 's'} ·{' '}
              {formatCurrency(breakdownTotal, { currency })}
            </Text>
          </>
        ) : (
          <>
            <AmountInput
              symbol={getCurrency(currency).symbol}
              value={amount}
              onChangeText={setAmount}
              decimalPlaces={getCurrency(currency).minorUnits}
              autoFocus={!transactionId}
              bare
              large
              align="left"
              ink={summaryInk ?? undefined}
            />
            {errors.amount ? (
              <Text
                variant="caption"
                tone="expense"
                  style={{ marginTop: spacing.xs, ...(summaryInk ? { color: summaryInk } : null) }}
              >
                {errors.amount}
              </Text>
            ) : null}
            <Text
              variant="caption"
              tone="faint"
              style={{
                marginTop: spacing.xs,
                ...(summaryInk ? { color: summaryInk, opacity: 0.85 } : null),
              }}
            >
              {formatCurrency(toMinor(amount, currency), { currency })}
            </Text>
          </>
        )}

        {/* Type and Status are core one-tap choices: kept dense beside the
            amount so they never scroll away from the fields they govern
            (due date follows payment status). */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <SectionHeader title="Type" color={summaryInk} />
            <SegmentedControl options={typeOptions} value={type} onChange={setType} dense />
          </View>
          <View style={{ flex: 1 }}>
            <SectionHeader title="Status" color={summaryInk} />
            <SegmentedControl
              options={PAYMENT_OPTIONS}
              value={paymentStatus}
              onChange={setPaymentStatus}
              dense
            />
          </View>
        </View>

        {/* Budget association as a compact detail line: it never scrolls
            away, so the folder the entry belongs to is always visible. */}
        <View
          style={{
            alignItems: 'center',
            borderTopWidth: summaryPalette ? 0 : StyleSheet.hairlineWidth,
            borderColor: colors.border,
            flexDirection: 'row',
            gap: spacing.sm,
            marginTop: spacing.md,
            paddingTop: spacing.sm,
          }}
        >
          <Icon
            name="wallet"
            size={14}
            color={summaryInk ?? (budget?.color || colors.primary)}
          />
          <Text
            variant="label"
            numberOfLines={1}
            style={{ flex: 1, ...(summaryInk ? { color: summaryInk } : null) }}
          >
            {budget?.name ?? 'This budget'}
          </Text>
          {budget?.start_date ? (
            <Text
              variant="caption"
              tone="faint"
              style={summaryInk ? { color: summaryInk, opacity: 0.85 } : undefined}
            >
              {formatDateRange(budget.start_date, budget.end_date)}
            </Text>
          ) : null}
        </View>
      </Card>

      {transactionId ? null : (
        <View
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
          style={{
            // The scroll body above is an absolute overlay filling the whole
            // scene, so nothing in normal flow holds this bar down any more.
            // Pin it to the bottom explicitly, or it renders directly under
            // the sticky amount card.
            backgroundColor: colors.background,
            borderColor: colors.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            bottom: 0,
            left: 0,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.md + insets.bottom,
            position: 'absolute',
            right: 0,
            transform: [{ translateY: -Math.max(0, keyboardHeight - insets.bottom) }],
          }}
        >
          <Button
            label={saving ? 'Saving…' : 'Add transaction'}
            icon={saving ? undefined : 'add'}
            onPress={handleSave}
            disabled={saving}
          />
        </View>
      )}

      {itemSheet ? (
        <SubTransactionSheet
          item={itemSheet.item}
          currency={currency}
          otherTotal={computeBreakdownTotal(
            itemSheet.item
              ? items.filter((entry) => entry.id !== itemSheet.item.id)
              : items,
          )}
          onAddItem={handleAddItem}
          onApplyItem={handleApplyItem}
          onClose={() => setItemSheet(null)}
        />
      ) : null}

      {itemDetail ? (
        <SubTransactionDetailSheet
          item={itemDetail}
          currency={currency}
          index={items.findIndex((entry) => entry.id === itemDetail.id)}
          count={items.length}
          onEdit={(item) => setItemSheet({ item })}
          onDelete={handleDeleteItem}
          onMoveUp={(from) => handleReorder(from, from - 1)}
          onMoveDown={(from) => handleReorder(from, from + 1)}
          onClose={() => setItemDetail(null)}
        />
      ) : null}

      {viewerUri ? (
        <ReceiptViewer
          failed={Boolean(receiptFailed && viewerUri === receiptUri)}
          uri={viewerUri}
          onClose={() => setViewerUri(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * Full-screen receipt viewer: a fade Modal over the form so every entered
 * value stays exactly as it was when the user closes it. Tapping anywhere
 * (or the Android back gesture via onRequestClose) returns to the form.
 */
function ReceiptViewer({ failed, onClose, uri }) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} accessibilityViewIsModal visible>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={[styles.viewerBackdrop, { backgroundColor: colors.background }]}
      >
        <View style={{ alignItems: 'flex-end', paddingBottom: spacing.sm, paddingRight: spacing.lg, paddingTop: insets.top + spacing.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close receipt preview"
            onPress={onClose}
            style={[styles.viewerClose, { backgroundColor: colors.surfaceElevated }]}
          >
            <Icon name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg }}>
          {failed ? (
            <Text variant="body" tone="muted">
              The receipt image could not be displayed.
            </Text>
          ) : (
            <Image source={{ uri }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

function SecondaryLink({ label, onPress, icon }) {
  const { radius, spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.xs, alignItems: 'center' }}>
      {/* Auto-sized to its label and pill-rounded like the tag chips above,
          so it doesn't read as a square-cornered outlier on this screen. */}
      <Button
        label={label}
        icon={icon}
        variant="primary"
        onPress={onPress}
        style={{ borderRadius: radius.pill }}
      />
    </View>
  );
}

/** Narrow gradient overlay hinting at off-screen tags at one edge of the row. */
const TAG_FADE_WIDTH = 24;

/**
 * SVG edge gradient (react-native-svg, already a dependency) fading the
 * section background into transparency over the horizontal tag row. It paints
 * above the scroll content but forwards every touch (`pointerEvents="none"`),
 * so tag taps and swipes never hit the fade. `color` comes from the theme, so
 * light and dark modes blend exactly like the screen behind it.
 */
function TagEdgeFade({ side, color }) {
  const leading = side === 'left';
  const gradientId = `tag-fade-${side}`;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.tagFade,
        { width: TAG_FADE_WIDTH },
        leading ? { left: 0 } : { right: 0 },
      ]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient
            id={gradientId}
            x1={leading ? '0%' : '100%'}
            y1="0%"
            x2={leading ? '100%' : '0%'}
            y2="0%"
          >
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tagRow: { alignItems: 'center', paddingRight: 6 },
  tagFade: { bottom: 0, position: 'absolute', top: 0 },
  // Receipt preview: fixed max-height box with contain scaling, so tall
  // receipts keep their aspect ratio instead of being cropped or stretched.
  receiptPreview: { height: 240, width: '100%' },
  receiptFallback: {
    alignItems: 'center',
    height: 140,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  receiptActions: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 12 },
  attachmentRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 2 },
  attachmentThumb: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden' },
  attachmentImage: { width: '100%', height: '100%' },
  attachmentMissing: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  attachmentCopy: { flex: 1, minWidth: 0 },
  attachmentRemove: { paddingLeft: 8 },
  headerAction: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  loadingRow: { alignItems: 'center', paddingVertical: 12 },
  emptyAction: { alignItems: 'center' },
  addCircle: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    borderRadius: 28,
    width: 56,
  },
  viewerBackdrop: { flex: 1 },
  viewerClose: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
