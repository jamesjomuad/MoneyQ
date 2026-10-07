import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDate, friendlyDate, isRelativeLabel } from '../../utils/dates';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { CalendarSheet } from './CalendarSheet';

/**
 * The app's one date field. It stores a plain 'YYYY-MM-DD' string and shows a
 * human label ('Today', 'Oct 7, 2026') instead of the raw value; tapping opens
 * the shared bottom-sheet calendar.
 *
 *   <DatePicker label="Date" value={date} onChange={setDate} />
 */
export function DatePicker({
  label,
  title,
  value,
  onChange,
  placeholder = 'Pick a date',
  minimumDate,
  maximumDate,
  disabled = false,
  error,
  hint,
  helperText,
  shortcuts = false,
  style,
}) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);

  const display = friendlyDate(value);
  const showFullDate = value ? isRelativeLabel(display) : false;
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
        accessibilityLabel={`${label || 'Date'}: ${display || placeholder}`}
        accessibilityHint="Opens a calendar to choose a date"
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
          {value ? (
            <>
              <Text variant="body">{display}</Text>
              {showFullDate ? (
                <Text variant="caption" tone="faint" style={{ marginTop: 1 }}>
                  {formatDate(value)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="body" tone="faint">
              {placeholder}
            </Text>
          )}
        </View>

        <Icon name="calendar" size={18} color={colors.textMuted} />
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
        <CalendarSheet
          title={title ?? label ?? 'Pick a date'}
          value={value}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          shortcuts={shortcuts}
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
