import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { TagBadge } from '../ui/TagBadge';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { tagColors } from '../../constants/colors';
import { formatCurrency } from '../../utils/currency';
import { formatPercent } from '../../utils/reports';

/**
 * Expenses-by-tag pie. Slices are drawn as arc paths starting at 12 o'clock;
 * the only slice over 270 degrees (or a full ring) becomes a plain Circle so
 * the arc math never degenerates. Labels live in a legend below the chart —
 * never inside the slices — so they can never overlap.
 */
const SIZE = 160;
const C = SIZE / 2;
const R = C - 2;

function polar(angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [C + R * Math.cos(rad), C + R * Math.sin(rad)];
}

function slicePath(startDeg, endDeg) {
  const [x1, y1] = polar(startDeg);
  const [x2, y2] = polar(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${C} ${C}`,
    `L ${x1.toFixed(3)} ${y1.toFixed(3)}`,
    `A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`,
    'Z',
  ].join(' ');
}

function buildArcs(slices) {
  const arcs = [];
  let angle = 0;
  for (let index = 0; index < slices.length; index += 1) {
    const sweep = Math.min((slices[index].percent / 100) * 360, 360);
    arcs.push({ index, start: angle, end: angle + sweep, full: sweep >= 359.999 });
    angle += sweep;
  }
  return arcs;
}

export function PieChart({ slices = [], currency }) {
  const { colors, spacing } = useTheme();

  if (slices.length === 0) return null;

  const colorOf = (slice, index) => slice.tag?.color ?? tagColors[index % tagColors.length];
  const arcs = buildArcs(slices);

  return (
    <View style={styles.wrap}>
      <View style={[styles.chartBlock, { marginBottom: spacing.md }]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {arcs.map((arc) =>
            arc.full || slices.length === 1 ? (
              <Circle
                key={`slice-${arc.index}`}
                cx={C}
                cy={C}
                r={R}
                fill={colorOf(slices[arc.index], arc.index)}
              />
            ) : (
              <Path
                key={`slice-${arc.index}`}
                d={slicePath(arc.start, arc.end)}
                fill={colorOf(slices[arc.index], arc.index)}
                stroke={colors.surface}
                strokeWidth={1}
              />
            ),
          )}
        </Svg>
      </View>

      <View style={styles.legend}>
        {slices.map((slice, index) => (
          <View
            key={slice.tag?.id ?? `slice-${index}`}
            style={[styles.legendRow, { paddingVertical: spacing.xs }]}
            accessibilityLabel={`${slice.tag?.name ?? 'Tagged'}, ${formatCurrency(slice.spent, { currency })}, ${formatPercent(slice.percent)} of expenses`}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: colorOf(slice, index), borderRadius: 3 },
              ]}
            />
            <View style={styles.legendTag}>
              <TagBadge tag={slice.tag} size="sm" />
            </View>
            <Text variant="caption" tone="default" numberOfLines={1} style={styles.legendAmount}>
              {formatCurrency(slice.spent, { currency })}
            </Text>
            <Text variant="caption" tone="muted" style={styles.legendPercent}>
              {formatPercent(slice.percent)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartBlock: {
    alignItems: 'center',
  },
  legend: {
    gap: 2,
  },
  legendAmount: {
    fontVariant: ['tabular-nums'],
    marginRight: 6,
  },
  legendPercent: {
    minWidth: 40,
    textAlign: 'right',
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  legendTag: {
    flex: 1,
  },
  swatch: {
    height: 10,
    width: 10,
  },
  wrap: {
    alignItems: 'stretch',
  },
});
