import { useEffect } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query"

import { apiFetch, setAccessTokenProvider } from "@/lib/apiClient"
import { authConfig } from "@/lib/env"
import type {
  CardRecommendation,
  CardRow as LegacyCardRow,
  CashbackEstimate,
  Me as LegacyMe,
  MerchantBreakdownRow,
  MoneyMoment,
  Preferences,
  SpendSummary as LegacySpendSummary,
} from "@/types/api"

const DEFAULT_STALE_TIME = 60_000

type QueryOpts<TData> = Omit<UseQueryOptions<TData, Error, TData, unknown[]>, "queryKey" | "queryFn">

type MutationOpts<TData, TVariables> = Omit<UseMutationOptions<TData, Error, TVariables, unknown>, "mutationFn">

export type Me = {
  _id?: string
  userId?: string
  email: string
  name?: string
  preferences?: Preferences
}

export type SpendSummary = {
  total: number
  byCategory: Array<{ category: string; amount: number }>
}

export type CardRow = {
  _id: string
  issuer: string
  nickname?: string
  network?: string
  last4: string
  account_mask?: string
  expiry_month?: number
  expiry_year?: number
}

export function useAuthWiring() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  useEffect(() => {
    const authorizationParams: Record<string, string> = {}
    if (authConfig.audience) {
      authorizationParams.audience = authConfig.audience
    }
    setAccessTokenProvider(async () => {
      if (!isAuthenticated) return null
      try {
        return await getAccessTokenSilently({ authorizationParams })
      } catch {
        return null
      }
    })
    return () => {
      setAccessTokenProvider(async () => null)
    }
  }, [getAccessTokenSilently, isAuthenticated])
}

export function useMe(options?: QueryOpts<LegacyMe>) {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<LegacyMe>("/me"),
    staleTime: DEFAULT_STALE_TIME,
    ...options,
  })
}

export function useSpendSummary() {
  return useQuery({
    queryKey: ["spendSummary"],
    queryFn: () => apiFetch<SpendSummary>("/home/spend-summary"),
  })
}

export function useCategorySummary(windowDays = 30, options?: QueryOpts<LegacySpendSummary>) {
  return useQuery({
    queryKey: ["spend-summary", { windowDays }],
    queryFn: () => apiFetch<LegacySpendSummary>(`/spend/summary?window=${windowDays}`),
    ...options,
  })
}

export function useMerchantBreakdown(
  params: { windowDays?: number; category?: string; limit?: number },
  options?: QueryOpts<MerchantBreakdownRow[]>
) {
  const query = new URLSearchParams({ window: String(params.windowDays ?? 90) })
  if (params.category && params.category !== "All") {
    query.set("category", params.category)
  }
  if (params.limit) {
    query.set("limit", String(params.limit))
  }

  return useQuery({
    queryKey: ["merchant-breakdown", { window: params.windowDays ?? 90, category: params.category, limit: params.limit }],
    queryFn: () => apiFetch<MerchantBreakdownRow[]>(`/spend/merchants?${query.toString()}`),
    ...options,
  })
}

export function useMoneyMoments(windowDays: number, options?: QueryOpts<MoneyMoment[]>) {
  return useQuery({
    queryKey: ["money-moments", { windowDays }],
    queryFn: () => apiFetch<MoneyMoment[]>(`/money-moments?window=${windowDays}`),
    ...options,
  })
}

export function useCashbackEstimate(params?: { windowDays?: number }, options?: QueryOpts<CashbackEstimate>) {
  const windowDays = params?.windowDays ?? 90
  return useQuery({
    queryKey: ["cashback-estimate", { windowDays }],
    queryFn: () => apiFetch<CashbackEstimate>(`/rewards/estimate?window=${windowDays}`),
    ...options,
  })
}

export function useCards() {
  return useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetch<CardRow[]>("/cards"),
  })
}

export function useAddCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      issuer: string
      nickname?: string
      network?: string
      expiry_month?: number
      expiry_year?: number
      last4: string
      account_mask: string
    }) =>
      apiFetch<CardRow>("/cards", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] })
    },
  })
}

export function useRecommendations(
  params?: { windowDays?: number; topN?: number },
  options?: QueryOpts<{ ranked: CardRecommendation[] }>
) {
  const windowDays = params?.windowDays ?? 90
  const topN = params?.topN ?? 5
  return useQuery({
    queryKey: ["recommendations", { windowDays, topN }],
    queryFn: () => apiFetch<{ ranked: CardRecommendation[] }>(
      `/rewards/recommendations?window=${windowDays}&top=${topN}`
    ),
    ...options,
  })
}

export function useAccounts(options?: QueryOpts<LegacyCardRow[]>) {
  return useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetch<LegacyCardRow[]>("/cards"),
    ...options,
  })
}

type UpdateMePayload = Partial<Pick<LegacyMe, "name"> & { preferences: Partial<Preferences> }>

export function useUpdateMe(options?: MutationOpts<LegacyMe, UpdateMePayload>) {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: UpdateMePayload) =>
      apiFetch<LegacyMe>("/me", {
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
