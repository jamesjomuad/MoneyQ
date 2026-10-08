import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDaysIso, todayIso } from '../../utils/dates';
import { DatePicker } from '../dates/DatePicker';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Bottom-sheet date-range picker. From/To live in local pending state and
 * only reach the store through Apply — Cancel or the backdrop can never
 * change the active filter, matching CalendarSheet's commit rules. Preset
 * chips set a whole range in one tap; Apply normalizes reversed bounds.
 */
const PRESETS = [
  { label: 'Last 7 days', start: () => addDaysIso(todayIso(), -6), end: () => todayIso() },
  { label: 'Last 30 days', start: () => addDaysIso(todayIso(), -29), end: () => todayIso() },
  { label: 'This year', start: () => `${new Date().getFullYear()}-01-01`, end: () => todayIso() },
];

export function DateRangeSheet({ initial, onApply, onClose }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [start, setStart] = useState(() => initial.start);
  const [end, setEnd] = useState(() => initial.end);

  function apply() {
    const normalized =
      start <= end ? { start, end } : { start: end, end: start };
    onApply?.(normalized);
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss date range picker"
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
              paddingHorizontal: spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text variant="heading" accessibilityRole="header" style={styles.title}>
              Custom date range
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date range picker"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.presets, { gap: spacing.sm }]}>
            {PRESETS.map((preset) => {
              const presetStart = preset.start();
              const presetEnd = preset.end();
              const active = start === presetStart && end === presetEnd;
              return (
                <Chip
                  key={preset.label}
                  label={preset.label}
                  active={active}
                  onPress={() => {
                    setStart(presetStart);
                    setEnd(presetEnd);
                  }}
                />
              );
            })}
          </View>

          <View style={{ marginTop: spacing.md }}>
            <DatePicker
              label="From"
              value={start}
              onChange={setStart}
              maximumDate={end}
              style={styles.field}
            />
            <DatePicker
              label="To"
              value={end}
              onChange={setEnd}
              maximumDate={todayIso()}
              style={styles.field}
            />
          </View>

          <View style={[styles.footer, { gap: spacing.sm }]}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
            <Button label="Apply" onPress={apply} style={styles.footerButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  field: {
    marginBottom: 0,
  },
  footer: {
    flexDirection: 'row',
    marginTop: 16,
  },
  footerButton: {
    flex: 1,
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
    paddingBottom: 12,
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sheet: {
    paddingTop: 8,
  },
  title: {
    flex: 1,
  },
});
