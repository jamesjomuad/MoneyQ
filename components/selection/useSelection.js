import { useCallback, useMemo, useState } from "react";

/**
 * Reusable multi-selection state for list screens.
 *
 * The three-state parent checkbox rule lives here: `selectionMode` decides
 * whether child checkboxes are visible, `parentState` is the parent's
 * three-value state (null = minus/indeterminate, true = checked, false =
 * unchecked), and `selectedIds` holds the picked stable ids. Keeping the mode
 * separate from the value means a partial (null) selection never hides the
 * children. Cancel — or a finished action — returns to the collapsed default.
 *
 * Eligibility is configurable: `isEligible` picks which rows can be selected
 * (so, e.g., folder rows can be excluded from a budget bulk-move) and `idOf`
 * extracts each row's stable id. Selection always addresses items by id,
 * never by array index, so filtered or reordered lists stay consistent.
 *
 * State stays local to whichever screen mounts the hook; nothing here knows
 * about folders, budgets, repositories, or stores.
 */
export function useSelection({ items, idOf = (item) => item.id, isEligible = () => true }) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const selectableIds = useMemo(
    () => items.filter(isEligible).map(idOf),
    [idOf, isEligible, items],
  );

  const isSelected = useCallback(
    (id) => selectedIds.includes(id),
    [selectedIds],
  );

  const allSelected =
    selectionMode &&
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.includes(id));

  // Three-state value derived from mode + selection: minus when collapsed
  // (the default) or when the picks are mixed, check when every eligible row
  // is selected, empty box when the mode is on but nothing is picked.
  const parentState = !selectionMode
    ? null
    : allSelected
      ? true
      : selectedIds.length === 0
        ? false
        : null;

  const toggleItem = useCallback((id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds([...selectableIds]);
  }, [selectableIds]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const toggleParent = useCallback(() => {
    if (!selectionMode) {
      // null → true: reveal the child checkboxes and check them all.
      selectAll();
      return;
    }
    // true → false clears everything but keeps the checkboxes visible;
    // false → true (and mixed → true) re-selects all eligible rows.
    setSelectedIds(allSelected ? [] : [...selectableIds]);
  }, [allSelected, selectableIds, selectAll, selectionMode]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  return {
    selectableIds,
    selectedIds,
    selectionMode,
    parentState,
    allSelected,
    isSelected,
    toggleItem,
    toggleParent,
    selectAll,
    clearSelection,
    exitSelection,
  };
}
