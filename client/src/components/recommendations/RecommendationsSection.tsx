import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RichMarkdown } from "@/components/markdown/RichMarkdown"
import { useAuth0 } from "@auth0/auth0-react"
type CategoryRow = { name: string; total: number }
type Props = {
    categories: CategoryRow[]
    total: number
    windowDays: number
    isLoadingDetails?: boolean
    catalogSize?: number
}

/** Server response shape from /api/recommendations */
type RecommendationResponse = {
    mix: Record<string, number>
    monthly_spend: number
    windowDays: number
    explanation?: string
    cards: Array<{
        slug?: string
        product_name: string
        issuer?: string
        network?: string
        annual_fee?: number
        base_cashback?: number
        link_url?: string
        net?: number
        rewards?: Array<{ category: string; rate: number; cap_monthly?: number }>
    }>
}

function normalizeMix(categories: CategoryRow[]): Record<string, number> {
    const obj: Record<string, number> = {}
    for (const c of categories) {
        if (!c || !c.name) continue
        const amt = Number(c.total ?? 0)
        if (amt > 0) obj[c.name] = amt
    }
    return obj
}

export function RecommendationsSection({
                                           categories,
                                           total,
                                           windowDays,
                                           isLoadingDetails,
                                           catalogSize,
                                       }: Props) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [data, setData] = useState<RecommendationResponse | null>(null)

    const { isAuthenticated, getAccessTokenSilently } = useAuth0() // ← add
    const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api" // ← add

    const canQuery = useMemo(
        () => !isLoadingDetails && total > 0 && categories?.length > 0,
        [isLoadingDetails, total, categories]
    )

    useEffect(() => {
        let abort = false
        async function run() {
            if (!canQuery) { setData(null); return }
            setLoading(true)
            setError(null)
            try {
                const payload = {
                    window: windowDays,
                    include_explain: true,
                    limit: 6,
                    category_mix: normalizeMix(categories),
                }

                const headers: Record<string, string> = { "Content-Type": "application/json" }

                // Attach JWT if logged in
                if (isAuthenticated) {
                    const token = await getAccessTokenSilently({
                        authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE }, // must match AUTH0_AUDIENCE on API
                    })
                    headers.Authorization = `Bearer ${token}`
                }

                const res = await fetch(`${API_BASE}/recommendations`, {
                    method: "POST",
                    headers,
                    credentials: "include",
                    body: JSON.stringify(payload),
                })
                if (!res.ok) throw new Error(`Server responded ${res.status}`)
                const json: RecommendationResponse = await res.json()
                if (!abort) setData(json)
            } catch (e: any) {
                if (!abort) setError(e?.message || "Failed to load recommendations")
            } finally {
                if (!abort) setLoading(false)
            }
        }
        run()
        return () => { abort = true }
    }, [canQuery, windowDays, categories, isAuthenticated, getAccessTokenSilently, API_BASE])

    const explanation = data?.explanation ?? ""
    const cards = data?.cards ?? []

    const Empty = (
        <Card className="rounded-3xl">
            <CardHeader className="p-5 pb-2">
                <CardTitle className="text-lg font-semibold">Recommendations</CardTitle>
                <CardDescription>
                    Pick a card selection and generate some spend first — then we’ll tailor suggestions here.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">
                    {isLoadingDetails ? "Crunching your recent spending…" : "No spend in this window yet."}
                </div>
            </CardContent>
        </Card>
    )

    if (!canQuery) return Empty

    return (
        <div className="space-y-6">
            <Card className="rounded-3xl">
                <CardHeader className="p-5 pb-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-semibold">Recommendations</CardTitle>
                            <CardDescription>
                                Tailored to your last {windowDays}-day spending{typeof catalogSize === "number" ? ` (catalog: ${catalogSize})` : ""}.
                            </CardDescription>
                        </div>
                        {/* Attribution */}
                        <span className="rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Generated by Flow Coach
            </span>
                    </div>
                </CardHeader>
                <CardContent className="p-5 space-y-5">
                    {loading ? (
                        <div className="text-sm text-muted-foreground">Finding the best cards for your mix…</div>
                    ) : error ? (
                        <div className="text-sm text-red-600 dark:text-red-400">Error: {error}</div>
                    ) : (
                        <>
                            {explanation ? (
                                <RichMarkdown className="text-sm">{explanation}</RichMarkdown>
                            ) : (
                                <div className="text-sm text-muted-foreground">
                                    We’ll explain why these cards fit your spending pattern.
                                </div>
                            )}

                            {cards.length ? (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {cards.map((rec) => (
                                        <RecommendationCard key={rec.slug ?? rec.product_name} rec={rec} />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground">No recommendations available yet.</div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

/* Card UI for a single recommendation */
function RecommendationCard({ rec }: { rec: RecommendationResponse["cards"][number] }) {
    const monthly = typeof rec.net === "number" ? rec.net : undefined
    const base = typeof rec.base_cashback === "number" ? rec.base_cashback : undefined
    const bestRule = (rec.rewards ?? []).slice().sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0]

    return (
        <Card className="rounded-2xl">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{rec.issuer || "—"}</div>
                        <div className="font-semibold truncate">{rec.product_name}</div>
                    </div>
                    {typeof monthly === "number" && isFinite(monthly) && (
                        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                            +${Math.round(monthly)}/mo
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {rec.slug && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
              {rec.slug}
            </span>
                    )}
                    {typeof base === "number" && base > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
              Base {(base * 100).toFixed(0)}%
            </span>
                    )}
                    {bestRule && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
              {(bestRule.rate * 100).toFixed(0)}% {bestRule.category}
            </span>
                    )}
                    {typeof rec.annual_fee === "number" && rec.annual_fee > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
              ${rec.annual_fee} AF
            </span>
                    )}
                </div>

                <div className="pt-1">
                    {rec.link_url ? (
                        <Button asChild variant="outline" size="sm">
                            <a href={rec.link_url} target="_blank" rel="noreferrer">Apply / Learn more</a>
                        </Button>
                    ) : (
                        <div className="text-xs text-muted-foreground">No public link available.</div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
