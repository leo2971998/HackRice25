import { useEffect, useMemo, useState } from "react"
import { ArrowRight } from "lucide-react"
import ReactMarkdown from "react-markdown"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

import { useRecommendations } from "@/hooks/useRecommendations"
import { useCards } from "@/hooks/useCards"

import { gradientForIssuer } from "@/utils/brand-gradient"
import { createMandate } from "@/lib/mandates"
import {
    FLOW_COACH_MANDATE_RESOLVED_EVENT,
    openFlowCoach,
    pushMandateToFlowCoach,
    type FlowCoachMandateResolvedDetail,
} from "@/lib/flow-coach"
import type { MandateAttachment } from "@/types/api"

/* ───────────────── types ───────────────── */
type CategoryRow = { key?: string; name?: string; amount?: number; total?: number; pct?: number; count?: number }
type Reward = { category?: string; rate?: number; cap_monthly?: number | null }
type RecCard = {
    slug?: string
    product_name?: string
    issuer?: string
    network?: string
    annual_fee?: number
    base_cashback?: number
    net?: number
    rewards?: Reward[]
}

/* ───────────────── formatting ───────────────── */
const money0 = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const pct1 = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 })

/* ───────────────── helpers ───────────────── */
function toMix(categories: CategoryRow[], total: number | undefined | null) {
    if (!categories?.length) return null
    const pairs = categories
        .map((c) => {
            const label = (c.key ?? c.name ?? "").toString().trim()
            const amt = Number.isFinite(c.amount) ? Number(c.amount) : Number.isFinite(c.total) ? Number(c.total) : null
            if (label && amt !== null && amt > 0) return [label, amt] as const
            if (label && Number.isFinite(c.pct) && (c.pct as number) > 0 && total && total > 0) {
                return [label, (c.pct as number) * total] as const
            }
            return null
        })
        .filter(Boolean) as ReadonlyArray<readonly [string, number]>
    const sum = pairs.reduce((s, [, v]) => s + v, 0)
    if (sum <= 0) return null
    const mix: Record<string, number> = {}
    for (const [k, v] of pairs) mix[k] = v / sum
    return mix
}

function safeList<T>(arr: T[] | undefined | null): T[] {
    return Array.isArray(arr) ? arr : []
}

function normalizeSlug(value?: string | null): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function topBenefitTags(card: RecCard, max = 2): string[] {
    const base = typeof card.base_cashback === "number" ? card.base_cashback! : 0
    const rewards = safeList(card.rewards)
        .filter((r) => r?.category && typeof r.rate === "number")
        .map((r) => ({ category: String(r.category), rate: Number(r.rate) }))
        .sort((a, b) => b.rate - a.rate)

    const boosted = rewards.filter((r) => r.rate > base + 1e-6).slice(0, max)
    const tags: string[] = []
    for (const r of boosted) tags.push(`${pct1.format(r.rate)} ${r.category}`)
    if (base > 0) tags.push(`Base ${pct1.format(base)} everywhere`)
    return tags
}

/** Remove LLM boilerplate (“Here are 3 bullets…”) but keep details/markdown */
function sanitizeLLM(text?: string | null): string {
    if (!text) return ""
    const lines = text.split(/\r?\n+/)
    if (lines.length) {
        const first = lines[0].trim().toLowerCase()
        if ((/^here\b/i.test(lines[0]) || first.includes("bullet")) && first.length < 120) {
            lines.shift()
        }
    }
    return lines.join("\n").trim()
}

function mentionsAllCards(cards: RecCard[], md?: string | null) {
    if (!md) return false
    const text = md.toLowerCase()
    const names = cards.map((c) => (c.product_name || "").toLowerCase()).filter(Boolean)
    if (!names.length) return false
    let ok = 0
    for (const n of names) if (n && text.includes(n)) ok++
    return ok >= Math.min(3, names.length)
}

