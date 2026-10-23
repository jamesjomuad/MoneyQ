import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Screen, SectionHeader } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { useTheme } from '../../components/ui/ThemeProvider';
import { HELP_CATEGORIES, searchArticles } from '../../content/helpArticles';
import { SUPPORT_EMAIL } from '../../constants/support';
import { useOnboardingStore } from '../../stores/onboardingStore';

/**
 * Help & Guide: everything the app can do, bundled offline as plain data
 * (content/helpArticles.js) and presented here. A search box filters the
 * article list; below it, the categories group everything. The
 * Introduction replay sits at the top on purpose — it is the one action
 * that shows rather than tells, and replaying writes nothing.
 */

function ArticleRow({ article, categoryTitle, showCategory, last }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/help/${article.id}`)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
          borderBottomColor: colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.rowBody}>
        <Text variant="body">{article.title}</Text>
        <Text variant="caption" tone="faint" style={{ marginTop: 2 }}>
          {showCategory ? `${categoryTitle} · ` : ''}
          {article.summary}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

export default function HelpScreen() {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = searching ? searchArticles(query) : null;

  const replay = () => useOnboardingStore.getState().replay();

  return (
    <Screen topInset>
      <TextField
        placeholder="Search articles"
        clearable
        value={query}
        onChangeText={setQuery}
        style={{ marginBottom: spacing.md }}
      />

      {/* Replay first: it is the most useful action on the page for a
          refresher, and it cannot harm anything — the overlay reads no
          data and its dismissal writes nothing beyond hiding itself. */}
      <SectionHeader title="Introduction" />
      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          onPress={replay}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' },
          ]}
        >
          <Icon name="play" size={20} color={colors.primary} />
          <View style={styles.rowBody}>
            <Text variant="body">Replay Introduction</Text>
            <Text variant="caption" tone="faint" style={{ marginTop: 2 }}>
              Watch the five-slide tour again — your data and settings are untouched.
            </Text>
          </View>
        </Pressable>
      </Card>

      {results ? (
        results.length === 0 ? (
          <View style={{ marginTop: spacing.xxl }}>
            <EmptyState
              icon="search"
              title="No articles found"
              description="Try a different word — searches cover titles and everything written inside the articles."
            />
          </View>
        ) : (
          <>
            <View style={{ height: spacing.xl }} />
            <SectionHeader title={`Results · ${results.length}`} />
            <Card padded={false}>
              {results.map(({ article, category }, index) => (
                <ArticleRow
                  key={article.id}
                  article={article}
                  categoryTitle={category.title}
                  showCategory
                  last={index === results.length - 1}
                />
              ))}
            </Card>
          </>
        )
      ) : (
        HELP_CATEGORIES.map((category) => (
          <View key={category.key}>
            <View style={{ height: spacing.xl }} />
            <SectionHeader title={category.title} />
            <Card padded={false}>
              {category.articles.map((article, index) => (
                <ArticleRow
                  key={article.id}
                  article={article}
                  categoryTitle={category.title}
                  showCategory={false}
                  last={index === category.articles.length - 1}
                />
              ))}
              {/* The one direct contact action, and only when a real
                  address exists. The feedback article explains where the
                  developer configures it; until then this row — and with
                  it any broken mailto — simply does not exist. */}
              {category.key === 'feedback' && SUPPORT_EMAIL && Platform.OS !== 'web' ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Budgetarian feedback`)}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' },
                  ]}
                >
                  <Icon name="mail" size={20} color={colors.primary} />
                  <View style={styles.rowBody}>
                    <Text variant="body">Email the developer</Text>
                    <Text variant="caption" tone="faint" style={{ marginTop: 2 }}>
                      Opens your own mail app with a blank message — nothing is attached automatically.
                    </Text>
                  </View>
                </Pressable>
              ) : null}
            </Card>
          </View>
        ))
      )}

      <View style={{ height: spacing.xxl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBody: {
    flex: 1,
  },
});
