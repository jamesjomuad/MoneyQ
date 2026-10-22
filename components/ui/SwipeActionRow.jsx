import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * SwipeActionRow — generic presentational wrapper that reveals trailing action
 * buttons when the row is swiped to the left. Built on react-native-gesture-handler's
 * `Swipeable`, so vertical scrolling, tap-to-open thresholds, and slide animations
 * follow platform conventions out of the box.
 *
 * It knows nothing about the data it wraps: the screen passes an `actions` array
 * ({ key, label, icon, onPress, tone }) and the row handles gesture + state only.
 *
 * Coordination rules (managed here, not by callers):
 * - Only one row is open at a time — opening a row closes the previous one.
 * - `closeAllSwipeActions()` lets a screen close the open row on outside taps.
 * - Taps anywhere on an open row close it instead of triggering navigation.
 */

// Module-level registry: at most one row holds the "open" claim at a time.
let activeEntry = null;

function claimRow(entry) {
  if (activeEntry && activeEntry.id !== entry.id) {
    const previous = activeEntry;
    activeEntry = entry;
    previous.close();
  } else {
    activeEntry = entry;
  }
}

function releaseRow(id) {
  if (activeEntry && activeEntry.id === id) {
    activeEntry = null;
  }
}

/** Close whichever swipe row is currently open (no-op when none is). */
export function closeAllSwipeActions() {
  if (activeEntry) {
    const entry = activeEntry;
    activeEntry = null;
    entry.close();
  }
}

export function SwipeActionRow({
  rowId,
  actions = [],
  children,
  onOpen,
  onClose,
  disabled = false,
  style,
  contentStyle,
}) {
  const { colors, spacing } = useTheme();
  const autoId = useId();
  const id = rowId ?? autoId;
  const swipeRef = useRef(null);
  const [open, setOpen] = useState(false);

  const enabled = !disabled && actions.length > 0;

  const closeSelf = useCallback(() => {
    const swipeable = swipeRef.current;
    if (swipeable) swipeable.close();
  }, []);

  // Rows unmounted while open (list refresh, navigation) must give up the claim.
  useEffect(
    () => () => {
      releaseRow(id);
    },
    [id],
  );

  const handleOpen = useCallback(
    (direction) => {
      if (direction !== 'right') return;
      claimRow({ id, close: closeSelf });
      setOpen(true);
      onOpen?.();
    },
    [closeSelf, id, onOpen],
  );

  const handleWillClose = useCallback(() => {
    releaseRow(id);
    setOpen(false);
    onClose?.();
  }, [id, onClose]);

  const pressAction = useCallback(
    (action) => {
      closeSelf();
      action.onPress?.();
    },
    [closeSelf],
  );

  const renderRightActions = useCallback(
    () => (
      <View style={[styles.actions, { backgroundColor: colors.surface }]}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [
              styles.action,
              {
                paddingHorizontal: spacing.md,
                backgroundColor: action.tone === 'destructive' ? colors.expenseSoft : colors.surfaceMuted,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
            onPress={() => pressAction(action)}
          >
            <Icon
              name={action.icon}
              size={20}
              color={action.tone === 'destructive' ? colors.expense : colors.text}
            />
            <Text
              variant="caption"
              numberOfLines={1}
              style={{
                marginTop: 2,
                color: action.tone === 'destructive' ? colors.expense : colors.text,
              }}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    ),
    [actions, colors.expense, colors.expenseSoft, colors.surface, colors.surfaceMuted, colors.text, pressAction, spacing],
  );

  return (
    <Swipeable
      ref={swipeRef}
      containerStyle={[styles.row, style]}
      renderRightActions={enabled ? renderRightActions : undefined}
      onSwipeableOpen={handleOpen}
      onSwipeableWillClose={handleWillClose}
    >
      <View style={[styles.surface, contentStyle]}>
        {children}
        {enabled && open ? (
          // Absorb taps while open so pressing the row closes it instead of navigating.
          <Pressable
            accessibilityLabel="Close actions"
            onPress={closeSelf}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
  },
  surface: {
    width: '100%',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 60,
  },
});

export default SwipeActionRow;
