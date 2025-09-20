import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { CardRow, Me, MerchantRow, MoneyMoment, Preferences, SpendSummary } from "@/types/api"

const DEFAULT_STALE_TIME = 60_000

type QueryOpts<TData> = Omit<UseQueryOptions<TData, Error, TData, unknown[]>, "queryKey" | "queryFn">

type MutationOpts<TData, TVariables> = Omit<UseMutationOptions<TData, Error, TVariables, unknown>, "mutationFn">

export function useMe(options?: QueryOpts<Me>) {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<Me>("/me"),
    staleTime: DEFAULT_STALE_TIME,
    ...options,
  })
}

export function useSpendSummary(
  windowDays: number, 
  options?: QueryOpts<SpendSummary> & { cardIds?: string[] }
) {
  const { cardIds, ...queryOptions } = options || {}
  const query = new URLSearchParams({ window: String(windowDays) })
  
  if (cardIds && cardIds.length > 0) {
    cardIds.forEach(id => query.append('cardIds', id))
  }
  
  return useQuery({
    queryKey: ["spend-summary", { windowDays, cardIds }],
    queryFn: () => apiFetch<SpendSummary>(`/spend/summary?${query.toString()}`),
    ...queryOptions,
  })
}

export function useMerchants(
  params: { limit: number; windowDays: number; cardIds?: string[] },
  options?: QueryOpts<MerchantRow[]>
) {
  const query = new URLSearchParams({ 
    limit: String(params.limit), 
    window: String(params.windowDays) 
  })
  
  if (params.cardIds && params.cardIds.length > 0) {
    params.cardIds.forEach(id => query.append('cardIds', id))
  }
  
  return useQuery({
    queryKey: ["merchants", { limit: params.limit, windowDays: params.windowDays, cardIds: params.cardIds }],
    queryFn: () => apiFetch<MerchantRow[]>(`/merchants?${query.toString()}`),
    ...options,
  })
}

export function useMoneyMoments(
  windowDays: number, 
  options?: QueryOpts<MoneyMoment[]> & { cardIds?: string[] }
) {
  const { cardIds, ...queryOptions } = options || {}
  const query = new URLSearchParams({ window: String(windowDays) })
  
  if (cardIds && cardIds.length > 0) {
    cardIds.forEach(id => query.append('cardIds', id))
  }
  
  return useQuery({
    queryKey: ["money-moments", { windowDays, cardIds }],
    queryFn: () => apiFetch<MoneyMoment[]>(`/money-moments?${query.toString()}`),
    ...queryOptions,
  })
}

export function useAccounts(options?: QueryOpts<CardRow[]>) {
  return useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetch<CardRow[]>("/cards"),
    ...options,
  })
}

type UpdateMePayload = Partial<Pick<Me, "name"> & { preferences: Partial<Preferences> }>

export function useUpdateMe(options?: MutationOpts<Me, UpdateMePayload>) {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: UpdateMePayload) =>
      apiFetch<Me>("/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.setQueryData(["me"], data)
      onSuccess?.(data, variables, onMutateResult, context)
    },
    ...rest,
  })
}

export function useAddAccount(options?: MutationOpts<{ id: string }, Record<string, unknown>>) {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<{ id: string }>("/cards", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ["cards"] })
      onSuccess?.(data, variables, onMutateResult, context)
    },
    ...rest,
  })
}

export function useDeleteAccount(options?: MutationOpts<void, string>) {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/cards/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ["cards"] })
      onSuccess?.(data, variables, onMutateResult, context)
    },
    ...rest,
  })
}
