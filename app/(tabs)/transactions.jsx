import { EmptyState } from '../../components/ui/EmptyState';
import { Screen } from '../../components/ui/Screen';

export default function TransactionsScreen() {
  return (
    <Screen>
      <EmptyState
        icon="list"
        title="No transactions yet"
        description="Income, expenses and transfers you record will be listed here, newest first."
      />
    </Screen>
  );
}