import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

const ITEM_HEIGHT = 44;
/** How long the wheel must stand still before it settles on the centred value. */
const SETTLE_MS = 140;
/** Extra list above and below the starting copy, so a fling always has more
 *  content to travel through before it could reach a physical end. */
const LOOP_BUFFER = 1200;

const HOUR_ITEMS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: String(index + 1),
}));
const MINUTE_ITEMS = Array.from({ length: 60 }, (_, index) => ({
  value: index,
  label: String(index).padStart(2, '0'),
}));
const MERIDIEM_ITEMS = ['AM', 'PM'].map((value) => ({ value, label: value }));

/**
 * How many times a looping column repeats its values. Always odd, so there is
 * a middle copy to recentre into, and never more than five copies (300 rows at
 * the 60-minute worst case) so the wheel stays cheap enough to render in full.
 */
function loopCopies(count) {
  const span = count * ITEM_HEIGHT;
  let copies = 3;
  while (copies < 5 && ((copies - 1) / 2) * span < LOOP_BUFFER) copies += 2;
  return copies;
}

/** '09:00' → the three columns the sheet edits. Falls back to 9:00 AM. */
function splitTime(value) {
  const match = String(value ?? '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  const hour24 = match ? Number(match[1]) : 9;
  const minute = match ? Number(match[2]) : 0;
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    meridiem: hour24 < 12 ? 'AM' : 'PM',
  };
}

