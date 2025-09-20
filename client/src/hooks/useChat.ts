import { useMutation, type UseMutationOptions } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { ChatMessage, ChatResponse } from "@/types/api"

type ChatVariables = {
  history: ChatMessage[]
  message: ChatMessage
}

type MutationOpts<TData, TVariables> = Omit<UseMutationOptions<TData, Error, TVariables, unknown>, "mutationFn">

export function useChat(options?: MutationOpts<ChatResponse, ChatVariables>) {
  const { onSuccess, ...rest } = options ?? {}

  return useMutation({
    mutationFn: async ({ history, message }: ChatVariables) => {
      const payload = {
        history: history.map(({ author, content, timestamp }) => ({
          author,
          content,
          timestamp,
        })),
        newMessage: message.content,
      }

      return apiFetch<ChatResponse>("/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      onSuccess?.(data, variables, onMutateResult, context)
    },
    ...rest,
  })
}
