import { router } from 'expo-router';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBudgetTransferStore } from '../../stores/budgetTransferStore';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * The Budget screen's overflow menu. Android alerts only fit three buttons, so
 * the old Edit/Delete alert became this sheet when export and import joined
 * it. Exporting and importing both close the sheet first: the file picker and
 * the error alert must not open while a Modal is still tearing down.
 */
export function BudgetActionsSheet({ visible, budget, onDelete, onClose }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const isBusy = useBudgetTransferStore((state) => state.isBusy);
  const exportBudget = useBudgetTransferStore((state) => state.exportBudget);
  const startImport = useBudgetTransferStore((state) => state.startImport);

  const run = (action) => {
    onClose?.();
    setTimeout(action, 0);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss budget actions"
          onPress={onClose}
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
            <Text variant="heading" accessibilityRole="header" numberOfLines={1} style={styles.title}>
              {budget.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close budget actions"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg }}>
            <ActionRow
              icon="folder"
              label="Export budget"
              caption="Save this budget as a file"
              disabled={isBusy}
              onPress={() => run(() => exportBudget(budget.id, 'save'))}
            />
            <ActionRow
              icon="share"
              label="Share budget"
              caption="Send this budget file to another app"
              disabled={isBusy}
              onPress={() => run(() => exportBudget(budget.id, 'share'))}
            />
            <ActionRow
              icon="archive"
              label="Import budget"
              caption="Add a budget from a file — nothing is replaced"
              disabled={isBusy}
              onPress={() =>
                run(() =>
                  startImport({ defaultFolderId: budget.folder_id ?? null, origin: 'budget' }),
                )
              }
            />
            <ActionRow
              icon="pencil"
              label="Edit budget"
              disabled={isBusy}
              onPress={() =>
                run(() =>
                  router.push({ pathname: '/budget/form', params: { id: budget.id } }),
                )
              }
            />
            <ActionRow
              icon="trash"
              label="Delete budget"
              caption="Archives it — you can restore it later"
              tone="expense"
              disabled={isBusy}
              onPress={() => run(() => onDelete?.())}
            />
            <ActionRow icon="close" label="Cancel" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActionRow({ icon, label, caption, tone = 'default', disabled = false, onPress }) {
  const { colors, radius, spacing } = useTheme();
  const ink = tone === 'expense' ? colors.expense : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
          borderRadius: radius.md,
          gap: spacing.sm,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Icon name={icon} size={19} color={tone === 'expense' ? colors.expense : colors.textMuted} />
      <View style={styles.optionText}>
        <Text variant="body" style={{ color: ink }}>
          {label}
        </Text>
        {caption ? (
          <Text variant="caption" tone="faint">
            {caption}
          </Text>
        ) : null}
      </View>
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
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionText: {
    flex: 1,
  },
  sheet: {
    paddingTop: 4,
  },
  title: {
    flex: 1,
  },
});
