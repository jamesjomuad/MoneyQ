import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { ACCOUNT_TYPE_LABELS } from '../../constants/finance';
import { formatCurrency } from '../../utils/currency';
import { useAccountsStore } from '../../stores/accountsStore';
import { useSettingsStore } from '../../stores/settingsStore';

export default function AccountsScreen() {
  const { colors } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const accounts = useAccountsStore((state) => state.accounts);
  const isLoading = useAccountsStore((state) => state.isLoading);
  const load = useAccountsStore((state) => state.load);

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

  return (
    <Screen>
      {accounts.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="No accounts yet"
          description="Add your cash, bank, e-wallet and savings accounts to start tracking your balance."
        />
      ) : (
        <Card padded={false}>
          {accounts.map((account) => (
            <View
              key={account.id}
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <View style={styles.flex}>
                <Text variant="body">{account.name}</Text>
                <Text variant="caption" tone="faint">
                  {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                </Text>
              </View>
              <Text variant="heading">{formatCurrency(account.balance, { currency })}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
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
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});