/** The three columns back to a 24-hour 'HH:MM' value. */
function joinTime({ hour12, minute, meridiem }) {
  const hour24 =
    meridiem === 'AM' ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Bottom-sheet clock. Like CalendarSheet, the picked time lives in local
 * `pending` state until Done commits it, so Cancel can never change the value,
 * and mounting it (rather than toggling a prop) seeds it from `value`.
 */
export function TimeSheet({ title = 'Pick a time', value, onChange, onClose }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [pending, setPending] = useState(() => splitTime(value));

  function commit() {
    onChange?.(joinTime(pending));
    onClose?.();
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss time picker"
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
            <Text variant="heading" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close time picker"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.columns, { paddingHorizontal: spacing.lg }]}>
            <Column
              label="Hour"
              items={HOUR_ITEMS}
              selected={pending.hour12}
              loop
              onSelect={(hour12) =>
                setPending((state) => (state.hour12 === hour12 ? state : { ...state, hour12 }))
              }
            />
            <Column
              label="Minute"
              items={MINUTE_ITEMS}
              selected={pending.minute}
              loop
              onSelect={(minute) =>
                setPending((state) => (state.minute === minute ? state : { ...state, minute }))
              }
            />
            <Column
              label="AM or PM"
              items={MERIDIEM_ITEMS}
              selected={pending.meridiem}
              onSelect={(meridiem) =>
                setPending((state) => (state.meridiem === meridiem ? state : { ...state, meridiem }))
              }
            />
          </View>

          <View style={[styles.footer, { paddingHorizontal: spacing.lg }]}>
            <Button label="Cancel" icon="close" variant="secondary" onPress={onClose} style={styles.footerButton} />
            <Button label="Done" icon="check" onPress={commit} style={styles.footerButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * One wheel column. The row in the vertical centre is the selection: scrolling,
 * flinging, or tapping a row moves the wheel and hands the centred value back
 * to the sheet. Looping columns repeat their values and silently recentre into
 * the middle copy, so the lists never show a beginning or an end.
 */
function Column({ label, items, selected, onSelect, loop = false }) {
  const { colors, radius } = useTheme();
  const scrollRef = useRef(null);
  const settleTimer = useRef(null);
  const dragging = useRef(false);
  const lastOffset = useRef(0);
  const [viewport, setViewport] = useState(0);

  const count = items.length;
  const copies = loop ? loopCopies(count) : 1;
  const middleStart = ((copies - 1) / 2) * count;
  const totalRows = copies * count;

  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === selected),
  );
  // Read by the seed effect when the wheel first gets its height. Kept in a
  // ref (updated in an effect) so a selection change does not re-run that
  // effect and yank the scroll back to the selected row mid-gesture.
  const seedIndex = middleStart + selectedIndex;
  const seedIndexRef = useRef(seedIndex);
  useEffect(() => {
    seedIndexRef.current = seedIndex;
  }, [seedIndex]);

  const padding = Math.max(0, (viewport - ITEM_HEIGHT) / 2);

  useEffect(() => {
    if (!viewport) return undefined;
    // Padding has to be in place before the opening offset can centre a row.
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: seedIndexRef.current * ITEM_HEIGHT,
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [viewport]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  /** Snap the wheel to a row and publish its value. */
  function applyOffset(offset, recenter) {
    const index = Math.min(
      Math.max(Math.round(offset / ITEM_HEIGHT), 0),
      totalRows - 1,
    );
    onSelect(items[index % count].value);

    if (!recenter) return;
    const target = loop ? middleStart + (index % count) : index;
    // Jumping by a whole copy is invisible: every copy holds the same rows.
    // Re-snapping also catches platforms without native interval snapping.
    const targetY = target * ITEM_HEIGHT;
    if (Math.round(targetY) !== Math.round(offset)) {
      scrollRef.current?.scrollTo({ y: targetY, animated: false });
    }
  }

  /** Settle after scrolling has been still for a moment. Native momentum ends
   *  fire later, but this also covers dragging to a stop and web scrolling. */
  function scheduleSettle() {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      applyOffset(lastOffset.current, !dragging.current);
    }, SETTLE_MS);
  }

  function handleScroll(event) {
    lastOffset.current = event.nativeEvent.contentOffset.y;
    scheduleSettle();
  }

  function handleScrollBeginDrag() {
    dragging.current = true;
    clearTimeout(settleTimer.current);
  }

  function handleScrollEndDrag(event) {
    dragging.current = false;
    lastOffset.current = event.nativeEvent.contentOffset.y;
    scheduleSettle();
  }

  function handleMomentumScrollEnd(event) {
    dragging.current = false;
    lastOffset.current = event.nativeEvent.contentOffset.y;
    clearTimeout(settleTimer.current);
    applyOffset(lastOffset.current, true);
  }

  function handlePress(index, value) {
    clearTimeout(settleTimer.current);
    onSelect(value);
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  }

  return (
    <View style={styles.column}>
      <Text variant="caption" tone="faint" style={styles.columnLabel}>
        {label}
      </Text>
      <View style={styles.wheel}>
        {viewport > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.band,
              {
                top: padding,
                backgroundColor: colors.primarySoft,
                borderRadius: radius.sm,
              },
            ]}
          />
        ) : null}
        <ScrollView
          ref={scrollRef}
          style={styles.columnScroll}
          contentContainerStyle={{ paddingVertical: padding }}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          scrollEventThrottle={16}
          onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        >
          {Array.from({ length: copies }, (_, copyIndex) => {
            // Only one copy is exposed to assistive tech; the rest are the same
            // rows repeated purely so the wheel can loop.
            const hidden = loop && copyIndex !== (copies - 1) / 2;
            return (
              <View
                key={copyIndex}
                accessibilityElementsHidden={hidden}
                importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
              >
                {items.map((item, itemIndex) => {
                  const index = copyIndex * count + itemIndex;
                  const isSelected = item.value === selected;
                  return (
                    <Pressable
                      key={`${copyIndex}-${item.value}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${label} ${item.label}`}
                      onPress={() => handlePress(index, item.value)}
                      style={({ pressed }) => [
                        styles.item,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text variant="body" tone={isSelected ? 'primary' : 'muted'} style={styles.itemText}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingBottom: 20,
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
  columns: {
    flexDirection: 'row',
    gap: 8,
    height: 240,
    paddingTop: 4,
  },
  column: {
    flex: 1,
    minWidth: 0,
  },
  columnLabel: {
    textAlign: 'center',
    marginBottom: 4,
  },
  columnScroll: {
    flex: 1,
  },
  wheel: {
    flex: 1,
  },
  band: {
    height: ITEM_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  item: {
    alignItems: 'center',
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  itemText: {
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
  },
  footerButton: {
    flex: 1,
  },
});
