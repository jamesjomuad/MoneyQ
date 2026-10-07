import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatTime } from '../../utils/dates';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { TimeSheet } from './TimeSheet';

/**
 * The app's one time field. Stores 'HH:MM' (24-hour) and shows a human label
 * ('9:00 AM'); tapping opens the shared bottom-sheet clock, exactly like
 * DatePicker opens the calendar.
 *
 *   <TimePicker label="Time" value={time} onChange={setTime} />
 */
export function TimePicker({
  label,
  title,
  value,
  onChange,
  placeholder = 'Pick a time',
  disabled = false,
  error,
  hint,
  helperText,
  style,
}) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);

  const display = value ? formatTime(value) : '';
  const caption = error ?? hint ?? helperText;

  return (
    <View style={[{ marginBottom: spacing.lg }, style]}>
      {label ? (
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
          {label}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={`${label || 'Time'}: ${display || placeholder}`}
        accessibilityHint="Opens a clock to choose a time"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: error ? colors.expense : colors.border,
            borderRadius: radius.md,
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={styles.valueWrap}>
          {display ? (
            <Text variant="body">{display}</Text>
          ) : (
            <Text variant="body" tone="faint">
              {placeholder}
            </Text>
          )}
        </View>

        <Icon name="clock" size={18} color={colors.textMuted} />
      </Pressable>

      {caption ? (
        <Text
          variant="caption"
          tone={error ? 'expense' : 'faint'}
          style={{ marginTop: spacing.xs }}
        >
          {caption}
        </Text>
      ) : null}

      {/* Mounted only while open, so the sheet always seeds from `value`. */}
      {open ? (
        <TimeSheet
          title={title ?? label ?? 'Pick a time'}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  valueWrap: {
    flex: 1,
    paddingRight: 8,
  },
});
