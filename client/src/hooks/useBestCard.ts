// src/hooks/useBestCard.ts
import { useState } from "react"
import { apiFetch } from "@/lib/api-client"

export type BestCardCandidate = {
    card_id: string
    display: string
    effective_rate: number
    est_reward_usd: number
    reasons: string[]
    actions?: Array<Record<string, any>>
}

export function useBestCard() {
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<{ candidates: BestCardCandidate[] } | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function query(params: { merchant?: string; category?: string; amount: number }) {
        setLoading(true); setError(null)
        try {
            const res = await apiFetch<{ candidates: BestCardCandidate[] }>("/cards/best", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params),
            })
            setData(res)
        } catch (e: any) {
            setError(e?.message ?? "Failed to fetch")
        } finally {
            setLoading(false)
        }
    }

    return { loading, data, error, query }
}
