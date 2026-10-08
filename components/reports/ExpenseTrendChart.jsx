import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';
import { todayIso } from '../../utils/dates';

/**
 * Single-series expense bars over time. monthly = every calendar day,
 * yearly = 12 months, allTime = one bar per calendar year. Labels are
 * thinned when there are many bars so they cannot collide on narrow
 * screens. Zero periods keep a stub bar so gaps in spending stay visible.
 * Tapping a bar reveals its exact period and amount.
 */
const BAR_AREA = 140;
const MAX_BAR = 120;
const MIN_BAR = 4;
const ZERO_STUB = 2;

export function ExpenseTrendChart({ view, buckets = [], currency }) {
  const { colors } = useTheme();
  // The screen remounts this chart (via key) whenever the view or period
  // changes, so the tapped-bar selection resets with fresh data.
  const [selectedId, setSelectedId] = useState(null);

  const max = buckets.reduce((peak, bucket) => Math.max(peak, bucket.amount), 0);
  if (buckets.length === 0 || max === 0) return null;

  const today = view === 'monthly' ? todayIso() : null;
  const selected = buckets.find((bucket) => bucket.id === selectedId) ?? null;
  // Show every label unless the axis would crowd: days every 5, months or
  // years roughly every third when there are many.
  const labelEvery = view === 'monthly' ? 5 : buckets.length > 10 ? 3 : 1;
  const lastBucket = buckets.length - 1;

  return (
    <View>
      <View style={[styles.row, { height: BAR_AREA + 22 }]}>
        {buckets.map((bucket, index) => {
          const isToday = bucket.id === today;
          const isSelected = bucket.id === selectedId;
          const showLabel =
            index % labelEvery === 0 || isToday || index === lastBucket;
          return (
            <Pressable
              key={bucket.id}
              accessibilityRole="button"
              accessibilityLabel={`${bucket.periodLabel}, ${formatCurrency(bucket.amount, { currency })} spent`}
              onPress={() => setSelectedId(isSelected ? null : bucket.id)}
              style={[
                styles.column,
                isSelected && { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <View
                style={[
                  styles.bar,
                  {
                    backgroundColor: colors.expense,
                    height: barHeight(bucket.amount, max),
                    borderColor: isToday ? colors.primary : 'transparent',
                  },
                ]}
              />
              {showLabel ? (
                <Text variant={isToday ? 'label' : 'caption'} tone={isToday ? 'primary' : 'faint'} style={styles.label}>
                  {bucket.shortLabel}
                </Text>
              ) : (
                <Text variant="caption" style={styles.label}>
                  {'\u00A0'}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.baseline, { backgroundColor: colors.border }]} />

      <View style={[styles.detail, { minHeight: 18 }]}>
        {selected ? (
          <Text variant="caption" tone="default">
            {selected.periodLabel} · {formatCurrency(selected.amount, { currency })}
          </Text>
        ) : (
          <Text variant="caption" tone="faint">
            Tap a bar for details
          </Text>
        )}
      </View>
    </View>
  );
}

function barHeight(amount, max) {
  if (amount <= 0) return ZERO_STUB;
  return Math.max(MIN_BAR, Math.round((amount / max) * MAX_BAR));
}

const styles = StyleSheet.create({
  bar: {
    borderColor: 'transparent',
    borderRadius: 3,
    borderWidth: 2,
    maxWidth: 28,
    width: '70%',
  },
  baseline: {
    height: StyleSheet.hairlineWidth,
  },
  column: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    gap: 4,
    justifyContent: 'flex-end',
  },
  detail: {
    alignItems: 'center',
    marginTop: 6,
  },
  label: {
    fontSize: 10,
  },
  row: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 2,
  },
});
