import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";

import { FolderColorField } from "../../components/budgets/FolderColorField";
import { Button } from "../../components/ui/Button";
import { Screen, ScreenTitle } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { TextField } from "../../components/ui/TextField";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useFoldersStore } from "../../stores/foldersStore";
import { showToast } from "../../stores/toastStore";

/**
 * Create or edit a budget folder. Folders organize budgets only: this form
 * touches a name and a color, nothing else. Editing behaves like the budget
 * form — changes save automatically when the screen is left.
 */
function folderSnapshot(values) {
  return JSON.stringify({
    name: (values.name ?? "").trim(),
    color: values.color ?? null,
  });
}

export default function FolderFormScreen() {
  const { id } = useLocalSearchParams();
  const { spacing } = useTheme();
  const fetchFolder = useFoldersStore((state) => state.fetchFolder);
  const addFolder = useFoldersStore((state) => state.addFolder);
  const editFolder = useFoldersStore((state) => state.editFolder);
  const removeFolder = useFoldersStore((state) => state.removeFolder);

  const editing = typeof id === "string" && id.length > 0;
  const navigation = useNavigation();
  const [baseline, setBaseline] = useState(null);
  const savePromiseRef = useRef(null);
  const leavePlannedRef = useRef(false);
  const discardingRef = useRef(false);
  const baselineRef = useRef(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);

  useFocusEffect(
    useCallback(() => {
      if (!editing) return undefined;
      let cancelled = false;

      fetchFolder(id)
        .then((folder) => {
          if (cancelled || !folder) return;
          setName(folder.name);
          setColor(folder.color ?? null);
          const saved = folderSnapshot(folder);
          setBaseline(saved);
          baselineRef.current = saved;
        })
        .catch((error) => {
          if (!cancelled)
            setFormError(error?.message ?? "Could not load this folder.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [editing, id, fetchFolder]),
  );

  function validateFolder(values) {
    const nextErrors = {};
    if (!values.name.trim()) nextErrors.name = "Give this folder a name.";
    else if (values.name.trim().length > 40)
      nextErrors.name = "Folder names must be 40 characters or fewer.";
    return nextErrors;
  }

  // Auto-save for edits: same lifecycle rules as the budget form — leave or
  // blur saves real changes exactly once; an untouched visit writes nothing.
  useEffect(() => {
    if (!editing || loading || baseline === null) return undefined;

    const values = { name, color };
    const snapshot = folderSnapshot(values);
    if (snapshot === baseline) return undefined;

    async function autoSave() {
      if (snapshot === baselineRef.current) return "saved";

      const nextErrors = validateFolder(values);
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        showToast("Some fields need attention before this can be saved.", "warning");
        return "invalid";
      }

      setErrors({});
      try {
        await editFolder(id, {
          name: values.name.trim(),
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

    function ensureSave() {
      if (!savePromiseRef.current) {
        savePromiseRef.current = autoSave().finally(() => {
          savePromiseRef.current = null;
        });
      }
      return savePromiseRef.current;
    }

    const beforeRemove = (event) => {
      if (discardingRef.current) return;
      if (snapshot === baselineRef.current) return;
      event.preventDefault();
      if (leavePlannedRef.current) return;
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
  }, [editing, loading, baseline, name, color, id, editFolder, navigation]);

  // Create mode only: edits save automatically when the screen is left.
  async function handleSave() {
    const nextErrors = validateFolder({ name, color });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setFormError(null);
    setSaving(true);

    try {
      const folder = await addFolder({ name: name.trim(), color });
      router.replace({ pathname: "/folder/[id]", params: { id: folder.id } });
    } catch (error) {
      setFormError(error?.message ?? "Could not save this folder.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      `Delete "${name.trim() || "this folder"}"?`,
      'The budgets inside are archived, not deleted — they move to the Archive with their transactions, tags and reminders intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            discardingRef.current = true;
            setSaving(true);
            try {
              await removeFolder(id);
              // Single navigation action; dismissAll()+replace() in the same
              // tick is the react-native-screens #4429 crash trigger on Android.
              router.dismissTo('/');
            } catch (error) {
              discardingRef.current = false;
              setFormError(error?.message ?? 'Could not delete this folder.');
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <Screen contentContainerStyle={{ paddingBottom: 48 }}>
        <Text variant="body" tone="muted">
          Loading folder…
        </Text>
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={{ paddingBottom: 48 }}>
      <ScreenTitle
        title={editing ? "Edit folder" : "New folder"}
        subtitle={
          editing
            ? "Rename it or change its color. Budgets keep their data; only the label changes."
            : "Folders group budgets on Home — for example Travel or Business. They hold no money themselves."
        }
      />

      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Travel"
        error={errors.name}
        returnKeyType="done"
      />

      <FolderColorField value={color} onChange={setColor} />

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
            label={saving ? "Saving…" : "Create folder"}
            icon={saving ? undefined : "add"}
            onPress={handleSave}
            disabled={saving}
          />
        </>
      )}

      {editing ? (
        <Button
          label="Delete folder"
          icon="trash"
          variant="danger"
          onPress={handleDelete}
          disabled={saving}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <Text
        variant="caption"
        tone="faint"
        style={{ marginTop: spacing.md }}
      >
        Everything stays on this device.
      </Text>
    </Screen>
  );
}