/* ───────────────── small UI bits ───────────────── */
function CardFace({
                      issuer,
                      name,
                      statusChip,
                  }: {
    issuer?: string
    name?: string
    statusChip?: React.ReactNode
}) {
    const gradient = gradientForIssuer(issuer, name)
    return (
        <div className={`relative h-36 w-full rounded-2xl bg-gradient-to-br ${gradient} p-4 text-white`}>
            <div className="pointer-events-none absolute -left-1/4 -top-1/2 h-[200%] w-[150%] rotate-12 bg-white/10 blur-2xl" />
            <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold tracking-[0.18em] opacity-90">
                        {(issuer || "CARD ISSUER").toUpperCase()}
                    </div>
                    {statusChip}
                </div>
                <div className="mt-1 line-clamp-2 text-lg font-semibold leading-6">{name || "Credit Card"}</div>
                <div className="mt-auto text-[11px] opacity-90">SWIPE COACH RECOMMENDS</div>
            </div>
        </div>
    )
}

function SkeletonCard() {
    return (
        <Card className="rounded-3xl">
            <CardContent className="p-5 space-y-4">
                <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
                <div className="h-36 w-full rounded-2xl bg-muted animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                <div className="h-8 w-24 rounded bg-muted animate-pulse" />
            </CardContent>
        </Card>
    )
}

