import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatCurrency } from '../../utils/currency';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/** Fixed row pitch; rows keep one-line descriptions so it never drifts. */
const ROW_HEIGHT = 56;

/**
 * Ordered list of breakdown items inside the transaction form.
 *
 * Every row carries a dedicated drag handle: the responder lives on the
 * handle only, so tapping edit/delete never fights the drag. Move-up and
 * move-down buttons give the same ordering without dragging. Deleting is
 * immediate and shows a temporary "Item deleted · Undo" bar; reordering only
 * changes positions — the parent total is the sum, so it can never move.
 * Drag feedback is a raised, accented row that follows the finger in
 * half-steps of ROW_HEIGHT.
 */
export function BreakdownSection({
  items,
  currency,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onReorder,
  undo,
  onUndo,
}) {
  const { colors, radius, spacing } = useTheme();
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

  return (
    <View style={{ marginTop: spacing.sm }}>
      {undo ? (
        <View
          style={[
            styles.undoBar,
            {
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.md,
              marginBottom: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}
        >
          <Text variant="caption" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
            Item deleted
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo item deletion"
            onPress={onUndo}
            hitSlop={8}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text variant="label" tone="primary">
              Undo
            </Text>
          </Pressable>
        </View>
      ) : null}

      {items.length === 0 ? (
        <Text variant="caption" tone="faint" style={{ paddingVertical: spacing.sm }}>
          No items yet. The total stays at zero until you add one — negative
          items are fine as discounts or adjustments.
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
            onEdit={() => onEditItem(item)}
            onDelete={() => onDeleteItem(item)}
            onMoveUp={() => onReorder(index, index - 1)}
            onMoveDown={() => onReorder(index, index + 1)}
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
            borderRadius: radius.md,
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
    </View>
  );
}

function BreakdownRow({
  item,
  index,
  count,
  currency,
  drag,
  onGrant,
  onMove,
  onEnd,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}) {
  const { colors, radius, spacing } = useTheme();

  const isDragging = drag?.id === item.id;
  const dy = isDragging ? drag.dy - (index - drag.originalIndex) * ROW_HEIGHT : 0;

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
        accessibilityLabel={`Reorder ${item.description}`}
        accessibilityHint="Drag to reorder, or use the move buttons"
        style={styles.handle}
      >
        <Icon name="drag" size={16} color={isDragging ? colors.primary : colors.textFaint} />
      </View>

      <View style={styles.moveColumn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${item.description} up`}
          accessibilityState={{ disabled: index === 0 }}
          disabled={index === 0}
          onPress={onMoveUp}
          hitSlop={6}
          style={({ pressed }) => [{ opacity: index === 0 ? 0.25 : pressed ? 0.6 : 0.9 }]}
        >
          <Icon name="chevronUp" size={14} color={colors.textMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${item.description} down`}
          accessibilityState={{ disabled: index === count - 1 }}
          disabled={index === count - 1}
          onPress={onMoveDown}
          hitSlop={6}
          style={({ pressed }) => [{ opacity: index === count - 1 ? 0.25 : pressed ? 0.6 : 0.9 }]}
        >
          <Icon name="chevronDown" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.copy}>
        <Text variant="body" numberOfLines={1}>
          {item.description}
        </Text>
      </View>

      <Text
        variant="body"
        tone={item.amount < 0 ? 'expense' : 'default'}
        style={[styles.amount, { color: item.amount > 0 ? colors.income : undefined }]}
      >
        {formatCurrency(item.amount, { currency, showSign: item.amount > 0 })}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.description}`}
        onPress={onEdit}
        hitSlop={10}
        style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Icon name="pencil" size={16} color={colors.textMuted} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.description}`}
        onPress={onDelete}
        hitSlop={10}
        style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Icon name="trash" size={16} color={colors.textFaint} />
      </Pressable>
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
  moveColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: ROW_HEIGHT,
    minWidth: 20,
  },
  copy: {
    flex: 1,
    marginLeft: 6,
    minWidth: 0,
  },
  amount: {
    fontVariant: ['tabular-nums'],
    marginLeft: 6,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 28,
  },
  undoBar: {
    alignItems: 'center',
    flexDirection: 'row',
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
