import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatCurrency } from '../../utils/currency';
import { formatShortDate, formatTime } from '../../utils/dates';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/** Minimum touch-target height for the drag handle. */
const HANDLE_MIN_HEIGHT = 56;

/**
 * Ordered list of breakdown items inside the transaction form, wrapped in the
 * same Card shell the Reminder section uses: quiet rows separated by hairline
 * dividers, and a centred circular add button
 * under it. When there are no items the empty state shows the same circular
 * add affordance instead. Rows are dragged by the dedicated handle: the list
 * is measured per row (onLayout), so the drop position follows the finger at
 * any row height, the dragged row lifts and moves with the gesture, and the
 * rest of the list re-slots live. The handle refuses responder termination so
 * the enclosing ScrollView cannot steal the gesture mid-drag, and reports the
 * drag up via `onDragStateChange` so the page scroll is disabled while a drag
 * is held — Android's native ScrollView force-cancels the JS responder on
 * interception and ignores termination refusals.
 * Tapping a row opens its detail sheet (full description, notes, move/delete).
 * Deletion feedback is the app-wide bottom snackbar with Undo, raised by the
 * form; reordering only changes positions — the parent total is the sum, so
 * it can never move.
 */
export function BreakdownSection({
  items,
  currency,
  onAddItem,
  onOpenItem,
  onReorder,
  onDragStateChange,
}) {
  const { colors, radius, spacing } = useTheme();
  const [drag, setDrag] = useState(null); // { id, originTop, height, dy }
  // Gesture bookkeeping only; never read while rendering a branch.
  const dragRef = useRef(null);
  // Live measured geometry per row: id -> { top, height }, relative to the
  // Card's content view. Rows share one parent, so tops are comparable.
  const layoutsRef = useRef(new Map());

  function measure(id, event) {
    const { y, height } = event.nativeEvent.layout;
    layoutsRef.current.set(id, { top: y, height });
  }

  function grant(id, pageY) {
    const index = items.findIndex((entry) => entry.id === id);
    const layout = layoutsRef.current.get(id);
    if (index < 0 || !layout) return;
    dragRef.current = { id, startY: pageY, originTop: layout.top, height: layout.height };
    setDrag({ id, originTop: layout.top, height: layout.height, dy: 0 });
    if (onDragStateChange) onDragStateChange(true);
  }

  function move(id, pageY) {
    const current = dragRef.current;
    if (!current || current.id !== id) return;
    const dy = pageY - current.startY;
    dragRef.current = { ...current, dy };
    // The dragged row's visual centre, in card coordinates.
    const center = current.originTop + current.height / 2 + dy;
    // Its slot is the number of *other* rows whose measured centre is above.
    let target = 0;
    for (const entry of items) {
      if (entry.id === id) continue;
      const layout = layoutsRef.current.get(entry.id);
      if (layout && layout.top + layout.height / 2 < center) target += 1;
    }
    target = Math.max(0, Math.min(items.length - 1, target));
    const index = items.findIndex((entry) => entry.id === id);
    if (index >= 0 && target !== index) onReorder(index, target);
    setDrag({ ...current, dy });
  }

  function end() {
    dragRef.current = null;
    setDrag(null);
    if (onDragStateChange) onDragStateChange(false);
  }

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
          onMeasure={measure}
          onGrant={grant}
          onMove={move}
          onEnd={end}
          onOpen={() => onOpenItem(item)}
        />
      ))}

      {/* No Total line here: the sticky Amount card already shows the same
          calculated sum right above this section. */}
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

function BreakdownRow({
  item,
  index,
  count,
  currency,
  drag,
  onMeasure,
  onGrant,
  onMove,
  onEnd,
  onOpen,
}) {
  const { colors, spacing } = useTheme();
  const isDragging = drag?.id === item.id;
  // Own measured top, kept in state so the lifted row's offset is render-safe.
  const [top, setTop] = useState(null);

  // Keep the row under the finger: drag start + travel, minus where the row
  // now actually sits after the list re-slotted around it.
  const dragOffset = isDragging && top !== null ? drag.originTop + drag.dy - top : 0;

  const when = item.purchase_date
    ? `${formatShortDate(item.purchase_date)}${item.purchase_time ? ` · ${formatTime(item.purchase_time)}` : ''}`
    : 'No purchase date';

  return (
    <View
      onLayout={(event) => {
        const { y } = event.nativeEvent.layout;
        setTop(y);
        onMeasure(item.id, event);
      }}
      style={[
        styles.row,
        index > 0 && {
          marginTop: spacing.sm,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: spacing.sm,
        },
        isDragging
          ? {
              transform: [{ translateY: dragOffset }],
              zIndex: 2,
              opacity: 0.92,
              backgroundColor: colors.surfaceElevated,
              borderRadius: 8,
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.18)',
            }
          : null,
      ]}
    >
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
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
    minHeight: HANDLE_MIN_HEIGHT,
    minWidth: 28,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
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
