import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveFolderPalette } from '../../utils/colors';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Bottom-sheet list of budget folders — the destination picker for "move to
 * folder". Folders are purely organizational, so picking one only changes the
 * budget's `folder_id`; nothing about its money data moves. `folders` arrives
 * in stored position order; picking "No folder" returns a budget to the Home
 * root.
 */
export function FolderPickerSheet({ folders = [], title = 'Move to folder', onPick, onClose }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss folder picker"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
            <Text variant="heading" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close folder picker"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              gap: spacing.xs,
              paddingBottom: spacing.md,
              paddingHorizontal: spacing.lg,
            }}
          >
            <FolderOptionRow
              label="No folder"
              caption="Returns to the Home list"
              onPress={() => onPick?.(null)}
              onClose={onClose}
            />
            {folders.map((folder) => (
              <FolderOptionRow
                key={folder.id}
                label={folder.name}
                folder={folder}
                onPress={() => onPick?.(folder.id)}
                onClose={onClose}
              />
            ))}
            {folders.length === 0 ? (
              <>
                <Text variant="caption" tone="faint" style={{ paddingVertical: spacing.sm, textAlign: 'center' }}>
                  No budget folders yet.
                </Text>
                <FolderOptionRow
                  label="Create a new folder"
                  caption="Opens the folder form"
                  accessibilityLabel="Create a new folder"
                  onPress={() => router.push('/folder/form')}
                  onClose={onClose}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** One tappable destination row; no `folder` means the ungrouped root. */
function FolderOptionRow({ label, caption, folder = null, onPress, onClose, accessibilityLabel }) {
  const { colors, radius, spacing } = useTheme();
  const palette = folder ? resolveFolderPalette(folder.color, colors) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (folder ? `Move to ${label}` : 'Move out of any folder')
      }
      onPress={() => {
        onClose?.();
        // The pick opens a confirmation Alert; firing it in the same tick as
        // the sheet dismiss races the Modal teardown on Android and the Alert
        // can be swallowed. Let the sheet close first.
        setTimeout(() => onPress?.(), 0);
      }}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
          borderRadius: radius.md,
          gap: spacing.sm,
        },
      ]}
    >
      {palette ? (
        <View
          style={[
            styles.swatch,
            { backgroundColor: palette.folder, borderColor: palette.folderBorder },
          ]}
        />
      ) : (
        <Icon name="home" size={18} color={colors.textMuted} />
      )}
      <View style={styles.optionText}>
        <Text variant="body" numberOfLines={1}>
          {label}
        </Text>
        {caption ? (
          <Text variant="caption" tone="faint">
            {caption}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" size={15} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  grabber: {
    alignSelf: 'center',
    borderRadius: 999,
    height: 4,
    marginTop: 8,
    width: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
    marginTop: 12,
  },
  iconButton: {
    padding: 4,
  },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionText: {
    flex: 1,
  },
  sheet: {
    maxHeight: '70%',
    paddingTop: 4,
  },
  swatch: {
    borderRadius: 7,
    borderWidth: 2,
    height: 26,
    width: 26,
  },
  title: {
    flex: 1,
  },
});
