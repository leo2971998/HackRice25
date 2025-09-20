import { useQuery, type UseQueryOptions } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { RecommendationResponse } from "@/types/api"

type QueryOpts = Omit<UseQueryOptions<RecommendationResponse, Error, RecommendationResponse, unknown[]>, "queryKey" | "queryFn">

export type UseRecommendationsParams = {
  window?: number
  categoryMix?: Record<string, number> | null
  monthlySpend?: number
  includeExplain?: boolean
  enabled?: boolean
  options?: QueryOpts
}

function normaliseMix(mix: Record<string, number> | null | undefined) {
  if (!mix) return null
  const entries = Object.entries(mix)
    .map(([key, value]) => {
      const numeric = Number(value)
      return Number.isFinite(numeric) && numeric > 0 ? [key, numeric] : null
    })
    .filter((entry): entry is [string, number] => Boolean(entry))

  const total = entries.reduce((sum, [, value]) => sum + value, 0)
  if (total <= 0) return null

  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]))
}

export function useRecommendations(params: UseRecommendationsParams = {}) {
  const {
    window = 90,
    categoryMix,
    monthlySpend,
    includeExplain = true,
    enabled = true,
    options,
  } = params

  const normalisedMix = normaliseMix(categoryMix)
  const mixKey = normalisedMix
    ? Object.entries(normalisedMix)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value.toFixed(6)}`)
        .join("|")
    : "auto"

  const payload: Record<string, unknown> = {
    window,
    include_explain: includeExplain,
  }

  if (normalisedMix) {
    payload.category_mix = normalisedMix
  }

  if (typeof monthlySpend === "number" && Number.isFinite(monthlySpend)) {
    payload.monthly_spend = monthlySpend
  }

  return useQuery({
    queryKey: ["recommendations", { window, mixKey, monthlySpend: monthlySpend ?? null, includeExplain }],
    enabled: enabled && (!normalisedMix ? true : Object.keys(normalisedMix).length > 0),
    queryFn: () =>
      apiFetch<RecommendationResponse>("/recommendations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    staleTime: 60_000,
    ...options,
  })
}

