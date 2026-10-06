import { Link, Stack } from 'expo-router';

import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { Text } from '../components/ui/Text';

export default function NotFoundScreen() {
  return (
    <Screen contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Text variant="title" style={{ textAlign: 'center' }}>
        This screen does not exist
      </Text>
      <Link href="/" asChild>
        <Button label="Back to Home" style={{ marginTop: 24 }} />
      </Link>
    </Screen>
  );
}