import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../ui/Icon';
import { useTheme } from '../ui/ThemeProvider';

/**
 * The shared selection checkbox: one box for all three visual states —
 * `state === true` checked, `state === false` unchecked, and `state === null`
 * indeterminate (a minus dash, used by parent/"select all" checkboxes while
 * only some rows are picked or while the group is collapsed).
 *
 * Two shapes:
 * - With `onPress` it is its own press target with checkbox semantics, so a
 *   checkbox tap can never race a row press or a drag. `nested` marks the
 *   case where the checkbox lives inside an already-pressable row:
 *   react-native-web maps "checkbox" to a real <input>, which cannot nest in
 *   the row's own <button>, so the web build keeps the aria state but drops
 *   the role, exactly like the pin toggle in BudgetCard.
 * - Without `onPress` it renders as a plain box for composing inside a larger
 *   press target (e.g. a whole-row "select all" master row, which carries
 *   the checkbox role and label itself).
 */
export function SelectionCheckbox({
  state = false,
  onPress,
  accessibilityLabel,
  nested = false,
  hitSlop = 11,
}) {
  const { colors } = useTheme();
  const boxStyle = [
    styles.box,
    {
      borderColor: state === true ? colors.primary : colors.border,
      backgroundColor: state === true ? colors.primary : 'transparent',
    },
  ];
  const content =
    state === true ? (
      <Icon name="check" size={14} color={colors.onPrimary} />
    ) : state === null ? (
      <View style={[styles.dash, { backgroundColor: colors.primary }]} />
    ) : null;

  if (!onPress) {
    return <View style={boxStyle}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole={Platform.OS === 'web' && nested ? undefined : 'checkbox'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: state === true }}
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [boxStyle, pressed ? { opacity: 0.6 } : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  dash: {
    borderRadius: 1,
    height: 2,
    width: 10,
  },
});
