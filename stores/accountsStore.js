import { create } from 'zustand';

import { getAccounts, getAllTransactions } from '../database/repositories/dashboardRepository';
import { computeAccountBalance } from '../utils/calculations';

export const useAccountsStore = create((set) => ({
  accounts: [],
  isLoading: true,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });

    try {
      const [accounts, transactions] = await Promise.all([
        getAccounts(),
        getAllTransactions(),
      ]);

      set({
        accounts: accounts.map((account) => ({
          ...account,
          balance: computeAccountBalance(account, transactions),
        })),
        isLoading: false,
      });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },
}));