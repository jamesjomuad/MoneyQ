import { Pressable, StyleSheet, View } from 'react-native';

import {
  addMonths,
  formatDate,
  formatMonth,
  monthWeeks,
  todayIso,
  WEEKDAY_LABELS,
} from '../../utils/dates';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Compact month grid for the Calendar tab. Day cells carry two optional
 * activity dots — one for recorded transactions, one for due reminders — so
 * busy dates are visible at a glance without cluttering the grid.
 *
 * Today is a ringed day, the selection is a filled day, so both states read
 * without relying on color alone. All dates are plain local 'YYYY-MM-DD'
 * strings; nothing here constructs a Date from a timestamp.
 */
export function MonthCalendar({
  monthKey,
  selectedDate,
  activityDates,
  reminderDates,
  onChangeMonth,
  onSelectDate,
}) {
  const { colors, spacing } = useTheme();
  const today = todayIso();

  return (
    <View>
      <View style={styles.monthRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => onChangeMonth(addMonths(monthKey, -1))}
          hitSlop={8}
          style={({ pressed }) => [styles.navButton, { opacity: pressed ? 0.55 : 1 }]}
        >
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </Pressable>

        <Text variant="title" accessibilityRole="header">
          {formatMonth(monthKey)}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => onChangeMonth(addMonths(monthKey, 1))}
          hitSlop={8}
          style={({ pressed }) => [styles.navButton, { opacity: pressed ? 0.55 : 1 }]}
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

      {monthWeeks(monthKey).map((week, weekIndex) => (
        <View key={`week-${weekIndex}`} style={styles.week}>
          {week.map((isoDate, cellIndex) => {
            if (!isoDate) {
              return <View key={`blank-${weekIndex}-${cellIndex}`} style={styles.cell} />;
            }

            const selected = isoDate === selectedDate;
            const isToday = isoDate === today;
            const hasActivity = activityDates.has(isoDate);
            const hasReminder = reminderDates.has(isoDate);
            const label = [
              formatDate(isoDate),
              hasActivity ? 'has transactions' : null,
              hasReminder ? 'has reminders' : null,
              isToday ? 'today' : null,
              selected ? 'selected' : null,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <Pressable
                key={isoDate}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onPress={() => onSelectDate(isoDate)}
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
                    tone={selected ? 'onPrimary' : isToday ? 'primary' : 'default'}
                    style={[styles.dayText, selected && styles.dayTextSelected]}
                  >
                    {Number(isoDate.slice(8, 10))}
                  </Text>
                </View>

                <View style={styles.dots}>
                  {hasActivity ? (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: selected ? colors.onPrimary : colors.primary },
                      ]}
                    />
                  ) : null}
                  {hasReminder ? (
                    <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={{ height: spacing.xs }} />
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  navButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  weekRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  weekCell: {
    flex: 1,
    textAlign: 'center',
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
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  dayText: {
    textAlign: 'center',
  },
  dayTextSelected: {
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 7,
    justifyContent: 'center',
    marginTop: 1,
  },
  dot: {
    borderRadius: 999,
    height: 5,
    width: 5,
  },
});
