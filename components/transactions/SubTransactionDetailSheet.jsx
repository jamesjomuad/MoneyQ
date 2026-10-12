import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCurrency } from '../../utils/currency';
import { formatShortDate, formatTime } from '../../utils/dates';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { Button } from '../ui/Button';

/**
 * Detail view for one breakdown item, opened by tapping its row. It shows
 * what the compact row truncates — the full description, the formatted
 * signed amount, the purchase date and time, and the notes when present —
 * and owns every action: Edit (same add/edit sheet), Delete (which raises
 * the Undo snackbar in the form), and the accessible Move up / Move down
 * pair that replaces pure drag-and-drop reordering.
 */
export function SubTransactionDetailSheet({
  item,
  currency,
  index,
  count,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onClose,
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const atFirst = index <= 0;
  const atLast = index >= count - 1;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close item details"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg,
              paddingHorizontal: spacing.lg,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text variant="heading" accessibilityRole="header" style={styles.title}>
              Breakdown item
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close item details"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text variant="title" style={{ marginTop: spacing.sm }}>
            {item.description}
          </Text>

          <Text
            variant="heading"
            style={{
              color: item.amount < 0 ? colors.expense : colors.income,
              fontVariant: ['tabular-nums'],
              marginTop: spacing.xs,
            }}
          >
            {formatCurrency(item.amount, { currency, showSign: item.amount > 0 })}
          </Text>

          <View style={[styles.metaRow, { marginTop: spacing.md }]}>
            <Text variant="caption" tone="muted">
              Purchased
            </Text>
            <Text variant="body">
              {item.purchase_date
                ? `${formatShortDate(item.purchase_date)}${
                    item.purchase_time ? ` · ${formatTime(item.purchase_time)}` : ''
                  }`
                : 'No date set'}
            </Text>
          </View>

          {item.notes ? (
            <View style={[styles.notes, { backgroundColor: colors.surfaceMuted, borderRadius: radius.md }]}>
              <Text variant="caption" tone="muted">
                Notes
              </Text>
              <Text variant="body" style={{ marginTop: 2 }}>
                {item.notes}
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="Edit"
              onPress={() => {
                onClose();
                onEdit(item);
              }}
            />
          </View>

          <View style={[styles.rowPair, { marginTop: spacing.sm }]}>
            <Button
              label="Move up"
              variant="secondary"
              disabled={atFirst}
              onPress={() => onMoveUp(index)}
              style={styles.pairButton}
            />
            <Button
              label="Move down"
              variant="secondary"
              disabled={atLast}
              onPress={() => onMoveDown(index)}
              style={styles.pairButton}
            />
          </View>

          <View style={{ marginTop: spacing.sm }}>
            <Button
              label="Delete"
              variant="danger"
              onPress={() => {
                onClose();
                onDelete(item);
              }}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheet: {
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    borderRadius: 999,
    height: 4,
    marginBottom: 8,
    width: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingBottom: 4,
  },
  title: {
    flex: 1,
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  notes: {
    marginTop: 12,
    padding: 12,
  },
  rowPair: {
    flexDirection: 'row',
    gap: 8,
  },
  pairButton: {
    flex: 1,
  },
});
