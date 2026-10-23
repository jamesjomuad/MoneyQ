import { View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { getArticle } from '../../content/helpArticles';

/**
 * Renders one article from content/helpArticles.js. The component knows
 * only the three block shapes the content module defines — paragraph,
 * sub-heading, numbered steps — so writing new guidance never touches
 * presentation code.
 */

function StepsBlock({ items }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
      {items.map((item, index) => (
        <View key={item} style={{ alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm }}>
          <Text variant="label" tone="primary" style={{ minWidth: 22 }}>
            {index + 1}.
          </Text>
          <View style={{ flex: 1 }}>
            <Text variant="body" style={{ lineHeight: 22 }}>
              {item}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function HelpArticleScreen() {
  const { spacing } = useTheme();
  const params = useLocalSearchParams();
  const article = getArticle(String(params.slug ?? ''));

  if (!article) {
    return (
      <>
        <Stack.Screen options={{ title: 'Help & Guide' }} />
        <Screen topInset>
          <EmptyState
            icon="help"
            title="Article not found"
            description="This guide entry does not exist. Back out and pick another one."
          >
            <Button label="Back" icon="chevronLeft" onPress={() => router.back()} />
          </EmptyState>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: article.title }} />
      <Screen topInset>
        <Text variant="title">{article.title}</Text>
        <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
          {article.summary}
        </Text>
        {article.blocks.map((block, index) => {
          if (block.type === 'h') {
            return (
              <Text key={`${block.type}-${index}`} variant="heading" style={{ marginTop: spacing.xl }}>
                {block.text}
              </Text>
            );
          }
          if (block.type === 'steps') {
            return <StepsBlock key={`steps-${index}`} items={block.items} />;
          }
          return (
            <Text key={`p-${index}`} variant="body" style={{ lineHeight: 22, marginTop: spacing.md }}>
              {block.text}
            </Text>
          );
        })}
        <View style={{ height: spacing.xxl }} />
      </Screen>
    </>
  );
}
