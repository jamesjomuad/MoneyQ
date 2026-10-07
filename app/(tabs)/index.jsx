import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { BudgetCard } from '../../components/budgets/BudgetCard';
import { RepaymentRow } from '../../components/repayments/RepaymentRow';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Fab } from '../../components/ui/Fab';
import { Screen, ScreenTitle, SectionHeader } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { useBudgetsStore } from '../../stores/budgetsStore';
import { useRepaymentsStore } from '../../stores/repaymentsStore';
import { useSettingsStore } from '../../stores/settingsStore';

export default function HomeScreen() {
  const { colors, spacing } = useTheme();
  const budgets = useBudgetsStore((state) => state.budgets);
  const isLoading = useBudgetsStore((state) => state.isLoading);
  const load = useBudgetsStore((state) => state.load);
  const currency = useSettingsStore((state) => state.currency);
  const repayments = useRepaymentsStore((state) => state.pending);
  const loadRepayments = useRepaymentsStore((state) => state.load);
  const markPaid = useRepaymentsStore((state) => state.markPaid);
  const [settlingId, setSettlingId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      load();
      loadRepayments();
    }, [load, loadRepayments]),
  );

  // Money owed to me first, then money I owe — both earliest due date first,
  // both derived from the same pending rows the budget screens use.
  const owedToMe = repayments.filter((entry) => entry.repayment_direction === 'owed_to_me');
  const owedByMe = repayments.filter((entry) => entry.repayment_direction === 'owed_by_me');

  function openRepayment(transaction) {
    router.push({
      pathname: '/transaction/form',
      params: { budgetId: transaction.budget_id, transactionId: transaction.id },
    });
  }

  async function handleMarkPaid(transaction) {
    setSettlingId(transaction.id);
    try {
      await markPaid(transaction.id);
    } catch (error) {
      Alert.alert('Could not update', error?.message ?? 'Please try again.');
    } finally {
      setSettlingId(null);
    }
  }

  function renderMoneyList(rows) {
    return rows.map((transaction, index) => (
      <RepaymentRow
        key={transaction.id}
        transaction={transaction}
        budgetName={transaction.budget_name}
        currency={currency}
        onOpen={openRepayment}
        onMarkPaid={handleMarkPaid}
        busy={settlingId === transaction.id}
        isLast={index === rows.length - 1}
      />
    ));
  }

  return (
    <View style={styles.fill}>
      <Screen contentContainerStyle={{ paddingBottom: 96 }}>
        <ScreenTitle title="Home" subtitle="Budgets are folders that hold your transactions" />

        {budgets.length > 0 ? (
          <SectionHeader title={`Your Budgets · ${budgets.length}`} />
        ) : null}

        {isLoading && budgets.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
              Loading budgets…
            </Text>
          </View>
        ) : budgets.length === 0 ? (
          <EmptyState
            icon="folder"
            title="No budgets yet"
            description="A budget is a period you name, such as October 2026. Transactions you add inside it are what make up your spending."
          >
            <Button label="Create your first budget" onPress={() => router.push('/budget/form')} />
          </EmptyState>
        ) : (
          budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              currency={currency}
              onPress={() => router.push({ pathname: '/budget/[id]', params: { id: budget.id } })}
            />
          ))
        )}

        {owedToMe.length > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeader title={`Money Owed · ${owedToMe.length}`} />
            {renderMoneyList(owedToMe)}
          </View>
        ) : null}

        {owedByMe.length > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeader title={`Money Due · ${owedByMe.length}`} />
            {renderMoneyList(owedByMe)}
          </View>
        ) : null}
      </Screen>

      <Fab onPress={() => router.push('/budget/form')} accessibilityLabel="Create budget" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { alignItems: 'center', paddingVertical: 48 },
});
