import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { DatePicker } from "../../components/dates/DatePicker";
import { FolderColorField } from "../../components/budgets/FolderColorField";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { Screen, ScreenTitle, SectionHeader } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { TextField } from "../../components/ui/TextField";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useBudgetsStore } from "../../stores/budgetsStore";
import { showToast } from "../../stores/toastStore";
import { daysInclusive, parseFlexibleDate, suggestBudgetDates } from "../../utils/dates";

/**
 * Normalized snapshot for the dirty check: trimmed name, ISO dates, and a
 * null color meaning "theme default". Equal values always serialize equal,
 * so restoring a field counts as no change.
 */
function budgetSnapshot(values) {
  return JSON.stringify({
    name: (values.name ?? "").trim(),
    startDate: values.startDate ?? "",
    endDate: values.endDate ?? "",
    color: values.color ?? null,
  });
}

const PERIOD_CHIPS = [
  { label: "Last month", offset: -1 },
  { label: "This month", offset: 0 },
  { label: "Next month", offset: 1 },
];

export default function BudgetFormScreen() {
  const { id } = useLocalSearchParams();
  const { colors, spacing } = useTheme();
  const fetchBudget = useBudgetsStore((state) => state.fetchBudget);
  const addBudget = useBudgetsStore((state) => state.addBudget);
  const editBudget = useBudgetsStore((state) => state.editBudget);
  const removeBudget = useBudgetsStore((state) => state.removeBudget);

  const editing = typeof id === "string" && id.length > 0;
  const navigation = useNavigation();
  const [baseline, setBaseline] = useState(null);
  // One save at a time, at most one scheduled departure, and a flag so the
  // destructive Delete flow is never blocked by the auto-save listener.
  const savePromiseRef = useRef(null);
  const leavePlannedRef = useRef(false);
  const discardingRef = useRef(false);
  const baselineRef = useRef(null);

  const [name, setName] = useState(() =>
    editing ? "" : suggestBudgetDates(0).name,
  );
  const [startDate, setStartDate] = useState(() =>
    editing ? "" : suggestBudgetDates(0).startDate,
  );
  const [endDate, setEndDate] = useState(() =>
    editing ? "" : suggestBudgetDates(0).endDate,
  );
  // null keeps the theme-driven folder colors — custom colors are optional.
  const [color, setColor] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);

  useEffect(() => {
    if (!editing) return undefined;
    let cancelled = false;

    fetchBudget(id)
      .then((budget) => {
        if (cancelled || !budget) return;
        setName(budget.name);
        setStartDate(budget.start_date);
        setEndDate(budget.end_date);
        setColor(budget.color ?? null);
        const saved = budgetSnapshot(budget);
        setBaseline(saved);
        baselineRef.current = saved;
      })
      .catch((error) => {
        if (!cancelled)
          setFormError(error?.message ?? "Could not load this budget.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editing, id, fetchBudget]);

  const applyPeriod = useCallback((offset) => {
    const suggestion = suggestBudgetDates(offset);
    setName(suggestion.name);
    setStartDate(suggestion.startDate);
    setEndDate(suggestion.endDate);
    setErrors({});
    setFormError(null);
  }, []);

  // Picking a future start must stay possible, so the start calendar is not
  // capped by the end date; instead the end follows when the start passes it.
  const handleStartDateChange = useCallback((nextStart) => {
    setStartDate(nextStart);
    setEndDate((currentEnd) => (!currentEnd || nextStart > currentEnd ? nextStart : currentEnd));
    setErrors((current) => ({ ...current, start: undefined, end: undefined }));
    setFormError(null);
  }, []);

  // Live period length under the end date — display only, never saved.
  const periodLength = useMemo(() => {
    const start = parseFlexibleDate(startDate);
    const end = parseFlexibleDate(endDate);
    if (!start || !end || end < start) return undefined;
    const days = daysInclusive(start, end);
    return days === 1 ? 'A single day' : `${days} days long`;
  }, [startDate, endDate]);

  function validateBudget(values) {
    const nextErrors = {};
    const resolvedStart = parseFlexibleDate(values.startDate);
    const resolvedEnd = parseFlexibleDate(values.endDate);

    if (!values.name.trim()) nextErrors.name = "Give this budget a name.";
    if (!resolvedStart) nextErrors.start = "Pick a start date.";
    if (!resolvedEnd) nextErrors.end = "Pick an end date.";
    if (resolvedStart && resolvedEnd && resolvedEnd < resolvedStart) {
      nextErrors.end = "The end date must be on or after the start date.";
    }
    return nextErrors;
  }

  // Auto-save for edits: leaving the page (back button, header back, Android
  // hardware back, modal dismiss) saves real changes exactly once, and any
  // departure via blur does too. The effect only subscribes while the form
  // is meaningfully dirty, so an untouched visit performs zero writes and
  // zero toasts. Create mode keeps its explicit button.
  useEffect(() => {
    if (!editing || loading || baseline === null) return undefined;

    const values = { name, startDate, endDate, color };
    const snapshot = budgetSnapshot(values);
    if (snapshot === baseline) return undefined;

    async function autoSave() {
      // Re-check against the freshest saved baseline: the previous save's
      // reload may already hold these values, making this one a duplicate.
      if (snapshot === baselineRef.current) return "saved";

      const nextErrors = validateBudget(values);
      if (Object.keys(nextErrors).length > 0) {
        // Invalid edits are never silently dropped: hold the departure and
        // show what needs fixing.
        setErrors(nextErrors);
        showToast("Some fields need attention before this can be saved.", "warning");
        return "invalid";
      }

      setErrors({});
      try {
        await editBudget(id, {
          name: values.name.trim(),
          startDate: parseFlexibleDate(values.startDate),
          endDate: parseFlexibleDate(values.endDate),
          color: values.color,
        });
        baselineRef.current = snapshot;
        setBaseline(snapshot);
        showToast("Changes saved successfully", "success");
        return "saved";
      } catch {
        showToast("Couldn't save changes. Please try again.", "error");
        return "failed";
      }
    }

    // One save at a time, whichever lifecycle path asked for it.
    function ensureSave() {
      if (!savePromiseRef.current) {
        savePromiseRef.current = autoSave().finally(() => {
          savePromiseRef.current = null;
        });
      }
      return savePromiseRef.current;
    }

    const beforeRemove = (event) => {
      if (discardingRef.current) return; // Delete owns this departure.
      // The save may already have landed: treat that as clean and let this
      // departure through untouched.
      if (snapshot === baselineRef.current) return;
      event.preventDefault();
      if (leavePlannedRef.current) return; // a departure is already scheduled.
      leavePlannedRef.current = true;
      ensureSave().then((outcome) => {
        leavePlannedRef.current = false;
        if (outcome === "saved") router.back();
      });
    };

    const onBlur = () => {
      if (discardingRef.current) return;
      if (snapshot === baselineRef.current) return;
      ensureSave();
    };

    const unsubscribeRemove = navigation.addListener("beforeRemove", beforeRemove);
    const unsubscribeBlur = navigation.addListener("blur", onBlur);
    return () => {
      unsubscribeRemove();
      unsubscribeBlur();
    };
  }, [
    editing,
    loading,
    baseline,
    name,
    startDate,
    endDate,
    color,
    id,
    editBudget,
    navigation,
  ]);

  // Create mode only: edits save automatically when the screen is left.
  async function handleSave() {
    const nextErrors = validateBudget({ name, startDate, endDate, color });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setFormError(null);
    setSaving(true);

    try {
      const budget = await addBudget({
        name: name.trim(),
        startDate: parseFlexibleDate(startDate),
        endDate: parseFlexibleDate(endDate),
        color,
      });
      router.replace({ pathname: "/budget/[id]", params: { id: budget.id } });
    } catch (error) {
      setFormError(error?.message ?? "Could not save this budget.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    discardingRef.current = true;
    setSaving(true);
    try {
      await removeBudget(id);
      router.dismissAll();
      router.replace("/");
    } catch (error) {
      // The delete failed, so the screen stays: hand auto-save back.
      discardingRef.current = false;
      setFormError(error?.message ?? "Could not delete this budget.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen contentContainerStyle={{ paddingBottom: 48 }}>
        <Text variant="body" tone="muted">
          Loading budget…
        </Text>
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={{ paddingBottom: 48 }}>
      <ScreenTitle
        title={editing ? "Edit Budget" : "New Budget"}
        subtitle={
          editing
            ? "Change the name or period. Transactions stay exactly where they are."
            : "A budget is a named period. It has no spending limit — it simply holds the transactions you record inside it."
        }
      />

      {!editing ? (
        <>
          <SectionHeader title="Period" />
          <ScrollView
            vertical
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={{ marginBottom: spacing.lg }}
          >
            {PERIOD_CHIPS.map((chip) => (
              <Chip
                key={chip.offset}
                label={chip.label}
                onPress={() => applyPeriod(chip.offset)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionHeader title="Details" />
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="October 2026"
        error={errors.name}
        returnKeyType="done"
      />

      <FolderColorField value={color} onChange={setColor} />

      <SectionHeader title="Dates" />
      <DatePicker
        label="Starts on"
        value={startDate}
        onChange={handleStartDateChange}
        error={errors.start}
      />

      <DatePicker
        label="Ends on"
        value={endDate}
        onChange={setEndDate}
        minimumDate={startDate || undefined}
        hint={periodLength}
        error={errors.end}
      />

      {formError ? (
        <Text
          variant="caption"
          tone="expense"
          style={{ marginBottom: spacing.md }}
        >
          {formError}
        </Text>
      ) : null}

      {editing ? (
        <Text
          variant="caption"
          tone="faint"
          style={{ marginTop: spacing.md, textAlign: "center" }}
        >
          Changes save automatically when you leave this screen.
        </Text>
      ) : (
        <>
          <View style={{ height: spacing.sm }} />
          <Button
            label={saving ? "Saving…" : "Create budget"}
            onPress={handleSave}
            disabled={saving}
          />
        </>
      )}

      {editing ? (
        <Button
          label="Delete budget"
          variant="danger"
          onPress={handleDelete}
          disabled={saving}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <Text
        variant="caption"
        tone="faint"
        style={{ marginTop: spacing.md, color: colors.textFaint }}
      >
        Everything stays on this device.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { paddingRight: 8 },
});
