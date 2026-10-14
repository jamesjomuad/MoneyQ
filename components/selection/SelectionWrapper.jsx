import { Pressable, StyleSheet } from 'react-native';

import { SelectionCheckbox } from './SelectionCheckbox';
import { SelectionToolbar } from './SelectionToolbar';
import { useSelection } from './useSelection';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Reusable wrapper for lists that support multi-selection. It owns the
 * selection state (via `useSelection`) and hands the screen back everything
 * it needs through a render prop, so the list layout stays fully the
 * screen's business:
 *
 * - `masterRow` — the three-state parent checkbox row with a hairline, meant
 *   to sit at the head of the list card; null when nothing is eligible.
 * - `toolbar` — the bottom contextual bar showing the count and the
 *   screen-supplied `actions`; null outside selection mode.
 * - `selectionMode / selectedIds / isSelected / toggleItem / toggleParent /
 *   exitSelection / parentState / allSelected / selectableIds` — the raw
 *   selection API, so rows can render their own child checkboxes and the
 *   screen can disable drag-and-drop while the mode is active.
 *
 * The wrapper is deliberately generic: it never imports a store or
 * repository and knows nothing about folders, budgets, or moves. Screens
 * configure eligibility per list (`isEligible` + `idOf` over stable ids) and
 * supply their own action callbacks.
 */
export function SelectionWrapper({
  items,
  idOf,
  isEligible,
  actions = [],
  selectLabel = 'Select all',
  deselectLabel = 'Deselect all',
  cancelLabel = 'Cancel',
  children,
}) {
  const { colors, spacing } = useTheme();
  const selection = useSelection({ items, idOf, isEligible });
  const { selectableIds, selectionMode, selectedIds, parentState, toggleParent, exitSelection } =
    selection;

  // The parent checkbox sits at the head of the list and covers exactly the
  // rows that can carry a child checkbox.
  const masterRow =
    selectableIds.length > 0 ? (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={parentState === true ? deselectLabel : selectLabel}
        accessibilityState={{ checked: parentState === true }}
        onPress={toggleParent}
        hitSlop={8}
        style={({ pressed }) => [
          styles.masterRow,
          {
            borderBottomColor: colors.border,
            borderBottomWidth: StyleSheet.hairlineWidth,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <SelectionCheckbox state={parentState} />
      </Pressable>
    ) : null;

  const toolbar = selectionMode ? (
    <SelectionToolbar
      count={selectedIds.length}
      onCancel={exitSelection}
      actions={actions}
      cancelLabel={cancelLabel}
    />
  ) : null;

  // Renders no wrapper node of its own: the screen's own tree is returned
  // untouched, so Home's flex layout and tab sizing stay pixel-identical.
  return children({ ...selection, masterRow, toolbar });
}

const styles = StyleSheet.create({
  masterRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
