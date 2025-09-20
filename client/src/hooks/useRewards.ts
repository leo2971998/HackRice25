import { useQuery, type UseQueryOptions } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { RewardsCompareResponse, RewardsEstimateResponse } from "@/types/api"

type QueryOpts<TData> = Omit<UseQueryOptions<TData, Error, TData, unknown[]>, "queryKey" | "queryFn">

export function useRewardsEstimate(cardSlug?: string | null, options?: QueryOpts<RewardsEstimateResponse | undefined>) {
  const { enabled, ...rest } = options ?? {}
  return useQuery({
    queryKey: ["rewards", "estimate", cardSlug ?? null],
    queryFn: () => (cardSlug ? apiFetch<RewardsEstimateResponse>(`/rewards/estimate?cardSlug=${encodeURIComponent(cardSlug)}`) : undefined),
    enabled: Boolean(cardSlug) && (enabled ?? true),
    staleTime: 60_000,
    ...rest,
  })
}

export function useRewardsCompare(
  payload: { mix: Record<string, number>; cards: string[] } | undefined,
  options?: QueryOpts<RewardsCompareResponse | undefined>
) {
  const { enabled, ...rest } = options ?? {}
  return useQuery({
    queryKey: ["rewards", "compare", payload],
    queryFn: () =>
      payload
        ? apiFetch<RewardsCompareResponse>("/rewards/compare", {
            method: "POST",
            body: payload,
          })
        : undefined,
    enabled: Boolean(payload) && (enabled ?? true),
    ...rest,
  })
}
