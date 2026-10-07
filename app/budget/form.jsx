import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { DatePicker } from "../../components/dates/DatePicker";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { Screen, ScreenTitle, SectionHeader } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { TextField } from "../../components/ui/TextField";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useBudgetsStore } from "../../stores/budgetsStore";
import { daysInclusive, parseFlexibleDate, suggestBudgetDates } from "../../utils/dates";

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

  const [name, setName] = useState(() =>
    editing ? "" : suggestBudgetDates(0).name,
  );
  const [startDate, setStartDate] = useState(() =>
    editing ? "" : suggestBudgetDates(0).startDate,
  );
  const [endDate, setEndDate] = useState(() =>
    editing ? "" : suggestBudgetDates(0).endDate,
  );
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

  // Live period length under the end date — display only, never saved.
  const periodLength = useMemo(() => {
    const start = parseFlexibleDate(startDate);
    const end = parseFlexibleDate(endDate);
    if (!start || !end || end < start) return undefined;
    const days = daysInclusive(start, end);
    return days === 1 ? 'A single day' : `${days} days long`;
  }, [startDate, endDate]);

  async function handleSave() {
    const nextErrors = {};
    const resolvedStart = parseFlexibleDate(startDate);
    const resolvedEnd = parseFlexibleDate(endDate);

    if (!name.trim()) nextErrors.name = "Give this budget a name.";
    if (!resolvedStart) nextErrors.start = "Pick a start date.";
    if (!resolvedEnd) nextErrors.end = "Pick an end date.";
    if (resolvedStart && resolvedEnd && resolvedEnd < resolvedStart) {
      nextErrors.end = "The end date must be on or after the start date.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setFormError(null);
    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        startDate: resolvedStart,
        endDate: resolvedEnd,
      };

      if (editing) {
        await editBudget(id, payload);
        router.back();
        return;
      }

      const budget = await addBudget(payload);
      router.replace({ pathname: "/budget/[id]", params: { id: budget.id } });
    } catch (error) {
      setFormError(error?.message ?? "Could not save this budget.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await removeBudget(id);
      router.dismissAll();
      router.replace("/");
    } catch (error) {
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

      <SectionHeader title="Dates" />
      <DatePicker
        label="Starts on"
        value={startDate}
        onChange={setStartDate}
        maximumDate={endDate || undefined}
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

      <View style={{ height: spacing.sm }} />
      <Button
        label={saving ? "Saving…" : editing ? "Save changes" : "Create budget"}
        onPress={handleSave}
        disabled={saving}
      />

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
