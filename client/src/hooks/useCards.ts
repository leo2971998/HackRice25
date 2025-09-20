import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { CardDetails, CardRow, CreditCardProduct } from "@/types/api"

type QueryOpts<TData> = Omit<UseQueryOptions<TData, Error, TData, unknown[]>, "queryKey" | "queryFn">
type MutationOpts<TData, TVariables> = Omit<UseMutationOptions<TData, Error, TVariables, unknown>, "mutationFn">

export function useCards(options?: QueryOpts<CardRow[]>) {
  return useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetch<CardRow[]>("/cards"),
    ...options,
  })
}

export function useCardCatalog(
  params?: { active?: boolean },
  options?: QueryOpts<CreditCardProduct[]>
) {
  const active = params?.active
  const path =
    active === undefined
      ? "/cards/catalog"
      : `/cards/catalog?active=${active ? "1" : "0"}`

  return useQuery({
    queryKey: ["card-catalog", { active: active ?? null }],
    queryFn: () => apiFetch<CreditCardProduct[]>(path),
    staleTime: 60_000,
    ...options,
  })
}

export function useCard(id: string | undefined, options?: QueryOpts<CardDetails | undefined>) {
  const { enabled, ...rest } = options ?? {}
  return useQuery({
    queryKey: ["cards", id],
    queryFn: () => (id ? apiFetch<CardDetails>(`/cards/${id}`) : undefined),
    enabled: Boolean(id) && (enabled ?? true),
    ...rest,
  })
}

export function useAddCard(options?: MutationOpts<{ id: string }, Record<string, unknown>>) {
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

export function useUpdateCard(options?: MutationOpts<CardRow, { id: string; payload: Record<string, unknown> }>) {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch<CardRow>(`/cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ["cards"] })
      queryClient.invalidateQueries({ queryKey: ["cards", variables.id] })
      onSuccess?.(data, variables, onMutateResult, context)
    },
    ...rest,
  })
}

export function useDeleteCard(options?: MutationOpts<void, string>) {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/cards/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ["cards"] })
      queryClient.removeQueries({ queryKey: ["cards", variables] })
      onSuccess?.(data, variables, onMutateResult, context)
    },
    ...rest,
  })
}
