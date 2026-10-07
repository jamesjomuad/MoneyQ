import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

const ITEM_HEIGHT = 40;

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const MERIDIEMS = ['AM', 'PM'];

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
              backgroundColor: colors.surface,
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
              items={HOURS.map((hour) => ({ value: hour, label: String(hour) }))}
              selected={pending.hour12}
              onSelect={(hour12) => setPending((state) => ({ ...state, hour12 }))}
            />
            <Column
              label="Minute"
              items={MINUTES.map((minute) => ({
                value: minute,
                label: String(minute).padStart(2, '0'),
              }))}
              selected={pending.minute}
              onSelect={(minute) => setPending((state) => ({ ...state, minute }))}
            />
            <Column
              label="AM or PM"
              items={MERIDIEMS.map((meridiem) => ({ value: meridiem, label: meridiem }))}
              selected={pending.meridiem}
              onSelect={(meridiem) => setPending((state) => ({ ...state, meridiem }))}
            />
          </View>

          <View style={[styles.footer, { paddingHorizontal: spacing.lg }]}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
            <Button label="Done" onPress={commit} style={styles.footerButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** One scrollable column. It opens scrolled to the current selection. */
function Column({ label, items, selected, onSelect }) {
  const { colors, radius } = useTheme();
  const scrollRef = useRef(null);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === selected),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedIndex]);

  return (
    <View style={styles.column}>
      <Text variant="caption" tone="faint" style={styles.columnLabel}>
        {label}
      </Text>
      <ScrollView ref={scrollRef} style={styles.columnScroll} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const isSelected = item.value === selected;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${label} ${item.label}`}
              onPress={() => onSelect(item.value)}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: isSelected ? colors.primarySoft : 'transparent',
                  borderRadius: radius.sm,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text variant="body" tone={isSelected ? 'primary' : 'muted'} style={styles.itemText}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
