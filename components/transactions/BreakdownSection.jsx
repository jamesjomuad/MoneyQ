import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatCurrency } from '../../utils/currency';
import { formatShortDate, formatTime } from '../../utils/dates';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/** Fixed row pitch; rows keep one-line descriptions so it never drifts. */
const ROW_HEIGHT = 56;

/**
 * Ordered list of breakdown items inside the transaction form, wrapped in the
 * same Card shell the Reminder section uses: quiet rows separated by hairline
 * dividers, a Total line at the bottom, and a centred circular add button
 * under it. When there are no items the empty state shows the same circular
 * add affordance instead. Rows are dragged by the dedicated handle;
 * tapping a row opens its detail sheet (full description, notes, move/delete).
 * Deletion feedback is the app-wide bottom snackbar with Undo, raised by the
 * form; reordering only changes positions — the parent total is the sum, so
 * it can never move.
 */
export function BreakdownSection({ items, currency, onAddItem, onOpenItem, onReorder }) {
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

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon="list" title="No items yet">
          <View style={styles.emptyAction}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add your first item"
              onPress={onAddItem}
              style={({ pressed }) => [
                styles.addCircle,
                {
                  backgroundColor: colors.primary,
                  borderRadius: radius.pill,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon name="add" size={26} color={colors.onPrimary} />
            </Pressable>
            <Text
              variant="label"
              tone="primary"
              style={{ marginTop: spacing.sm, textAlign: 'center' }}
            >
              Add your first item
            </Text>
          </View>
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      {items.map((item, index) => (
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
      ))}

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

      <View style={[styles.addAction, { marginTop: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add breakdown item"
          onPress={onAddItem}
          style={({ pressed }) => [
            styles.addCircle,
            {
              backgroundColor: colors.primary,
              borderRadius: radius.pill,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
        >
          <Icon name="add" size={26} color={colors.onPrimary} />
        </Pressable>
      </View>
    </Card>
  );
}

function BreakdownRow({ item, index, count, currency, drag, onGrant, onMove, onEnd, onOpen }) {
  const { colors, spacing } = useTheme();

  const isDragging = drag?.id === item.id;
  const dy = isDragging ? drag.dy - (index - drag.originalIndex) * ROW_HEIGHT : 0;

  const when = item.purchase_date
    ? `${formatShortDate(item.purchase_date)}${item.purchase_time ? ` · ${formatTime(item.purchase_time)}` : ''}`
    : 'No purchase date';

  return (
    <View
      style={[
        styles.row,
        index > 0 && {
          marginTop: spacing.sm,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: spacing.sm,
        },
        isDragging
          ? { transform: [{ translateY: dy }], zIndex: 2, opacity: 0.85 }
          : null,
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
    gap: 10,
    paddingVertical: 2,
  },
  handle: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: ROW_HEIGHT,
    minWidth: 28,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
  },
  totalRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  addCircle: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  addAction: {
    alignItems: 'center',
  },
  emptyAction: {
    alignItems: 'center',
  },
});
