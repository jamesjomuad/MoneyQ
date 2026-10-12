import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatCurrency } from '../../utils/currency';
import { formatShortDate, formatTime } from '../../utils/dates';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/** Fixed row pitch; rows keep one-line descriptions so it never drifts. */
const ROW_HEIGHT = 56;

/**
 * Ordered list of breakdown items inside the transaction form.
 *
 * Rows are deliberately quiet: a dedicated drag handle, one truncated
 * description with its purchase date/time beneath, and the signed amount —
 * nothing else. Tapping a row opens its detail sheet (full description,
 * notes, move/delete), so edit and delete never fight the drag, and the
 * accessible reorder alternative lives there too. The calculated total sits
 * at the bottom of the section, after the list and the Add item action.
 * Deletion feedback is the app-wide bottom snackbar with Undo, raised by the
 * form; reordering only changes positions — the parent total is the sum, so
 * it can never move.
 */
export function BreakdownSection({ items, currency, onAddItem, onOpenItem, onReorder }) {
  const { colors, spacing } = useTheme();
  const [drag, setDrag] = useState(null); // { id, originalIndex, dy }
  // Gesture bookkeeping only; never read while rendering a branch.
  const dragRef = useRef(null);

  function grant(id, pageY) {
    const index = items.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    dragRef.current = { id, originalIndex: index, startY: pageY };
    setDrag({ id, originalIndex: index, dy: 0 });
  }

  function move(id, pageY) {
    const current = dragRef.current;
    if (!current || current.id !== id) return;
    const dy = pageY - current.startY;
    dragRef.current = { ...current, dy };
    const index = items.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const target = Math.max(
      0,
      Math.min(items.length - 1, current.originalIndex + Math.round(dy / ROW_HEIGHT)),
    );
    if (target !== index) onReorder(index, target);
    setDrag({ id, originalIndex: current.originalIndex, dy });
  }

  function end() {
    dragRef.current = null;
    setDrag(null);
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={{ marginTop: spacing.sm }}>
      {items.length === 0 ? (
        <Text variant="caption" tone="faint" style={{ paddingVertical: spacing.sm }}>
          No items yet. The total stays at zero until you add one — an
          Adjustment can be larger than a single purchase, but never larger
          than the running total.
        </Text>
      ) : (
        items.map((item, index) => (
          <BreakdownRow
            key={item.id}
            item={item}
            index={index}
            count={items.length}
            currency={currency}
            drag={drag}
            onGrant={grant}
            onMove={move}
            onEnd={end}
            onOpen={() => onOpenItem(item)}
          />
        ))
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add breakdown item"
        onPress={onAddItem}
        hitSlop={4}
        style={({ pressed }) => [
          styles.addAction,
          {
            borderColor: colors.border,
            borderRadius: 8,
            marginTop: spacing.sm,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon name="add" size={16} color={colors.primary} />
        <Text variant="label" tone="primary" style={{ marginLeft: spacing.xs }}>
          Add item
        </Text>
      </Pressable>

      <View
        style={[
          styles.totalRow,
          {
            borderTopColor: colors.border,
            marginTop: spacing.sm,
            paddingTop: spacing.sm,
          },
        ]}
      >
        <Text variant="label">Total</Text>
        <Text variant="body" style={{ fontVariant: ['tabular-nums'] }}>
          {formatCurrency(total, { currency })}
        </Text>
      </View>
    </View>
  );
}

function BreakdownRow({ item, index, count, currency, drag, onGrant, onMove, onEnd, onOpen }) {
  const { colors, radius, spacing } = useTheme();

  const isDragging = drag?.id === item.id;
  const dy = isDragging ? drag.dy - (index - drag.originalIndex) * ROW_HEIGHT : 0;

  const when = item.purchase_date
    ? `${formatShortDate(item.purchase_date)}${item.purchase_time ? ` · ${formatTime(item.purchase_time)}` : ''}`
    : 'No purchase date';

  return (
    <View
      style={[
        styles.row,
        {
          height: ROW_HEIGHT,
          borderRadius: radius.md,
          paddingHorizontal: spacing.xs,
          backgroundColor: isDragging ? colors.surfaceElevated : colors.surface,
          borderColor: isDragging ? colors.primary : colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          marginBottom: spacing.xs,
          transform: [{ translateY: dy }],
          // Keep the dragged row above its shifted neighbours.
          zIndex: isDragging ? 2 : 1,
          ...(isDragging
            ? {
                shadowOpacity: 0.18,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
              }
            : null),
        },
      ]}
    >
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => onGrant(item.id, event.nativeEvent.pageY)}
        onResponderMove={(event) => onMove(item.id, event.nativeEvent.pageY)}
        onResponderRelease={onEnd}
        onResponderTerminate={onEnd}
        accessibilityLabel={`Reorder ${item.description}. Position ${index + 1} of ${count}`}
        accessibilityHint="Drag to reorder. Or open the item and use Move up or Move down."
        style={styles.handle}
      >
        <Icon name="drag" size={16} color={isDragging ? colors.primary : colors.textFaint} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.description}`}
        accessibilityHint="Shows the full item with edit and delete actions"
        onPress={onOpen}
        style={({ pressed }) => [styles.copy, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text variant="body" numberOfLines={1}>
          {item.description}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {when}
          {item.notes ? ' · note' : ''}
        </Text>
      </Pressable>

      <Text
        variant="body"
        style={{
          color: item.amount < 0 ? colors.expense : colors.income,
          fontVariant: ['tabular-nums'],
          marginLeft: 6,
        }}
      >
        {formatCurrency(item.amount, { currency, showSign: item.amount > 0 })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
  },
  handle: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: ROW_HEIGHT,
    minWidth: 28,
  },
  copy: {
    flex: 1,
    marginLeft: 6,
    minWidth: 0,
    paddingVertical: 6,
  },
  totalRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  addAction: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
  },
});
