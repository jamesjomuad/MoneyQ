import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ColorPicker, { HueSlider, Panel1, PreviewText, Swatches } from 'reanimated-color-picker';

import { brandPalette, tagColors } from '../../constants/colors';
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
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);

  const palette = resolveFolderPalette(value, colors);

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
        Folder color
      </Text>

      <Pressable
        accessibilityRole="button"
        // Speak the brand name, not the raw hex ("#FF0000" is useless read
        // aloud); unknown hexes are simply "custom color".
        accessibilityLabel={`Folder color: ${
          value
            ? (brandPalette.find((brand) => brand.hex === value)?.name ?? 'custom color')
            : 'theme default'
        }`}
        onPress={() => setOpen(true)}
        hitSlop={10}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
            borderRadius: 50,
            minHeight: 44,
            justifyContent: 'center',
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
  const selectedBrand = brandPalette.find((brand) => brand.hex === pending);

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

          <GestureHandlerRootView style={styles.pickerScroll}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
            >
              <View>
                <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
                  Budgetarian Palette
                </Text>
                <View style={styles.brandRow}>
                  {brandPalette.map((brand) => {
                    const selected = pending === brand.hex;
                    // Ink/border stay readable on the swatch itself, so the
                    // checkmark shows on light colors and dark colors alike.
                    const ink = resolveFolderPalette(brand.hex, colors).folderInk;
                    return (
                      <Pressable
                        key={brand.hex}
                        accessibilityRole="button"
                        accessibilityLabel={`Brand color ${brand.name}`}
                        accessibilityState={{ selected }}
                        onPress={() => setPending(brand.hex)}
                        style={({ pressed }) => [
                          styles.brandSwatch,
                          {
                            backgroundColor: brand.hex,
                            borderColor: selected ? ink : 'transparent',
                            borderRadius: radius.md,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        {selected ? <Icon name="check" size={18} color={ink} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Text variant="label" tone="muted">
                Custom
              </Text>

              <ColorPicker
                value={pending ?? colors.primary}
                sliderThickness={22}
                thumbSize={22}
                thumbShape="circle"
                boundedThumb
                onCompleteJS={({ hex }) => setPending(hex.toUpperCase())}
                style={{ gap: spacing.md }}
              >
                <Panel1 style={{ borderRadius: radius.md, height: 180 }} />
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
                    <View style={styles.flex}>
                      <PreviewText style={{ color: colors.textMuted }} colorFormat="hex" />
                      {selectedBrand ? (
                        <Text variant="caption" tone="faint">
                          {selectedBrand.name}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text variant="body" tone="muted">
                      Theme default
                    </Text>
                  )}
                </View>
              </ColorPicker>
            </ScrollView>
          </GestureHandlerRootView>

          {pending ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPending(null)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.resetRow,
                {
                  minHeight: 44,
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                  paddingHorizontal: spacing.lg,
                },
              ]}
            >
              <Text variant="label" tone="primary">
                Use theme default
              </Text>
            </Pressable>
          ) : null}

          <View style={[styles.actions, { paddingHorizontal: spacing.lg, marginTop: spacing.md }]}>
            <Button label="Cancel" icon="close" variant="secondary" onPress={onClose} style={styles.flex} />
            <Button label="Use color" icon="check" onPress={commit} style={styles.flex} />
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
  brandRow: {
    flexDirection: 'row',
    gap: 10,
  },
  brandSwatch: {
    alignItems: 'center',
    aspectRatio: 1,
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    maxWidth: 48,
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
    maxHeight: '88%',
    paddingTop: 4,
  },
  pickerScroll: {
    flexShrink: 1,
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
