import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { SectionHeader } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * The collapsible 'Recognized Text' area inside the New Transaction form's
 * Attachments section. Every line ML Kit read from the receipt appears once,
 * verbatim, as a tappable chip — no categories, no separate lists, and no
 * chip is ever consumed: used chips stay visible and reusable, only marked
 * with a small check. Tapping a chip opens a bottom sheet offering exactly
 * the form fields that can hold it (Description, Amount, Date — the
 * transaction model has no notes field on the parent). The whole body folds
 * behind its header so the section stays uncluttered; 'Scan again' lives in
 * the header and unfolds a fresh result automatically. All selection state
 * here is session-only UI state; nothing is stored.
 */

const FIELDS = [
  // `append` marks the one free-text destination: a word can join what is
  // already there. Amount and Date hold single parsed values, so they only
  // ever replace.
  { key: 'description', label: 'Description', icon: 'bills', append: true },
  { key: 'amount', label: 'Amount', icon: 'wallet' },
  { key: 'date', label: 'Date', icon: 'calendar' },
];

export function RecognizedTextSection({
  status,
  chips,
  error,
  assignments,
  values,
  onScanAgain,
  onAssign,
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [sheetError, setSheetError] = useState(null);

  // A fresh scan is worth looking at: unfold before re-running it.
  const scanAgain = () => {
    setCollapsed(false);
    onScanAgain();
  };

  const openChip = (chip) => {
    setSheetError(null);
    setSelected(chip);
  };

  const closeSheet = () => {
    setSelected(null);
    setSheetError(null);
  };

  const applyToField = (field, mode) => {
    if (!selected) return;
    const result = onAssign(field.key, selected, mode);
    if (result?.ok) closeSheet();
    else setSheetError(result?.message ?? 'The value could not be applied.');
  };

  const chooseField = (field) => {
    const current = String(values?.[field.key] ?? '').trim();
    if (!current) {
      applyToField(field, 'replace');
      return;
    }
    if (field.append) {
      // Free text can grow instead of being overwritten: offer both.
      Alert.alert(`Add to ${field.label}?`, `This field already holds “${current}”.`, [
        { text: 'Keep current', style: 'cancel' },
        { text: 'Add', onPress: () => applyToField(field, 'append') },
        { text: 'Replace', style: 'destructive', onPress: () => applyToField(field, 'replace') },
      ]);
      return;
    }
    // Never overwrite silently: the user confirms the replacement first.
    Alert.alert(
      `Replace ${field.label}?`,
      'This field already has a value. The recognized text will take its place.',
      [
        { text: 'Keep current', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => applyToField(field, 'replace') },
      ],
    );
  };

  const usedIds = new Set(Object.values(assignments ?? {}).filter(Boolean));
  const action =
    status === 'done' || status === 'empty' || status === 'failed' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan the receipt again"
        hitSlop={8}
        onPress={scanAgain}
        style={({ pressed }) => [
          styles.action,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Icon name="refresh" size={14} color={colors.primary} />
        <Text variant="label" tone="primary" style={typography.label}>
          Scan again
        </Text>
      </Pressable>
    ) : null;

  return (
    <View>
      <SectionHeader
        action={action}
        collapsed={collapsed}
        fontSize={14}
        onToggle={() => setCollapsed((value) => !value)}
        title="Recognized Text"
      />

      {!collapsed ? (
        <>
          {status === 'scanning' ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="caption" tone="muted">
                Reading the receipt…
              </Text>
            </View>
          ) : null}

          {status === 'unavailable' ? (
            <Text variant="caption" tone="muted" style={styles.caption}>
              On-device text recognition needs a development build, so this receipt
              waits for you to enter the details by hand. Nothing else about the
              import changes.
            </Text>
          ) : null}

          {status === 'failed' ? (
            <View style={styles.statusBlock}>
              <Text variant="caption" tone="warning" style={styles.caption}>
                {error ||
                  'The scan could not read this image. Your receipt and any entries are untouched.'}
              </Text>
              <Button
                label="Scan again"
                variant="secondary"
                icon="refresh"
                onPress={scanAgain}
                style={styles.scanButton}
              />
            </View>
          ) : null}

          {status === 'empty' ? (
            <View style={styles.statusBlock}>
              <Text variant="caption" tone="muted" style={styles.caption}>
                No text could be read from this image. Use “Scan again”, or fill the
                fields below by hand — the receipt is still attached.
              </Text>
            </View>
          ) : null}

          {status === 'done' ? (
            <>
              <Text variant="caption" tone="muted" style={styles.caption}>
                Tap any line to place it in a field. Suggestions are never saved —
                review them before you tap Save.
              </Text>
              <View style={[styles.chips, { gap: spacing.sm }]}>
                {chips.map((chip) => {
                  const isSelected = selected?.id === chip.id;
                  const isUsed = usedIds.has(chip.id);
                  return (
                    <Pressable
                      key={chip.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Use recognized text: ${chip.text}`}
                      onPress={() => openChip(chip)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: isSelected ? colors.primarySoft : colors.surfaceMuted,
                          borderColor: isSelected ? colors.primary : colors.border,
                          borderRadius: radius.md,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                          opacity: pressed ? 0.8 : 1,
                        },
                        isUsed && !isSelected ? styles.usedChip : null,
                      ]}
                    >
                      {isUsed ? (
                        <Icon name="check" size={13} color={colors.primary} />
                      ) : null}
                      <Text
                        variant="label"
                        tone={isSelected ? 'primary' : 'default'}
                        style={styles.chipText}
                      >
                        {chip.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={closeSheet}
        transparent
        visible={selected !== null}
      >
        {selected ? (
          <Pressable
            accessibilityLabel="Close the menu without changes"
            onPress={closeSheet}
            style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          >
            <View
              accessibilityViewIsModal
              onStartShouldSetResponder={() => true}
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderTopLeftRadius: radius.xl,
                  borderTopRightRadius: radius.xl,
                  padding: spacing.xl,
                  paddingBottom: spacing.xxl,
                },
              ]}
            >
              <Text variant="label" tone="muted">
                Place this recognized text
              </Text>
              <Text variant="body" style={styles.sheetTitle}>
                {selected.text}
              </Text>

              {sheetError ? (
                <Text variant="caption" tone="warning" style={styles.sheetError}>
                  {sheetError}
                </Text>
              ) : null}

              {FIELDS.map((field) => {
                const current = String(values?.[field.key] ?? '').trim();
                const already = assignments?.[field.key] === selected.id;
                return (
                  <Pressable
                    key={field.key}
                    accessibilityRole="button"
                    accessibilityLabel={
                      current
                        ? field.append
                          ? `Use in ${field.label} — replace or add to the current text`
                          : `Replace ${field.label} with this text`
                        : `Put this text in ${field.label}`
                    }
                    onPress={() => chooseField(field)}
                    style={({ pressed }) => [
                      styles.fieldRow,
                      {
                        borderColor: colors.border,
                        borderRadius: radius.md,
                        gap: spacing.md,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Icon name={field.icon} size={18} color={colors.primary} />
                    <View style={styles.fieldText}>
                      <Text variant="label">{field.label}</Text>
                      {current ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {field.append
                            ? `Adds to or replaces “${current}”`
                            : `Replaces “${current}”`}
                        </Text>
                      ) : null}
                    </View>
                    {already ? (
                      <Icon name="check" size={16} color={colors.primary} />
                    ) : (
                      <Icon name="chevronRight" size={16} color={colors.textFaint} />
                    )}
                  </Pressable>
                );
              })}

              <Button label="Cancel" variant="secondary" onPress={closeSheet} />
            </View>
          </Pressable>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  statusBlock: {
    gap: 10,
  },
  caption: {
    marginBottom: 8,
  },
  scanButton: {
    alignSelf: 'flex-start',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
  },
  usedChip: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    gap: 12,
  },
  sheetTitle: {
    fontWeight: '700',
  },
  sheetError: {
    marginTop: -4,
  },
  fieldRow: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  fieldText: {
    flex: 1,
  },
});
