import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBudgetTransferStore } from '../../stores/budgetTransferStore';
import { useFoldersStore } from '../../stores/foldersStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { resolveFolderPalette } from '../../utils/colors';
import { formatDateRange } from '../../utils/dates';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Shared single-budget import preview, mounted by the Budget screen and by
 * Export & Import. It shows exactly what the file contains, lets the user pick
 * a destination folder, and only then calls the store's import action. A
 * cancelled sheet clears the preview and touches nothing in the database.
 *
 * The component stays mounted while closed so a validation or import error
 * from the store has one place to surface as an alert.
 */
export function BudgetImportSheet({ origin = 'budget' }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const preview = useBudgetTransferStore((state) => state.preview);
  const isBusy = useBudgetTransferStore((state) => state.isBusy);
  const error = useBudgetTransferStore((state) => state.error);
  const clearError = useBudgetTransferStore((state) => state.clearError);
  const cancelImport = useBudgetTransferStore((state) => state.cancelImport);
  const confirmImport = useBudgetTransferStore((state) => state.confirmImport);
  const setDestinationFolder = useBudgetTransferStore((state) => state.setDestinationFolder);

  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.load);
  const currency = useSettingsStore((state) => state.currency);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (!error || error.origin !== origin) return;
    Alert.alert(error.title, error.message, [{ text: 'OK', onPress: clearError }]);
  }, [error, clearError, origin]);

  if (!preview || preview.origin !== origin) return null;

  const validation = preview.validation;
  const data = validation.data;
  const counts = validation.counts;
  const warnings = validation.warnings ?? [];
  const exportedCurrency = data.settings?.currency;
  const currencyMismatch = Boolean(exportedCurrency && currency && exportedCurrency !== currency);
  const folderId = preview.folderId ?? null;

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={isBusy ? undefined : cancelImport}
      accessibilityViewIsModal
    >
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss budget import"
          disabled={isBusy}
          onPress={cancelImport}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
            <Text variant="heading" accessibilityRole="header" style={styles.title}>
              Import budget
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel budget import"
              disabled={isBusy}
              onPress={cancelImport}
              hitSlop={10}
              style={({ pressed }) => [
                styles.iconButton,
                { opacity: isBusy ? 0.4 : pressed ? 0.55 : 1 },
              ]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              gap: spacing.md,
              paddingBottom: spacing.lg,
              paddingHorizontal: spacing.lg,
            }}
          >
            <View>
              <Text variant="body" numberOfLines={2}>
                {data.budget.name}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {formatDateRange(data.budget.start_date, data.budget.end_date)}
              </Text>
              <Text variant="caption" tone="faint" numberOfLines={1} style={{ marginTop: 2 }}>
                {preview.fileName}
              </Text>
            </View>

            <View
              style={[
                styles.counts,
                {
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  padding: spacing.md,
                },
              ]}
            >
              <CountRow label="Transactions" value={counts.transactions} />
              <CountRow label="Breakdown items" value={counts.breakdownItems} />
              <CountRow label="New tags" value={counts.tags} />
              <CountRow label="Reminders" value={counts.reminders} />
              <CountRow label="Receipts" value={counts.attachments} />
            </View>

            {currencyMismatch ? (
              <Text variant="caption" tone="warning">
                Exported in {exportedCurrency}; this app uses {currency}. Amounts are unchanged.
              </Text>
            ) : null}

            {warnings.length > 0 ? (
              <View style={{ gap: 4 }}>
                {warnings.slice(0, 6).map((warning, index) => (
                  <Text key={`${index}-${warning}`} variant="caption" tone="warning">
                    {warning}
                  </Text>
                ))}
                {warnings.length > 6 ? (
                  <Text variant="caption" tone="faint">
                    …and {warnings.length - 6} more
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={{ gap: spacing.xs }}>
              <Text variant="label" tone="muted">
                Destination
              </Text>
              <FolderRow
                label="No folder"
                caption="Top level of the Budgets list"
                selected={folderId === null}
                onPress={() => setDestinationFolder(null)}
              />
              {folders.map((folder) => {
                const palette = resolveFolderPalette(folder.color, colors);
                return (
                  <FolderRow
                    key={folder.id}
                    label={folder.name}
                    folderColor={palette.folder}
                    folderBorder={palette.folderBorder}
                    selected={folderId === folder.id}
                    onPress={() => setDestinationFolder(folder.id)}
                  />
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.actions, { borderTopColor: colors.border, paddingHorizontal: spacing.lg }]}>
            <View style={styles.action}>
              <Button
                label="Cancel"
                variant="secondary"
                disabled={isBusy}
                onPress={cancelImport}
              />
            </View>
            <View style={styles.action}>
              <Button
                label={isBusy ? 'Importing…' : 'Import budget'}
                disabled={isBusy}
                onPress={confirmImport}
              />
            </View>
          </View>

          {isBusy ? (
            <View style={[styles.busy, { paddingTop: spacing.sm }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function CountRow({ label, value }) {
  return (
    <View style={styles.countRow}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="caption" style={styles.countValue}>
        {value}
      </Text>
    </View>
  );
}

function FolderRow({
  label,
  caption,
  folderColor = null,
  folderBorder = null,
  selected,
  onPress,
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: radius.md,
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      {folderColor ? (
        <View
          style={[styles.swatch, { backgroundColor: folderColor, borderColor: folderBorder }]}
        />
      ) : (
        <Icon name="home" size={18} color={colors.textMuted} />
      )}
      <View style={styles.optionText}>
        <Text variant="body" numberOfLines={1}>
          {label}
        </Text>
        {caption ? (
          <Text variant="caption" tone="faint">
            {caption}
          </Text>
        ) : null}
      </View>
      <Icon
        name={selected ? 'check' : 'chevronRight'}
        size={16}
        color={selected ? colors.primary : colors.textFaint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  grabber: {
    alignSelf: 'center',
    borderRadius: 999,
    height: 4,
    marginTop: 8,
    width: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
    marginTop: 12,
  },
  iconButton: {
    padding: 4,
  },
  title: {
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    paddingTop: 4,
  },
  counts: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  countRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  countValue: {
    fontVariant: ['tabular-nums'],
  },
  option: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingVertical: 8,
  },
  optionText: {
    flex: 1,
  },
  swatch: {
    borderRadius: 7,
    borderWidth: 2,
    height: 26,
    width: 26,
  },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  action: {
    flex: 1,
  },
  busy: {
    alignItems: 'center',
  },
});