/* ───────────────── main ───────────────── */
export function RecommendationsSection({
                                           categories,
                                           total,
                                           windowDays,
                                           isLoadingDetails,
                                       }: {
    categories: CategoryRow[]
    total: number
    windowDays: number
    isLoadingDetails?: boolean
}) {
    const { toast } = useToast()

    // derive mix + monthly estimate from the provided window
    const categoryMix = useMemo(() => toMix(categories, total), [categories, total])
    const monthlySpend = useMemo(() => {
        if (!Number.isFinite(total) || !Number.isFinite(windowDays) || windowDays <= 0) return undefined
        return (total / Math.max(1, windowDays)) * 30
    }, [total, windowDays])

    const recQuery = useRecommendations({
        categoryMix,
        monthlySpend,
        includeExplain: true, // keep Gemini explain
        enabled: !isLoadingDetails,
    })

    const cardsRaw = safeList((recQuery.data as any)?.cards as RecCard[] | undefined)
    const cards = cardsRaw.slice(0, 3)
    const rawExplanation = (recQuery.data as any)?.explanation as string | undefined
    const explanation = sanitizeLLM(rawExplanation)

    const title = cards.length >= 3 ? "Top 3 picks" : cards.length > 0 ? "Recommended picks" : "Top picks"

    /* ====== “Apply” flow parity with Catalog page ====== */
    // linked cards to know what’s already applied
    const linked = useCards()
    const linkedSlugSet = useMemo(() => {
        const s = new Set<string>()
        for (const c of linked.data ?? []) {
            const slug = normalizeSlug((c as any).cardProductSlug ?? (c as any).productSlug)
            if (slug) s.add(slug)
        }
        return s
    }, [linked.data])

    // optimistic + pending mandate wiring
    const [optimisticAppliedSlugs, setOptimisticAppliedSlugs] = useState<Set<string>>(new Set())
    const [mandateSlugById, setMandateSlugById] = useState<Map<string, string>>(new Map())
    const pendingMandateSlugs = useMemo(() => new Set(mandateSlugById.values()), [mandateSlugById])
    const [pendingSlug, setPendingSlug] = useState<string | null>(null)

    // handle Flow Coach resolution events (mirror Catalog behavior)
    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<FlowCoachMandateResolvedDetail>).detail
            if (!detail?.id) return
            let slug: string | undefined
            setMandateSlugById((prev) => {
                if (!prev.has(detail.id)) return prev
                const next = new Map(prev)
                slug = next.get(detail.id) ?? undefined
                next.delete(detail.id)
                return next
            })
            if (slug && detail.status === "declined") {
                setOptimisticAppliedSlugs((prev) => {
                    if (!prev.has(slug!)) return prev
                    const next = new Set(prev)
                    next.delete(slug!)
                    return next
                })
            }
        }
        window.addEventListener(FLOW_COACH_MANDATE_RESOLVED_EVENT, handler as EventListener)
        return () => window.removeEventListener(FLOW_COACH_MANDATE_RESOLVED_EVENT, handler as EventListener)
    }, [])

    const appliedOrOptimistic = useMemo(() => {
        const s = new Set<string>(linkedSlugSet)
        for (const slug of optimisticAppliedSlugs) s.add(slug)
        return s
    }, [linkedSlugSet, optimisticAppliedSlugs])

    const onApply = async (card: RecCard) => {
        const slugValue = normalizeSlug(card.slug)
        if (!slugValue) {
            toast({ title: "Missing product slug", description: "Unable to start this application." })
            return
        }
        if (pendingSlug === slugValue || pendingMandateSlugs.has(slugValue)) {
            openFlowCoach()
            return
        }
        if (appliedOrOptimistic.has(slugValue)) {
            openFlowCoach()
            return
        }

        setPendingSlug(slugValue)
        try {
            const mandate = await createMandate({
                type: "intent",
                data: {
                    intent: "apply_card",
                    product_slug: slugValue,
                    product_name: card.product_name,
                    issuer: card.issuer,
                },
            })

            const attachment: MandateAttachment = {
                ...mandate,
                context: {
                    productName: card.product_name,
                    issuer: card.issuer,
                    slug: slugValue,
                },
            }

            setOptimisticAppliedSlugs((prev) => {
                if (prev.has(slugValue)) return prev
                const next = new Set(prev)
                next.add(slugValue)
                return next
            })
            setMandateSlugById((prev) => {
                const next = new Map(prev)
                next.set(attachment.id, slugValue)
                return next
            })

            // same signature as Catalog page
            pushMandateToFlowCoach({
                message: `Approve applying for the ${card.product_name}?`,
                mandate: attachment,
            })
            openFlowCoach()
            toast({ title: "Finish in Flow Coach", description: "Approve the mandate to complete your application." })
        } catch (err) {
            toast({
                title: "Couldn’t start application",
                description: err instanceof Error ? err.message : "Please try again.",
            })
        } finally {
            setPendingSlug(null)
        }
    }

    // If Gemini didn’t reference all cards by name, add a tiny supplement (no preface text)
    const needsSupplement = cards.length > 0 && !mentionsAllCards(cards, explanation)
    const supplement = needsSupplement
        ? cards
            .map((c) => {
                const tags = topBenefitTags(c, 2)
                const name = c.product_name ?? "Card"
                return `- **${name}** — ${tags.join(" · ")}`
            })
            .join("\n")
        : ""

    return (
        <div className="space-y-6">
            {/* 1) Explanation ON TOP */}
            {(explanation || supplement) ? (
                <Card className="rounded-3xl">
                    <CardHeader className="p-5 pb-0">
                        <CardTitle className="text-lg font-semibold">Why these cards?</CardTitle>
                        <CardDescription>Detailed reasoning based on your recent spending.</CardDescription>
                    </CardHeader>
                    <CardContent className="prose prose-sm max-w-none p-5 pt-3 dark:prose-invert">
                        {explanation ? <ReactMarkdown>{explanation}</ReactMarkdown> : null}
                        {supplement ? (
                            <>
                                {explanation ? <hr className="my-4" /> : null}
                                <ReactMarkdown>{supplement}</ReactMarkdown>
                            </>
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}

            {/* 2) Comparison table */}
            {cards.length ? (
                <Card className="rounded-3xl">
                    <CardHeader className="p-5 pb-0">
                        <CardTitle className="text-lg font-semibold">Comparison at a glance</CardTitle>
                        <CardDescription>Quick summary based on your recent spending mix.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-5">
                        <div className="overflow-x-auto rounded-2xl border">
                            <table className="min-w-full text-sm">
                                <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-3 text-left">Rank</th>
                                    <th className="p-3 text-left">Card</th>
                                    <th className="p-3 text-left">Best uses</th>
                                    <th className="p-3 text-right">Base</th>
                                    <th className="p-3 text-right">Annual fee</th>
                                    <th className="p-3 text-right">Est. annual net</th>
                                </tr>
                                </thead>
                                <tbody>
                                {cards.map((c, idx) => {
                                    const name = c.product_name ?? "Recommended Card"
                                    const issuer = c.issuer ?? ""
                                    const tags = topBenefitTags(c, 2)
                                    const base = typeof c.base_cashback === "number" && c.base_cashback! > 0 ? pct1.format(c.base_cashback!) : "—"
                                    const annual =
                                        typeof c.annual_fee === "number" && c.annual_fee! > 0 ? money0.format(c.annual_fee!) : "None"
                                    const net = typeof c.net === "number" ? money0.format(Math.max(0, c.net || 0)) : "—"
                                    const slugValue = normalizeSlug(c.slug)
                                    const applied = slugValue ? appliedOrOptimistic.has(slugValue) : false
                                    const awaiting = slugValue ? pendingMandateSlugs.has(slugValue) : false

                                    return (
                                        <tr key={`${c.slug ?? name}`} className="border-t">
                                            <td className="p-3">
                                                <Badge variant="secondary">Top #{idx + 1}</Badge>
                                            </td>
                                            <td className="p-3">
                                                <div className="font-semibold leading-5">{name}</div>
                                                <div className="text-xs text-muted-foreground">{issuer}</div>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tags.length ? (
                                                        tags.map((t, i) => (
                                                            <span key={i} className="rounded-full border px-2 py-0.5 text-[11px]">
                                  {t}
                                </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 text-right tabular-nums">{base}</td>
                                            <td className="p-3 text-right tabular-nums">{annual}</td>
                                            <td className="p-3 text-right tabular-nums">
                                                {net}
                                                {applied ? <span className="ml-2 text-[11px] text-emerald-600">Applied</span> : awaiting ? <span className="ml-2 text-[11px] text-blue-600">Awaiting</span> : null}
                                            </td>
                                        </tr>
                                    )
                                })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {/* 3) Picks grid (Apply-only CTA, tags under card) */}
            <Card className="rounded-3xl">
                <CardHeader className="p-5 pb-0">
                    <CardTitle className="text-lg font-semibold">{title}</CardTitle>
                    <CardDescription>
                        Based on your last {windowDays}-day spending mix
                        {Number.isFinite(monthlySpend) ? ` (≈ ${money0.format(monthlySpend!)} / mo)` : ""}.
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-5">
                    {recQuery.isLoading ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </div>
                    ) : recQuery.error ? (
                        <div className="rounded-2xl border bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                            {recQuery.error.message || "Unable to load recommendations."}
                        </div>
                    ) : !cards.length ? (
                        <div className="rounded-2xl border p-6 text-sm text-muted-foreground">
                            No recommendations yet — try selecting cards on the Overview tab, or add a few transactions to seed your mix.
                        </div>
                    ) : (
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {cards.map((c, idx) => {
                                const name = c.product_name ?? "Recommended Card"
                                const issuer = c.issuer ?? ""
                                const rateTags = topBenefitTags(c, 2)
                                const slugValue = normalizeSlug(c.slug)
                                const applied = slugValue ? appliedOrOptimistic.has(slugValue) : false
                                const awaiting = slugValue ? pendingMandateSlugs.has(slugValue) : false
                                const isPending = pendingSlug === slugValue

                                const statusChip = applied ? (
                                    <div className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-semibold">Applied</div>
                                ) : awaiting ? (
                                    <div className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-semibold">Awaiting</div>
                                ) : null

                                return (
                                    <Card key={`${c.slug ?? name}`} className="rounded-3xl">
                                        <CardContent className="p-5 space-y-4">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary">Top #{idx + 1}</Badge>
                                            </div>

                                            <CardFace issuer={issuer} name={name} statusChip={statusChip} />

                                            <div>
                                                <div className="text-base font-semibold leading-6">{name}</div>
                                                <div className="text-xs text-muted-foreground">{issuer}</div>
                                            </div>

                                            {rateTags.length ? (
                                                <ul className="text-xs text-muted-foreground space-y-1">
                                                    {rateTags.map((t, i) => (
                                                        <li key={i}>• {t}</li>
                                                    ))}
                                                </ul>
                                            ) : null}

                                            <div className="pt-1">
                                                <Button
                                                    className="gap-1"
                                                    onClick={() => onApply(c)}
                                                    disabled={!slugValue || applied || isPending}
                                                >
                                                    {applied ? "Applied" : awaiting ? "Open chat" : isPending ? "Applying…" : "Apply"}
                                                    {!applied && <ArrowRight className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

export default RecommendationsSection
