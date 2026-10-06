import { EmptyState } from '../../components/ui/EmptyState';
import { Screen } from '../../components/ui/Screen';

export default function BudgetsScreen() {
  return (
    <Screen>
      <EmptyState
        icon="pie"
        title="No budgets yet"
        description="Set a monthly budget overall, or per category, and track how much is left."
      />
    </Screen>
  );
}