import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Screen, SectionHeader } from '../components/ui/Screen';
import { Text } from '../components/ui/Text';
import { useTheme } from '../components/ui/ThemeProvider';
import { useBudgetsStore } from '../stores/budgetsStore';
import { useReceiptImportStore } from '../stores/receiptImportStore';
import {
  collectSharedReceipt,
  receiptShareService,
  removeStagedFile,
  stageSharedImage,
} from '../services/receiptShareService';
import { formatDateRange } from '../utils/dates';
import { createId } from '../utils/id';
import { parseReceiptText } from '../utils/receiptParse';

/**
 * Landing screen for content shared into the app from an e-wallet (Android
 * share sheet → ACTION_SEND intent → +native-intent redirect). Reads the
 * payload, keeps an image copy readable in the app cache, previews both,
 * and hands exactly one pending import record to the existing transaction
 * form. Nothing here touches storage: leaving without pressing "Add as
 * transaction" discards everything, and a second share replaces the record
 * instead of stacking a duplicate import.
 */
export default function ReceiptImportScreen() {
  const { colors, radius, spacing } = useTheme();
  const [status, setStatus] = useState(() =>
    receiptShareService.supported ? 'loading' : 'unsupported',
  );
  const [previewFailed, setPreviewFailed] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState('');

  const pending = useReceiptImportStore((state) => state.pending);
  const budgets = useBudgetsStore((state) => state.budgets);
  const loadBudgets = useBudgetsStore((state) => state.load);

  // Which record this screen instance staged and owns; once handed off to
  // the transaction form the file belongs to that flow, not to this screen.
  const ownedIdRef = useRef(null);
  const handedOffRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  const discard = useCallback(() => {
    const { pending: current, clear } = useReceiptImportStore.getState();
    if (!ownedIdRef.current || current?.id !== ownedIdRef.current) return;
    if (current.imageUri) removeStagedFile(current.imageUri);
    clear();
    ownedIdRef.current = null;
  }, []);

  const receive = useCallback(async () => {
    if (!receiptShareService.supported) return;
    const generation = ++generationRef.current;
    try {
      const shared = await collectSharedReceipt();
      const text = String(shared.text ?? '');
      if (text.trim() === '' && !shared.imageUri) {
        // Nothing new arrived (a plain app resume, or a share the source app
        // cancelled). Keep whatever this screen already prepared.
        setStatus((current) => (ownedIdRef.current ? 'ready' : current === 'ready' ? current : 'empty'));
        return;
      }

      // A fresh share replaces any record still owned here. One already
      // handed off to the transaction form stays untouched.
      if (!handedOffRef.current) discard();

      const staged = shared.imageUri
        ? await stageSharedImage(shared.imageUri, shared.mimeType)
        : null;
      if (!mountedRef.current || generation !== generationRef.current) {
        // Screen unmounted or superseded mid-receive: leave no stray copy.
        if (staged) removeStagedFile(staged);
        return;
      }
      const record = {
        id: createId('import'),
        text,
        imageUri: staged,
        previewUnavailable: Boolean(shared.imageUri) && !staged,
        parsed: parseReceiptText(text),
        createdAt: Date.now(),
      };
      ownedIdRef.current = record.id;
      setPreviewFailed(false);
      useReceiptImportStore.getState().setPending(record);
      setStatus('ready');
      loadBudgets();
    } catch {
      // A permission denial or unreadable URI during share collection must
      // not strand the screen on its initial "loading" state forever.
      if (mountedRef.current && generation === generationRef.current) {
        setStatus('error');
      }
    }
  }, [discard, loadBudgets]);

  // Cold start: +native-intent routed here already. Warm start: the share
  // sheet sits over the app, so check for a payload again on resume.
  useEffect(() => {
    mountedRef.current = true;
    receive();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') receive();
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [receive]);

  // Unmount safety net: a swipe-away or hardware back must also drop the
  // pending import, not just the visible Cancel button.
  useEffect(
    () => () => {
      if (!handedOffRef.current) discard();
    },
    [discard],
  );

  // One budget on the device is the only safe auto-pick; derived, not
  // stored, so a late-arriving list never needs a second render pass.
  const activeBudgetId =
    selectedBudgetId || (budgets.length === 1 ? budgets[0].id : '');

  function handleContinue() {
    if (!pending || !activeBudgetId) return;
    handedOffRef.current = true;
    ownedIdRef.current = null;
    router.replace({
      pathname: '/transaction/form',
      params: { budgetId: activeBudgetId, importId: pending.id },
    });
  }

  function handleCancel() {
    discard();
    router.back();
  }

  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="body" tone="muted">
          Receiving shared content…
        </Text>
      </View>
    );
  }

  if (status === 'unsupported') {
    return (
      <EmptyState
        icon="share"
        title="Receipt sharing needs the full app"
        description="Android delivers shares to Budgetarian through its build configuration, so a dev build or store APK must receive them — Expo Go cannot. Install that build and share the receipt again."
      >
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </EmptyState>
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        icon="warning"
        title="The receipt could not be received"
        description="Sharing the receipt into the app failed — the file could not be read. Check the app's storage permissions and share it again."
      >
        <Button label="Try again" onPress={receive} />
        <Button label="Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
      </EmptyState>
    );
  }

  if (status === 'empty' || !pending) {
    return (
      <EmptyState
        icon="empty"
        title="No receipt received"
        description="Budgetarian accepts the image, the text, or both when your e-wallet shares a receipt. Nothing usable arrived this time."
      >
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </EmptyState>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Import Receipt' }} />
      <Screen contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {pending.imageUri ? (
          <>
            <SectionHeader title="Receipt Image" />
            <Card padded={false} style={{ overflow: 'hidden', borderRadius: radius.lg }}>
              <Image
                source={{ uri: pending.imageUri }}
                style={styles.preview}
                resizeMode="contain"
                onError={() => setPreviewFailed(true)}
              />
            </Card>
            {previewFailed ? (
              <Text variant="body" tone="muted">
                The preview could not be shown, but the receipt was kept for this import.
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="body" tone="muted">
            {pending.previewUnavailable
              ? 'The shared image could not be opened — enter the details manually.'
              : 'No image was shared with this receipt.'}
          </Text>
        )}

        <SectionHeader title="Shared Text" />
        {pending.text.trim() === '' ? (
          <Text variant="body" tone="muted">
            No text was shared with this receipt. Review the image and fill the form manually.
          </Text>
        ) : (
          <Card>
            <Text variant="body" style={styles.sharedText} selectable>
              {pending.text}
            </Text>
          </Card>
        )}

        <SectionHeader title="Budget" />
        {budgets.length === 0 ? (
          <>
            <Text variant="body" tone="muted">
              No budgets yet — create one before importing this receipt.
            </Text>
            <Button
              label="Create budget"
              icon="add"
              variant="secondary"
              onPress={() => router.push('/budget/form')}
              style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
            />
          </>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {budgets.map((budget) => {
              const active = budget.id === activeBudgetId;
              return (
                <Pressable
                  key={budget.id}
                  onPress={() => setSelectedBudgetId(budget.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.budgetRow,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Icon name="wallet" size={20} color={active ? colors.primary : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{budget.name}</Text>
                    <Text variant="caption" tone="muted">
                      {formatDateRange(budget.start_date, budget.end_date)}
                    </Text>
                  </View>
                  {active ? <Icon name="check" size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Button
          label="Add as transaction"
          icon="add"
          onPress={handleContinue}
          disabled={!activeBudgetId}
          style={{ marginTop: spacing.lg }}
        />
        <Button
          label="Cancel import"
          variant="secondary"
          onPress={handleCancel}
          style={{ marginTop: spacing.sm }}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    height: 260,
  },
  sharedText: {
    lineHeight: 20,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
