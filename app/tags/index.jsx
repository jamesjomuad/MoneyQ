import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { TagForm } from "../../components/tags/TagForm";
import { EmptyState } from "../../components/ui/EmptyState";
import { Fab } from "../../components/ui/Fab";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { TagBadge } from "../../components/ui/TagBadge";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useTagsStore } from "../../stores/tagsStore";

export default function TagsScreen() {
  const { colors, radius, spacing } = useTheme();
  const tags = useTagsStore((state) => state.tags);
  const isLoading = useTagsStore((state) => state.isLoading);
  const load = useTagsStore((state) => state.load);
  const addTag = useTagsStore((state) => state.addTag);
  const renameTag = useTagsStore((state) => state.renameTag);
  const removeTag = useTagsStore((state) => state.removeTag);
  const getUsage = useTagsStore((state) => state.getUsage);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(tag) {
    setEditing(tag);
    setFormOpen(true);
  }

  async function handleSave(values) {
    setSaving(true);
    try {
      if (editing) await renameTag(editing.id, values);
      else await addTag(values);
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      Alert.alert("Could not save tag", error?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(tag) {
    getUsage(tag.id).then((usage) => {
      Alert.alert(
        `Delete ${tag.name}?`,
        usage > 0
          ? `${usage} transaction${usage === 1 ? "" : "s"} will keep their amount but lose this tag.`
          : "No transactions use this tag.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await removeTag(tag.id);
              } catch (error) {
                Alert.alert(
                  "Could not delete tag",
                  error?.message ?? "Please try again.",
                );
              }
            },
          },
        ],
      );
    });
  }

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: "Tags" }} />
      <Screen contentContainerStyle={{ paddingBottom: 96 }}>
        <Text variant="body" tone="muted" style={{ marginBottom: spacing.lg }}>
          One shared library for every budget. Tap a tag to rename it or change
          its colour.
        </Text>

        {formOpen ? (
          <TagForm
            initial={editing}
            submitting={saving}
            onSave={handleSave}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
          />
        ) : null}

        <SectionHeader
          title={`All Tags · ${tags.length}`}
          action={
            !formOpen && tags.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={openCreate}
                hitSlop={8}
              >
                <Text variant="label" tone="primary">
                  Add tag
                </Text>
              </Pressable>
            ) : null
          }
        />

        {isLoading && tags.length === 0 ? (
          <Text variant="body" tone="muted">
            Loading tags…
          </Text>
        ) : tags.length === 0 ? (
          <EmptyState
            icon="tag"
            title="No tags yet"
            description="Add tags such as Household, Car or Daily Expenses so transactions can be grouped by what they were for."
          >
            <Pressable
              accessibilityRole="button"
              onPress={openCreate}
              hitSlop={8}
            >
              <Text variant="heading" tone="primary">
                Add your first tag
              </Text>
            </Pressable>
          </EmptyState>
        ) : (
          tags.map((tag) => (
            <View
              key={tag.id}
              style={[
                styles.row,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Rename ${tag.name}`}
                onPress={() => openEdit(tag)}
                style={({ pressed }) => [
                  styles.rowMain,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <TagBadge tag={tag} />
              </Pressable>

              <View style={styles.rowActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${tag.name}`}
                  onPress={() => openEdit(tag)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    { padding: 4, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Icon name="pencil" size={17} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${tag.name}`}
                  onPress={() => confirmDelete(tag)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    { padding: 4, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Icon name="trash" size={17} color={colors.expense} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        {tags.length > 0 ? (
          <Text
            variant="caption"
            tone="faint"
            style={{ marginTop: spacing.sm }}
          >
            Deleting a tag keeps its transactions; only the tag reference is
            cleared.
          </Text>
        ) : null}
      </Screen>
      {!formOpen ? (
        <Fab onPress={openCreate} accessibilityLabel="Add tag" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    paddingRight: 8,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
