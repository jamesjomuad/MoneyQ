import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Screen, ScreenTitle, SectionHeader } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';
import { formatMonth } from '../../utils/dates';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useSettingsStore } from '../../stores/settingsStore';

export default function DashboardScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);

  const summary = useDashboardStore((state) => state.summary);
  const counts = useDashboardStore((state) => state.counts);
  const schemaVersion = useDashboardStore((state) => state.schemaVersion);
  const isLoading = useDashboardStore((state) => state.isLoading);
  const load = useDashboardStore((state) => state.load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const money = (minorUnits) => formatCurrency(minorUnits, { currency });

  return (
    <Screen>
      <ScreenTitle
        title={summary.period ? formatMonth(summary.period.monthKey) : 'Overview'}
        subtitle="Your money at a glance"
      />

      <Card>
        <Text variant="label" tone="muted">
          TOTAL BALANCE
        </Text>
        <Text variant="display" style={{ marginTop: spacing.xs }}>
          {money(summary.balance)}
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="caption" tone="faint">
              Income
            </Text>
            <Text variant="heading" tone="income">
              {money(summary.income)}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="caption" tone="faint">
              Expenses
            </Text>
            <Text variant="heading" tone="expense">
              {money(summary.expense)}
            </Text>
          </View>
        </View>
      </Card>

      <View style={{ height: spacing.lg }} />

      <SectionHeader title="Recent activity" />
      {summary.recentTransactions.length === 0 ? (
        <Card>
          <EmptyState
            icon="list"
            title="No transactions yet"
            description="Add your first income or expense and it will appear here."
          />
        </Card>
      ) : (
        <Card padded={false}>
          {summary.recentTransactions.map((transaction) => (
            <View
              key={transaction.id}
              style={[styles.transactionRow, { borderBottomColor: colors.border }]}
            >
              <Text variant="body">{transaction.description || transaction.type}</Text>
              <Text
                variant="label"
                tone={
                  transaction.type === 'income'
                    ? 'income'
                    : transaction.type === 'expense'
                      ? 'expense'
                      : 'muted'
                }
              >
                {money(transaction.amount)}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ height: spacing.lg }} />

      <SectionHeader title="Storage" />
      <Card>
        <StorageRow label="Database" value="moneyq.db" />
        <StorageRow label="Schema version" value={String(schemaVersion)} />
        <StorageRow label="Categories" value={String(counts?.categoryCount ?? 0)} />
        <StorageRow label="Accounts" value={String(counts?.accountCount ?? 0)} />
        <StorageRow label="Transactions" value={String(counts?.transactionCount ?? 0)} />
      </Card>
    </Screen>
  );
}

function StorageRow({ label, value }) {
  const { colors } = useTheme();

  return (
    <View style={styles.storageRow}>
      <Text variant="body" tone="muted">
        {label}
      </Text>
      <Text variant="body" style={{ color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  transactionRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  storageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
});