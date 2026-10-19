"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createToken, listLogs, listTokens, revokeToken } from "./api";

// 쿼리 키: ['mcp', 대상]
export const mcpKeys = { tokens: ["mcp", "tokens"] as const, logs: ["mcp", "logs"] as const };

export const useMcpTokens = () => useQuery({ queryKey: mcpKeys.tokens, queryFn: listTokens });
export const useMcpLogs = () => useQuery({ queryKey: mcpKeys.logs, queryFn: () => listLogs(50), refetchInterval: 30_000 });

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createToken, onSuccess: () => qc.invalidateQueries({ queryKey: mcpKeys.tokens }) });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: revokeToken, onSuccess: () => qc.invalidateQueries({ queryKey: mcpKeys.tokens }) });
}
