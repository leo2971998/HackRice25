import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api-client"
import type {
    CardRow,
    Me,
    MerchantRow,
    MoneyMoment,
    Preferences,
    RecurringGroup,
    SpendDetails,
    SpendSummary,
    TransactionsResponse,
    UpcomingResponse,
} from "@/types/api"

const DEFAULT_STALE_TIME = 60_000

type QueryOpts<TData> = Omit<UseQueryOptions<TData, Error, TData, unknown[]>, "queryKey" | "queryFn">
type MutationOpts<TData, TVariables> = Omit<UseMutationOptions<TData, Error, TVariables, unknown>, "mutationFn">

/** Utility: only append params that are actually defined */
function buildSearch(params: Record<string, string | number | undefined>, arrays?: Record<string, string[] | undefined>) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v))) {
            q.set(k, String(v))
        }
    }
    if (arrays) {
        for (const [k, arr] of Object.entries(arrays)) {
            if (arr && arr.length) arr.forEach((v) => q.append(k, v))
        }
    }
    const s = q.toString()
    return s ? `?${s}` : ""
}

export function useMe(options?: QueryOpts<Me>) {
    return useQuery({
        queryKey: ["me"],
        queryFn: () => apiFetch<Me>("/me"),
        staleTime: DEFAULT_STALE_TIME,
        ...options,
    })
}

export function useSpendSummary(
    windowDays?: number,
    options?: QueryOpts<SpendSummary> & { cardIds?: string[] }
) {
    const { cardIds, ...queryOptions } = options || {}
    const qs = buildSearch(
        { window: windowDays },
        { cardIds }
    )
    return useQuery({
        queryKey: ["spend-summary", { windowDays: windowDays ?? null, cardIds: cardIds ?? [] }],
        queryFn: () => apiFetch<SpendSummary>(`/spend/summary${qs}`),
        ...queryOptions,
    })
}

export function useSpendDetails(
    windowDays?: number,
    options?: QueryOpts<SpendDetails> & { cardIds?: string[] }
) {
    const { cardIds, ...queryOptions } = options || {}
    const qs = buildSearch(
        { window: windowDays },
        { cardIds }
    )
    return useQuery({
        queryKey: ["spend-details", { windowDays: windowDays ?? null, cardIds: cardIds ?? [] }],
        queryFn: () => apiFetch<SpendDetails>(`/spend/details${qs}`),
        ...queryOptions,
    })
}

export function useMerchants(
    params: { limit?: number; windowDays?: number; cardIds?: string[] },
    options?: QueryOpts<MerchantRow[]>
) {
    const qs = buildSearch(
        { limit: params.limit, window: params.windowDays },
        { cardIds: params.cardIds }
    )
    return useQuery({
        queryKey: ["merchants", { limit: params.limit ?? null, windowDays: params.windowDays ?? null, cardIds: params.cardIds ?? [] }],
        queryFn: () => apiFetch<MerchantRow[]>(`/merchants${qs}`),
        ...options,
    })
}

export function useTransactions(
    params?: { windowDays?: number; cardIds?: string[] },
    options?: QueryOpts<TransactionsResponse>
) {
    const qs = buildSearch(
        { window: params?.windowDays },
        { cardIds: params?.cardIds }
    )
    return useQuery({
        queryKey: ["transactions", { windowDays: params?.windowDays ?? null, cardIds: params?.cardIds ?? [] }],
        queryFn: () => apiFetch<TransactionsResponse>(`/transactions${qs}`),
        ...options,
    })
}

type RecurringResponse = { ok: boolean; recurring: RecurringGroup[] }

export function useRecurringGroups(options?: QueryOpts<RecurringResponse>) {
    return useQuery({
        queryKey: ["recurring-groups"],
        queryFn: () => apiFetch<RecurringResponse>("/recurring"),
        staleTime: DEFAULT_STALE_TIME,
        ...options,
    })
}

export function useUpcomingTransactions(options?: QueryOpts<UpcomingResponse>) {
    return useQuery({
        queryKey: ["upcoming-transactions"],
        queryFn: () => apiFetch<UpcomingResponse>("/upcoming"),
        staleTime: DEFAULT_STALE_TIME,
        ...options,
    })
}

export function useMoneyMoments(
    windowDays?: number,
    options?: QueryOpts<MoneyMoment[]> & { cardIds?: string[] }
) {
    const { cardIds, ...queryOptions } = options || {}
    const qs = buildSearch(
        { window: windowDays },
        { cardIds }
    )
    return useQuery({
        queryKey: ["money-moments", { windowDays: windowDays ?? null, cardIds: cardIds ?? [] }],
        queryFn: () => apiFetch<MoneyMoment[]>(`/money-moments${qs}`),
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

export function useScanRecurring(
    options?: MutationOpts<{ ok: boolean; scanned: number; results: unknown[] }, void>
) {
    const queryClient = useQueryClient()
    const { onSuccess, ...rest } = options ?? {}
    return useMutation({
        mutationFn: () =>
            apiFetch<{ ok: boolean; scanned: number; results: unknown[] }>("/recurring/scan", {
                method: "POST",
            }),
        onSuccess: (data, variables, onMutateResult, context) => {
            queryClient.invalidateQueries({ queryKey: ["upcoming-transactions"] })
            queryClient.invalidateQueries({ queryKey: ["recurring-groups"] })
            onSuccess?.(data, variables, onMutateResult, context)
        },
        ...rest,
    })
}
