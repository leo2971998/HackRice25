import { useMutation, type UseMutationOptions } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { ChatMessage, ChatResponse } from "@/types/api"

type ChatPayload = {
  history: Pick<ChatMessage, "author" | "content" | "timestamp">[]
  newMessage: string
}

type Options = Omit<UseMutationOptions<ChatResponse, Error, ChatPayload, unknown>, "mutationFn">

export function useChat(options?: Options) {
  return useMutation({
    mutationFn: (payload: ChatPayload) =>
      apiFetch<ChatResponse>("/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    ...options,
  })
}
