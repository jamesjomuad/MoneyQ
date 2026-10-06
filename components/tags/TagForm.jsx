import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/ThemeProvider';
import { DEFAULT_TAG_EMOJI, TAG_EMOJI_CHOICES } from '../../constants/finance';
import { tagColors } from '../../constants/colors';

/**
 * Shared create/rename form. The emoji grid and colour swatches are fixed
 * lists so adding a tag never leaves the screen.
 */
export function TagForm({ initial, submitting = false, onSave, onCancel }) {
  const { colors, radius, spacing } = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? DEFAULT_TAG_EMOJI);
  const [color, setColor] = useState(initial?.color ?? tagColors[0]);
  const [error, setError] = useState(null);

  async function handleSave() {
    if (!name.trim()) {
      setError('Give this tag a name.');
      return;
    }
    setError(null);
    await onSave({ name: name.trim(), emoji, color });
  }

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Groceries"
        error={error}
        maxLength={40}
        returnKeyType="done"
        autoFocus
      />

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        EMOJI
      </Text>
      <View style={styles.emojiGrid}>
        {TAG_EMOJI_CHOICES.map((choice) => {
          const active = choice === emoji;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Emoji ${choice}`}
              onPress={() => setEmoji(choice)}
              style={({ pressed }) => [
                styles.emoji,
                {
                  backgroundColor: active ? colors.primarySoft : colors.surfaceMuted,
                  borderColor: active ? colors.primary : 'transparent',
                  borderRadius: radius.sm,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: 18 }}>{choice}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="label" tone="muted" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        COLOUR
      </Text>
      <View style={styles.swatchRow}>
        {tagColors.map((swatch) => {
          const active = swatch === color;
          return (
            <Pressable
              key={swatch}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Colour ${swatch}`}
              onPress={() => setColor(swatch)}
              style={({ pressed }) => [
                styles.swatch,
                {
                  backgroundColor: swatch,
                  borderColor: active ? colors.text : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            />
          );
        })}
      </View>

      <View style={[styles.actions, { marginTop: spacing.lg }]}>
        <Button
          label={submitting ? 'Saving…' : 'Save tag'}
          onPress={handleSave}
          disabled={submitting}
          style={{ flex: 1 }}
        />
        <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emoji: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    marginRight: 6,
    marginBottom: 6,
    width: 38,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swatch: {
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    marginRight: 8,
    marginBottom: 8,
    width: 28,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
});