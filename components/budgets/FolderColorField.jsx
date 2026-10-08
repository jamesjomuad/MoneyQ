import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ColorPicker, { HueSlider, Panel1, PreviewText, Swatches } from 'reanimated-color-picker';

import { tagColors } from '../../constants/colors';
import { resolveFolderPalette } from '../../utils/colors';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Folder color field for the budget form. `value` is the user-selected hex
 * color or null, which keeps the theme-driven folder colors. Like the date
 * pickers, the sheet is mounted on open so its draft state seeds itself from
 * the current value and Cancel can never mutate it.
 */
export function FolderColorField({ value = null, onChange }) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);

  const palette = resolveFolderPalette(value, colors);

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
        Folder color
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Folder color: ${value ?? 'theme default'}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
            borderRadius: radius.md,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.swatch,
            {
              backgroundColor: palette.folder,
              borderColor: palette.folderBorder,
            },
          ]}
        />
        <View style={styles.flex}>
          <Text variant="body">{value ? 'Custom color' : 'Theme default'}</Text>
          <Text variant="caption" tone="faint">
            {value ?? 'Follows the app theme'}
          </Text>
        </View>
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      </Pressable>

      {open ? (
        <FolderColorSheet
          value={value}
          onChange={(next) => {
            onChange?.(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

function FolderColorSheet({ value, onChange, onClose }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [pending, setPending] = useState(value);
  const palette = resolveFolderPalette(pending, colors);

  function commit() {
    onChange(pending);
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={[styles.backdropWrap, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss color picker"
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
              Folder color
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close color picker"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <GestureHandlerRootView>
            <ColorPicker
              value={pending ?? colors.folderInk}
              sliderThickness={22}
              thumbSize={22}
              thumbShape="circle"
              boundedThumb
              onCompleteJS={({ hex }) => setPending(hex.toUpperCase())}
              style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
            >
              <Panel1 style={{ borderRadius: radius.md }} />
              <HueSlider style={{ borderRadius: radius.pill }} />
              <Swatches
                colors={tagColors}
                style={styles.swatches}
                swatchStyle={{ borderRadius: radius.sm, height: 28, width: 28, margin: 0 }}
              />
              <View style={styles.previewRow}>
                <View
                  style={[
                    styles.swatch,
                    styles.previewSwatch,
                    { backgroundColor: palette.folder, borderColor: palette.folderBorder },
                  ]}
                />
                {pending ? (
                  <PreviewText style={{ color: colors.textMuted }} colorFormat="hex" />
                ) : (
                  <Text variant="body" tone="muted">
                    Theme default
                  </Text>
                )}
              </View>
            </ColorPicker>
          </GestureHandlerRootView>

          {pending ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPending(null)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.resetRow,
                { opacity: pressed ? 0.7 : 1, paddingHorizontal: spacing.lg },
              ]}
            >
              <Text variant="label" tone="primary">
                Use theme default
              </Text>
            </Pressable>
          ) : null}

          <View style={[styles.actions, { paddingHorizontal: spacing.lg, marginTop: spacing.md }]}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.flex} />
            <Button label="Use color" onPress={commit} style={styles.flex} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  field: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
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
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  previewSwatch: {
    height: 32,
    width: 32,
  },
  resetRow: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 6,
  },
  sheet: {
    paddingTop: 4,
  },
  swatch: {
    borderRadius: 8,
    borderWidth: 2,
    height: 34,
    width: 34,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  title: {
    flex: 1,
  },
});
