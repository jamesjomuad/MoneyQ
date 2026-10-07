import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addDaysIso,
  addMonths,
  DATE_SHORTCUTS,
  formatDate,
  formatMonth,
  isWithin,
  monthWeeks,
  toMonthKey,
  todayIso,
  WEEKDAY_LABELS,
} from '../../utils/dates';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

const MIN_BOUND = '0000-01-01';
const MAX_BOUND = '9999-12-31';

/**
 * Bottom-sheet calendar. The picked day lives in local `pending` state until
 * Done commits it, so Cancel (or the backdrop) can never mutate the value.
 *
 * Mount it (rather than toggling a prop) when the sheet opens: the state below
 * then seeds itself from `value` without an effect, so reopening always lands
 * on the value's own month.
 */
export function CalendarSheet({
  title = 'Pick a date',
  value,
  minimumDate,
  maximumDate,
  shortcuts = false,
  onChange,
  onClose,
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const today = todayIso();

  const [pending, setPending] = useState(() => value || today);
  const [monthKey, setMonthKey] = useState(() => toMonthKey(value || today));

  const minMonth = minimumDate ? toMonthKey(minimumDate) : null;
  const maxMonth = maximumDate ? toMonthKey(maximumDate) : null;
  const canGoPrevious = !minMonth || monthKey > minMonth;
  const canGoNext = !maxMonth || monthKey < maxMonth;

  function commit() {
    onChange?.(pending);
    onClose?.();
  }

  function choose(isoDate) {
    setPending(isoDate);
  }

  return (
    <Modal
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss date picker"
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
              accessibilityLabel="Close date picker"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.monthRow, { paddingHorizontal: spacing.md }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              disabled={!canGoPrevious}
              onPress={() => setMonthKey(addMonths(monthKey, -1))}
              hitSlop={8}
              style={({ pressed }) => [
                styles.navButton,
                { opacity: !canGoPrevious ? 0.3 : pressed ? 0.55 : 1 },
              ]}
            >
              <Icon name="chevronLeft" size={22} color={colors.text} />
            </Pressable>

            <Text variant="title" accessibilityRole="header">
              {formatMonth(monthKey)}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              disabled={!canGoNext}
              onPress={() => setMonthKey(addMonths(monthKey, 1))}
              hitSlop={8}
              style={({ pressed }) => [
                styles.navButton,
                { opacity: !canGoNext ? 0.3 : pressed ? 0.55 : 1 },
              ]}
            >
              <Icon name="chevronRight" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map((weekday) => (
              <Text
                key={weekday}
                variant="caption"
                tone="faint"
                style={styles.weekCell}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {weekday.toUpperCase()}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {monthWeeks(monthKey).map((week, weekIndex) => (
              <View key={`week-${weekIndex}`} style={styles.week}>
                {week.map((isoDate, cellIndex) => {
                  if (!isoDate) {
                    return <View key={`blank-${weekIndex}-${cellIndex}`} style={styles.cell} />;
                  }

                  const disabled = !isWithin(
                    isoDate,
                    minimumDate || MIN_BOUND,
                    maximumDate || MAX_BOUND,
                  );
                  const selected = isoDate === pending;
                  const isToday = isoDate === today;
                  const label = formatDate(isoDate);

                  return (
                    <Pressable
                      key={isoDate}
                      accessibilityRole="button"
                      accessibilityLabel={
                        disabled
                          ? `${label}, unavailable`
                          : selected
                            ? `${label}, selected`
                            : label
                      }
                      accessibilityState={{ selected, disabled }}
                      disabled={disabled}
                      onPress={() => choose(isoDate)}
                      style={styles.cell}
                    >
                      <View
                        style={[
                          styles.day,
                          selected && { backgroundColor: colors.primary },
                          isToday && !selected && { borderColor: colors.primary },
                        ]}
                      >
                        <Text
                          variant="body"
                          tone={
                            selected
                              ? 'onPrimary'
                              : isToday
                                ? 'primary'
                                : disabled
                                  ? 'faint'
                                  : 'default'
                          }
                          style={[styles.dayText, selected && styles.dayTextSelected]}
                        >
                          {Number(isoDate.slice(8, 10))}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {shortcuts ? (
            <View style={[styles.shortcuts, { paddingHorizontal: spacing.lg }]}>
              {DATE_SHORTCUTS.map((shortcut) => {
                const isoDate = addDaysIso(today, shortcut.offset);
                return (
                  <Chip
                    key={shortcut.label}
                    label={shortcut.label}
                    active={isoDate === pending}
                    onPress={() => choose(isoDate)}
                  />
                );
              })}
            </View>
          ) : null}

          <View style={[styles.footer, { paddingHorizontal: spacing.lg }]}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={onClose}
              style={styles.footerButton}
            />
            <Button label="Done" onPress={commit} style={styles.footerButton} />
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
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  navButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  weekCell: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    paddingHorizontal: 8,
  },
  week: {
    flexDirection: 'row',
  },
  cell: {
    alignItems: 'center',
    flex: 1,
    height: 48,
    justifyContent: 'center',
    minWidth: 0,
  },
  day: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'transparent',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  dayText: {
    textAlign: 'center',
  },
  dayTextSelected: {
    fontWeight: '700',
  },
  shortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
  },
  footerButton: {
    flex: 1,
  },
});
