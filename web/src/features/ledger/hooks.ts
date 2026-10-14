"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { TxFilter } from "./api";

// 쿼리 키: ['ledger', 대상, 파라미터]
export const ledgerKeys = {
  all: ["ledger"] as const,
  tx: (f: TxFilter) => ["ledger", "tx", f] as const,
  categories: (kind?: string, archived?: boolean) => ["ledger", "categories", kind ?? "all", !!archived] as const,
  accounts: (archived?: boolean) => ["ledger", "accounts", !!archived] as const,
  budgets: (month: string) => ["ledger", "budgets", month] as const,
  usage: (month: string) => ["ledger", "usage", month] as const,
  recurring: ["ledger", "recurring"] as const,
  recent: (kind: string) => ["ledger", "recent", kind] as const,
};

export const useTransactions = (f: TxFilter) => useQuery({ queryKey: ledgerKeys.tx(f), queryFn: () => api.listTransactions(f) });
export const useCategories = (kind?: "income" | "expense", includeArchived = false) =>
  useQuery({ queryKey: ledgerKeys.categories(kind, includeArchived), queryFn: () => api.listCategories(kind, includeArchived) });
export const useAccounts = (includeArchived = false) => useQuery({ queryKey: ledgerKeys.accounts(includeArchived), queryFn: () => api.listAccounts(includeArchived) });
export const useBudgets = (month: string) => useQuery({ queryKey: ledgerKeys.budgets(month), queryFn: () => api.listBudgets(month) });
export const useBudgetUsage = (month: string) => useQuery({ queryKey: ledgerKeys.usage(month), queryFn: () => api.budgetUsage(month) });
export const useRecurring = () => useQuery({ queryKey: ledgerKeys.recurring, queryFn: api.listRecurring });
export const useRecentCategories = (kind: "income" | "expense") => useQuery({ queryKey: ledgerKeys.recent(kind), queryFn: () => api.listRecentCategories(kind) });

/** 가계부 mutation 공통: 끝나면 'ledger' 아래 모든 쿼리(내역·잔액·예산 사용량)를 다시 불러온다. */
function useLedgerMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ledgerKeys.all }) });
}

export const useCreateTransaction = () => useLedgerMutation(api.createTransaction);
export const useUpdateTransaction = () => useLedgerMutation(({ id, tx }: { id: string; tx: api.NewTransaction }) => api.updateTransaction(id, tx));
export const useDeleteTransaction = () => useLedgerMutation(api.deleteTransaction);
export const useTransfer = () => useLedgerMutation(api.transfer);

export const useCreateCategory = () => useLedgerMutation(api.createCategory);
export const useUpdateCategory = () => useLedgerMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateCategory>[1] }) => api.updateCategory(id, patch));
export const useArchiveCategory = () => useLedgerMutation(({ id, archived }: { id: string; archived: boolean }) => api.archiveCategory(id, archived));
export const useDeleteCategory = () => useLedgerMutation(api.deleteCategory);

export const useCreateAccount = () => useLedgerMutation(api.createAccount);
export const useUpdateAccount = () => useLedgerMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateAccount>[1] }) => api.updateAccount(id, patch));

export const useSetBudget = () => useLedgerMutation(({ month, categoryId, amount }: { month: string; categoryId: string | null; amount: number }) => api.setBudget(month, categoryId, amount));
export const useDeleteBudget = () => useLedgerMutation(api.deleteBudget);
export const useCopyBudgets = () => useLedgerMutation(({ from, to }: { from: string; to: string }) => api.copyBudgets(from, to));

export const useCreateRecurring = () => useLedgerMutation(api.createRecurring);
export const useUpdateRecurring = () => useLedgerMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateRecurring>[1] }) => api.updateRecurring(id, patch));
export const useDeleteRecurring = () => useLedgerMutation(api.deleteRecurring);
