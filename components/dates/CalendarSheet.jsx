import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addDaysIso,
  addMonths,
  addYears,
  currentMonthKey,
  DATE_SHORTCUTS,
  formatDate,
  isWithin,
  MONTH_LABELS,
  monthWeeks,
  SHORT_MONTH_LABELS,
  todayIso,
  toMonthKey,
  WEEKDAY_LABELS,
} from '../../utils/dates';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

const MIN_BOUND = '0000-01-01';
const MAX_BOUND = '9999-12-31';
const YEAR_BLOCK = 12;

const pad = (value) => String(value).padStart(2, '0');

/**
 * Bottom-sheet calendar. The picked day lives in local `pending` state until
 * Done commits it, so Cancel (or the backdrop) can never mutate the value.
 *
 * Mount it (rather than toggling a prop) when the sheet opens: the state below
 * then seeds itself from `value` without an effect, so reopening always lands
 * on the value's own month.
 *
 * The header offers three views: the day grid plus quick month and year
 * panels, so jumping a season or a year never means tapping the arrows
 * repeatedly. Both panels honour the existing min/max bounds and return to
 * the day grid on selection.
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
  const [view, setView] = useState('days');

  const displayedYear = Number(monthKey.slice(0, 4));
  const displayedMonth = Number(monthKey.slice(5, 7));
  const blockStart = Math.floor(displayedYear / YEAR_BLOCK) * YEAR_BLOCK;
  const thisMonth = currentMonthKey();
  const thisYear = Number(today.slice(0, 4));

  const minMonth = minimumDate ? toMonthKey(minimumDate) : null;
  const maxMonth = maximumDate ? toMonthKey(maximumDate) : null;
  const minYear = minimumDate ? Number(minimumDate.slice(0, 4)) : null;
  const maxYear = maximumDate ? Number(maximumDate.slice(0, 4)) : null;

  const canGoPrevious =
    view === 'days'
      ? !minMonth || monthKey > minMonth
      : view === 'months'
        ? minYear === null || displayedYear > minYear
        : minYear === null || blockStart > minYear;
  const canGoNext =
    view === 'days'
      ? !maxMonth || monthKey < maxMonth
      : view === 'months'
        ? maxYear === null || displayedYear < maxYear
        : maxYear === null || blockStart + YEAR_BLOCK - 1 < maxYear;

  function shift(delta) {
    setMonthKey((key) => (view === 'days' ? addMonths(key, delta) : addYears(key, delta * (view === 'months' ? 1 : YEAR_BLOCK))));
  }

  function clampMonth(key) {
    if (minMonth && key < minMonth) return minMonth;
    if (maxMonth && key > maxMonth) return maxMonth;
    return key;
  }

  function pickMonth(month) {
    setMonthKey(clampMonth(`${displayedYear}-${pad(month)}`));
    setView('days');
  }

  function pickYear(year) {
    setMonthKey(clampMonth(`${year}-${pad(displayedMonth)}`));
    setView('days');
  }

  function commit() {
    onChange?.(pending);
    onClose?.();
  }

  function choose(isoDate) {
    setPending(isoDate);
  }

  const pill = (active) => [
    styles.pill,
    {
      backgroundColor: active ? colors.primarySoft : 'transparent',
      borderRadius: radius.pill,
    },
  ];

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
              accessibilityLabel={
                view === 'days' ? 'Previous month' : view === 'months' ? 'Previous year' : 'Earlier years'
              }
              disabled={!canGoPrevious}
              onPress={() => shift(-1)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.navButton,
                { opacity: !canGoPrevious ? 0.3 : pressed ? 0.55 : 1 },
              ]}
            >
              <Icon name="chevronLeft" size={22} color={colors.text} />
            </Pressable>

            {view === 'days' ? (
              <View style={styles.pillRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Change month, currently ${MONTH_LABELS[displayedMonth - 1]}`}
                  onPress={() => setView('months')}
                  hitSlop={6}
                  style={({ pressed }) => [
                    pill(false),
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text variant="title" numberOfLines={1}>
                    {MONTH_LABELS[displayedMonth - 1]}
                  </Text>
                  <Icon name="chevronDown" size={14} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Change year, currently ${displayedYear}`}
                  onPress={() => setView('years')}
                  hitSlop={6}
                  style={({ pressed }) => [
                    pill(false),
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text variant="title">{displayedYear}</Text>
                  <Icon name="chevronDown" size={14} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <Text
                variant="label"
                tone="muted"
                accessibilityRole="header"
                style={styles.viewLabel}
              >
                {view === 'months' ? 'SELECT MONTH' : 'SELECT YEAR'}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                view === 'days' ? 'Next month' : view === 'months' ? 'Next year' : 'Later years'
              }
              disabled={!canGoNext}
              onPress={() => shift(1)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.navButton,
                { opacity: !canGoNext ? 0.3 : pressed ? 0.55 : 1 },
              ]}
            >
              <Icon name="chevronRight" size={22} color={colors.text} />
            </Pressable>
          </View>

          {view === 'days' ? (
            <>
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
                              : `${label}${selected ? ', selected' : ''}${isToday ? ', today' : ''}`
                          }
                          accessibilityState={{ selected, disabled }}
                          disabled={disabled}
                          onPress={() => choose(isoDate)}
                          style={styles.cell}
                        >
                          {({ pressed }) => (
                            <View
                              style={[
                                styles.day,
                                selected && { backgroundColor: colors.primary },
                                isToday &&
                                  !selected && { borderColor: colors.primary },
                                pressed &&
                                  !selected && { backgroundColor: colors.primarySoft },
                              ]}
                            >
                              <Text
                                variant="body"
                                tone={selected ? 'onPrimary' : disabled ? 'faint' : 'default'}
                                style={[
                                  styles.dayText,
                                  selected && styles.dayTextSelected,
                                  isToday && !selected && styles.dayTextToday,
                                ]}
                              >
                                {Number(isoDate.slice(8, 10))}
                              </Text>
                            </View>
                          )}
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
            </>
          ) : (
            <View style={styles.panel}>
              {view === 'months'
                ? SHORT_MONTH_LABELS.map((name, index) => {
                    const key = `${displayedYear}-${pad(index + 1)}`;
                    const selected = key === monthKey;
                    const current = key === thisMonth;
                    const disabled =
                      (minMonth !== null && key < minMonth) ||
                      (maxMonth !== null && key > maxMonth);
                    return (
                      <Pressable
                        key={name}
                        accessibilityRole="button"
                        accessibilityLabel={`${MONTH_LABELS[index]} ${displayedYear}${
                          current ? ', current month' : ''
                        }`}
                        accessibilityState={{ selected, disabled }}
                        disabled={disabled}
                        onPress={() => pickMonth(index + 1)}
                        style={({ pressed }) => [styles.panelCell, { opacity: pressed ? 0.6 : 1 }]}
                      >
                        <View
                          style={[
                            styles.panelPill,
                            { borderRadius: radius.pill },
                            selected && { backgroundColor: colors.primary },
                            current &&
                              !selected && {
                                borderColor: colors.primary,
                                borderWidth: 1.5,
                              },
                            disabled && { opacity: 0.35 },
                          ]}
                        >
                          <Text
                            variant="label"
                            tone={
                              selected
                                ? 'onPrimary'
                                : current
                                  ? 'primary'
                                  : disabled
                                    ? 'faint'
                                    : 'muted'
                            }
                            style={[
                              styles.panelText,
                              (selected || current) && styles.panelTextStrong,
                            ]}
                          >
                            {name.toUpperCase()}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                : Array.from({ length: YEAR_BLOCK }, (_, offset) => blockStart + offset).map(
                    (year) => {
                      const selected = year === displayedYear;
                      const current = year === thisYear;
                      const disabled =
                        (minYear !== null && year < minYear) ||
                        (maxYear !== null && year > maxYear);
                      return (
                        <Pressable
                          key={year}
                          accessibilityRole="button"
                          accessibilityLabel={`${year}${current ? ', current year' : ''}`}
                          accessibilityState={{ selected, disabled }}
                          disabled={disabled}
                          onPress={() => pickYear(year)}
                          style={({ pressed }) => [styles.panelCell, { opacity: pressed ? 0.6 : 1 }]}
                        >
                          <View
                            style={[
                              styles.panelPill,
                              { borderRadius: radius.pill },
                              selected && { backgroundColor: colors.primary },
                              current &&
                                !selected && {
                                  borderColor: colors.primary,
                                  borderWidth: 1.5,
                                },
                              disabled && { opacity: 0.35 },
                            ]}
                          >
                            <Text
                              variant="label"
                              tone={
                                selected
                                  ? 'onPrimary'
                                  : current
                                    ? 'primary'
                                    : disabled
                                      ? 'faint'
                                      : 'muted'
                              }
                              style={[
                                styles.panelText,
                                (selected || current) && styles.panelTextStrong,
                              ]}
                            >
                              {year}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    },
                  )}
            </View>
          )}

          <View style={[styles.footer, { paddingHorizontal: spacing.lg }]}>
            <Button
              label={view === 'days' ? 'Cancel' : 'Back to calendar'}
              variant="secondary"
              onPress={() => (view === 'days' ? onClose?.() : setView('days'))}
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
    minHeight: 52,
    paddingVertical: 4,
  },
  navButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pillRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minWidth: 0,
  },
  pill: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  viewLabel: {
    flex: 1,
    textAlign: 'center',
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
  dayTextToday: {
    fontWeight: '600',
  },
  panel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 252,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  panelCell: {
    alignItems: 'center',
    aspectRatio: 1.9,
    flexBasis: '25%',
    flexGrow: 1,
    justifyContent: 'center',
  },
  panelPill: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderWidth: 1.5,
    bottom: 4,
    justifyContent: 'center',
    left: 4,
    position: 'absolute',
    right: 4,
    top: 4,
  },
  panelText: {
    textAlign: 'center',
  },
  panelTextStrong: {
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
