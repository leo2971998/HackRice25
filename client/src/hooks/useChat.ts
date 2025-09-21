import { useMutation, type UseMutationOptions } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api-client"
import type { ChatMessage } from "@/types/api"

type ChatVariables = {
    history: ChatMessage[]
    message: ChatMessage
}

type RawApiChat = {
    reply?: unknown
    timestamp?: string
}

export type NormalizedChat = {
    replyText: string
    payload: any | null
    timestamp?: string
}

type MutationOpts<TData, TVariables> = Omit<
    UseMutationOptions<TData, Error, TVariables, unknown>,
    "mutationFn"
>

/** Ensure we never leak the whole server object into the UI */
function normalizeChatResponse(raw: RawApiChat | string): NormalizedChat {
    let replyText = ""
    let payload: any | null = null
    let timestamp: string | undefined = undefined

    if (typeof raw === "string") {
        // Server sent a plain string body
        replyText = raw
    } else if (raw && typeof raw === "object") {
        timestamp = raw.timestamp
        const r = (raw as RawApiChat).reply

        if (typeof r === "string") {
            replyText = r
        } else if (r && typeof r === "object" && (r as any).type) {
            // Structured tool result (e.g. best_card.result, insight.*)
            payload = r
        } else if (typeof r === "string" && r.trim().startsWith("{")) {
            // Very defensive: someone returned a JSON-stringified dict
            try {
                const parsed = JSON.parse(r)
                if (typeof parsed?.reply === "string") replyText = parsed.reply
                else replyText = r
            } catch {
                replyText = r
            }
        }
    }

    return { replyText, payload, timestamp }
}

export function useChat(options?: MutationOpts<NormalizedChat, ChatVariables>) {
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

            const raw = await apiFetch<RawApiChat | string>("/chat", {
                method: "POST",
                body: JSON.stringify(payload),
            })

            return normalizeChatResponse(raw)
        },
        onSuccess: (data, variables, onMutateResult, context) => {
            onSuccess?.(data, variables, onMutateResult, context)
        },
        ...rest,
    })
}
