import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Screen, SectionHeader } from '../components/ui/Screen';
import { Text } from '../components/ui/Text';
import { useTheme } from '../components/ui/ThemeProvider';
import { changelogSections } from '../constants/changelogMeta';

/**
 * Full release history, rendered from the parsed CHANGELOG.md that
 * scripts/generate-changelog-meta.mjs embeds in constants/changelogMeta.js
 * — the same parser that backs the About row, never a second copy of the
 * notes. Document order is preserved (newest first) and the original
 * wording survives; the screen only adds native formatting (no raw
 * Markdown syntax is ever shown).
 */

function BulletRow({ item, last }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.bulletRow,
        { paddingBottom: last ? 0 : spacing.xs, paddingLeft: spacing.md },
      ]}
    >
      <View style={[styles.bulletDot, { backgroundColor: colors.textFaint }]} />
      <Text variant="body" style={{ flex: 1 }}>
        {item}
      </Text>
    </View>
  );
}

function ReleaseSection({ section }) {
  const { spacing } = useTheme();

  const title = section.unreleased
    ? 'Unreleased'
    : section.version
      ? section.date
        ? `${section.version} — ${section.date}`
        : section.version
      : section.date
        ? `Released ${section.date}`
        : section.title;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <SectionHeader title={title} fontSize={13} />
      {section.unreleased ? (
        // Same honesty rule as the About row: unreleased is never presented
        // as shipped, so the section says so in its own words.
        <Text variant="caption" tone="faint" style={{ marginBottom: spacing.sm }}>
          Work captured in the changelog but not part of a versioned release yet.
        </Text>
      ) : null}
      <Card>
        <View style={{ gap: spacing.md }}>
          {section.categories.map((category, index) =>
            category.items.length === 0 ? null : (
              <View key={`${section.title}_${index}`}>
                {category.title ? (
                  <Text
                    variant="label"
                    tone="primary"
                    style={{ marginBottom: spacing.xs, textTransform: 'uppercase' }}
                  >
                    {category.title}
                  </Text>
                ) : null}
                {category.items.map((item, itemIndex) => (
                  <BulletRow
                    key={`${index}_${itemIndex}`}
                    item={item}
                    last={itemIndex === category.items.length - 1}
                  />
                ))}
              </View>
            ),
          )}
        </View>
      </Card>
    </View>
  );
}

export default function ChangelogScreen() {
  const { spacing } = useTheme();
  const hasContent = changelogSections?.length > 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Changelog' }} />
      <Screen topInset>
        {hasContent ? (
          <>
            <Text variant="caption" tone="faint" style={{ marginBottom: spacing.lg }}>
              Every documented change to Budgetarian, newest first. Content
              generated from the project changelog at build time — this screen
              needs no network and never edits the file.
            </Text>
            {changelogSections.map((section, index) => (
              <ReleaseSection key={`${section.title}_${index}`} section={section} />
            ))}
          </>
        ) : (
          <EmptyState
            icon="list"
            title="No changelog data"
            description="The app could not find generated changelog content. Run npm run gen:changelog and rebuild — nothing here is missing from the app itself."
          />
        )}
        <Text variant="caption" tone="faint" style={{ marginTop: spacing.md }}>
          © Budgetarian project changelog
        </Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  bulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  bulletDot: {
    borderRadius: 2,
    height: 4,
    marginTop: 8,
    width: 4,
  },
});
