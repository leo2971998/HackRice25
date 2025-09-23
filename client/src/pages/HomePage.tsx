// src/pages/HomePage.tsx
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight, Minus, X, Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { StatTile } from "@/components/cards/StatTile"
import { DonutChart } from "@/components/charts/DonutChart"
import { PageSection } from "@/components/layout/PageSection"
import { RecommendationsSection } from "@/components/recommendations/RecommendationsSection"

import { useAccounts, useMe, useSpendDetails, useSpendSummary, useTransactions } from "@/hooks/useApi"
import type { CardRow } from "@/types/api"
import { gradientForIssuer } from "@/utils/brand-gradient"

/* ───────────────── formatting helpers ───────────────── */

const currencyLong = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
})
const currencyCompact = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
})
function formatCurrencyTight(n: number) {
    const abs = Math.abs(n)
    return abs >= 10_000 ? currencyCompact.format(n) : currencyLong.format(n)
}
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

type HomeTab = "overview" | "recommendations"
const HOME_TABS: { id: HomeTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "recommendations", label: "Recommendations" },
]

type SelectionMode = "single" | "multi"

function formatLastSynced(card: CardRow) {
    if (!card.lastSynced) return "Not synced yet"
    const date = new Date(card.lastSynced)
    if (Number.isNaN(date.getTime())) return "Synced recently"
    return `Synced ${date.toLocaleDateString()}`
}

const DETAILS_WINDOW_DAYS = 30

function gradientForCardRow(card?: Partial<CardRow>) {
    const hints: (string | null | undefined)[] = [
        card?.cardProductId,
        (card as any)?.card_product_id,
        (card as any)?.cardProductSlug,
        (card as any)?.card_product_slug,
        (card as any)?.productSlug,
        (card as any)?.productName,
        card?.issuer,
        card?.network,
        (card as any)?.nickname,
    ]
    return gradientForIssuer(...hints.map((hint) => (typeof hint === "string" && hint.length ? hint : undefined)))
}

function monthLabel(d = new Date()) {
    return d.toLocaleString(undefined, { month: "long" })
}

/* ───────── components ───────── */

function SingleCardHero({
                            card,
                            onPrev,
                            onNext,
                        }: {
    card: CardRow
    onPrev: () => void
    onNext: () => void
}) {
    const gradient = gradientForCardRow(card)
    const issuer = card.issuer ?? ""
    const name = (card as any)?.productName ?? card.nickname ?? "Your Card"
    const last4 = (card.mask ?? "").slice(-4) || "0000"

    // touch swipe
    const startRef = useRef<{ x: number; y: number } | null>(null)
    const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
        const t = e.changedTouches[0]
        startRef.current = { x: t.clientX, y: t.clientY }
    }
    const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = (e) => {
        if (!startRef.current) return
        const t = e.changedTouches[0]
        const dx = t.clientX - startRef.current.x
        const dy = t.clientY - startRef.current.y
        startRef.current = null
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) onNext()
            else onPrev()
        }
    }

    return (
        <div className="relative overflow-hidden rounded-3xl" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {/* arrows overlayed left/right */}
            <button
                type="button"
                aria-label="Previous card"
                onClick={onPrev}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-2 backdrop-blur transition hover:bg-white/30 focus:outline-none"
            >
                <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <button
                type="button"
                aria-label="Next card"
                onClick={onNext}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-2 backdrop-blur transition hover:bg-white/30 focus:outline-none"
            >
                <ChevronRight className="h-5 w-5 text-white" />
            </button>

            <div className={`relative h-44 w-full rounded-3xl bg-gradient-to-br ${gradient} p-5 text-white`}>
                <div className="pointer-events-none absolute -left-1/4 -top-1/2 h-[220%] w-[150%] rotate-12 bg-white/10 blur-2xl" />
                <div className="relative flex h-full flex-col">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-semibold tracking-[0.18em] opacity-90">
                            {issuer.toUpperCase() || "CARD ISSUER"}
                        </div>
                        {(card.status || "").length ? (
                            <div className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-semibold">
                                {card.status}
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-1 text-xl font-semibold leading-6 line-clamp-2">{name}</div>

                    {/* bottom line: only the masked card number now */}
                    <div className="mt-auto flex items-end text-xs">
                        <div className="space-x-2 opacity-90">
                            <span>•••• •••• •••• {last4}</span>
                            <span className="hidden sm:inline">SWIPE COACH MEMBER</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="absolute inset-0 -z-10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)]" />
        </div>
    )
}

/* Wide 30-day spend card (goes on right above donut) */
function Rolling30WideCard({ value }: { value: number }) {
    return (
        <Card className="rounded-3xl">
            <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg font-semibold">Rolling 30-day spend</CardTitle>
                <CardDescription>Last 30 days (rolling window).</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
                <div className="font-semibold leading-tight tabular-nums" style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)" }}>
                    {formatCurrencyTight(value)}
                </div>
            </CardContent>
        </Card>
    )
}

/* Donut legend */
function DonutLegend({ data }: { data: { name: string; total: number }[] }) {
    if (!data?.length) return null
    const total = data.reduce((s, d) => s + (d.total || 0), 0) || 1
    const colors = ["bg-violet-500","bg-indigo-400","bg-purple-400","bg-fuchsia-400","bg-sky-400","bg-emerald-400","bg-amber-400"]
    return (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.map((d, i) => {
                const pct = d.total / total
                return (
                    <div key={d.name} className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2">
                        <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${colors[i % colors.length]}`} />
                            <span className="text-sm">{d.name}</span>
                        </div>
                        <span className="text-sm font-medium tabular-nums">
              {currencyLong.format(d.total)}{" "}
                            <span className="text-xs text-muted-foreground">({(pct * 100).toFixed(0)}%)</span>
            </span>
                    </div>
                )
            })}
        </div>
    )
}

/* Budget progress (reads Settings preference) */
function BudgetProgressCard({
                                monthSpend,
                                monthlyBudget,
                            }: {
    monthSpend: number
    monthlyBudget?: number | null
}) {
    const hasBudget = typeof monthlyBudget === "number" && monthlyBudget! > 0
    const pct = hasBudget ? Math.min(1, monthSpend / (monthlyBudget as number)) : 0
    const over = hasBudget && monthSpend > (monthlyBudget as number)
    const monthName = monthLabel()

    return (
        <Card className="rounded-3xl">
            <CardHeader className="p-5 pb-0">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-lg font-semibold">Monthly budget — {monthName}</CardTitle>
                        <CardDescription>Month-to-date vs your budget threshold.</CardDescription>
                    </div>
                    {!hasBudget && (
                        <a
                            href="/settings"
                            className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
                            title="Go to Settings → Preferences to set a monthly budget"
                        >
                            Set budget
                        </a>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">MTD</span>
            <span>This month</span>
          </span>
                    <span className="tabular-nums">
            {money.format(monthSpend)} {hasBudget ? ` / ${money.format(monthlyBudget as number)}` : ""}
          </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                    <div
                        className={`h-2 rounded-full transition-all ${over ? "bg-red-500" : "bg-primary"}`}
                        style={{ width: `${(pct * 100).toFixed(1)}%` }}
                    />
                </div>
                <div className="text-xs text-muted-foreground flex items-start gap-2">
                    <Info className="h-4 w-4 mt-0.5" />
                    <span>
            Monthly budget uses <strong>month-to-date</strong> spending. The “Rolling 30-day spend” card is a separate 30-day window.
          </span>
                </div>
                {hasBudget && (
                    <div className={`text-xs ${over ? "text-red-600" : "text-muted-foreground"}`}>
                        {over ? "You're over budget for the month." : `You’ve used ${(pct * 100).toFixed(0)}% of your budget.`}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

/* Category momentum (this month vs last month) + totals & net */
type TxRow = { date: string; category?: string; amount: number }
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }
function inRange(iso: string, from: Date, to: Date) { const t = new Date(iso).getTime(); return t >= from.getTime() && t <= to.getTime() }
function sumByCategory(rows: TxRow[]) {
    const m = new Map<string, number>()
    for (const r of rows) {
        const cat = r.category || "Uncategorized"
        m.set(cat, (m.get(cat) || 0) + Math.max(0, r.amount || 0))
    }
    return m
}
function CategoryMomentumCard({ txs }: { txs: TxRow[] }) {
    const now = new Date()
    const thisFrom = startOfMonth(now)
    const thisTo = endOfMonth(now)
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const lastFrom = startOfMonth(last)
    const lastTo = endOfMonth(last)

    const thisMonth = txs.filter((t) => inRange(t.date, thisFrom, thisTo))
    const lastMonth = txs.filter((t) => inRange(t.date, lastFrom, lastTo))

    const thisMap = sumByCategory(thisMonth)
    const lastMap = sumByCategory(lastMonth)

    const cats = new Set([...thisMap.keys(), ...lastMap.keys()])
    const rows = Array.from(cats).map((c) => {
        const a = thisMap.get(c) || 0
        const b = lastMap.get(c) || 0
        const delta = a - b
        const deltaPct = b > 0 ? delta / b : (a > 0 ? 1 : 0)
        return { category: c, thisMonth: a, lastMonth: b, delta, deltaPct }
    })
    rows.sort((x, y) => y.thisMonth - x.thisMonth)

    const totalThis = Array.from(thisMap.values()).reduce((s, v) => s + v, 0)
    const totalLast = Array.from(lastMap.values()).reduce((s, v) => s + v, 0)
    const net = totalThis - totalLast
    const netPct = totalLast > 0 ? net / totalLast : (totalThis > 0 ? 1 : 0)
    const netTone = net === 0 ? "text-muted-foreground" : net > 0 ? "text-red-600" : "text-emerald-600"
    const netLabel = net > 0 ? "Loss / Increase" : net < 0 ? "Savings / Decrease" : "No change"

    return (
        <Card className="rounded-3xl">
            <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg font-semibold">Category momentum</CardTitle>
                <CardDescription>This month vs last month.</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
                <div className="overflow-x-auto rounded-2xl border">
                    <table className="min-w-full text-sm">
                        <thead className="bg-muted/50">
                        <tr>
                            <th className="p-3 text-left">Category</th>
                            <th className="p-3 text-right">This month</th>
                            <th className="p-3 text-right">Last month</th>
                            <th className="p-3 text-right">Δ</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.length === 0 ? (
                            <tr><td className="p-4" colSpan={4}>No data yet.</td></tr>
                        ) : rows.slice(0, 8).map((r) => {
                            const Icon = r.delta === 0 ? Minus : r.delta > 0 ? ArrowUpRight : ArrowDownRight
                            const tone = r.delta === 0 ? "text-muted-foreground" : r.delta > 0 ? "text-red-600" : "text-emerald-600"
                            return (
                                <tr key={r.category} className="border-t">
                                    <td className="p-3">{r.category}</td>
                                    <td className="p-3 text-right tabular-nums">{money.format(r.thisMonth)}</td>
                                    <td className="p-3 text-right tabular-nums">{money.format(r.lastMonth)}</td>
                                    <td className={`p-3 text-right tabular-nums ${tone}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Icon className="h-4 w-4" />
                          {money.format(Math.abs(r.delta))}{" "}
                          <span className="text-xs">({Math.abs(r.deltaPct * 100).toFixed(0)}%)</span>
                      </span>
                                    </td>
                                </tr>
                            )
                        })}
                        </tbody>
                        <tfoot className="bg-muted/30">
                        <tr className="border-t">
                            <td className="p-3 font-semibold">Totals</td>
                            <td className="p-3 text-right font-semibold tabular-nums">{money.format(totalThis)}</td>
                            <td className="p-3 text-right font-semibold tabular-nums">{money.format(totalLast)}</td>
                            <td className={`p-3 text-right font-semibold tabular-nums ${netTone}`}>
                                {money.format(Math.abs(net))}{" "}
                                <span className="text-xs">({Math.abs(netPct * 100).toFixed(0)}%)</span>
                            </td>
                        </tr>
                        </tfoot>
                    </table>
                </div>

                <div className={`mt-3 text-sm ${netTone}`}>
                    Net change vs last month: {net >= 0 ? "+" : "−"}
                    {money.format(Math.abs(net))} ({Math.abs(netPct * 100).toFixed(0)}%) — {netLabel}
                </div>
            </CardContent>
        </Card>
    )
}

/* ───────── main page ───────── */

export function HomePage() {
    const { data: me } = useMe()
    const accounts = useAccounts()
    const accountRows = accounts.data ?? []

    // modes
    const [mode, setMode] = useState<SelectionMode>("single")
    const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined)
    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])

    const hasSelection = mode === "single" ? Boolean(selectedCardId) : selectedCardIds.length > 0
    const filterCardIds = !hasSelection ? undefined : mode === "single" ? [selectedCardId!] : selectedCardIds
    const queryEnabled = hasSelection

    // data hooks
    const summary = useSpendSummary(DETAILS_WINDOW_DAYS, { cardIds: filterCardIds, enabled: queryEnabled })
    const spendDetails = useSpendDetails(DETAILS_WINDOW_DAYS, { cardIds: filterCardIds, enabled: queryEnabled })

    // for month-to-date + last-month comparison, pull ~62 days and compute client-side
    const daysBack = 62
    const txQuery = useTransactions({ windowDays: daysBack, cardIds: filterCardIds }, { enabled: queryEnabled })

    const greeting = me?.name?.trim() || (me?.email ? me.email.split("@")[0] : "there")

    // tabs
    const [activeTab, setActiveTab] = useState<HomeTab>("overview")

    // selection utilities
    const switchToSingle = () => { setMode("single"); setSelectedCardIds([]) }
    const switchToMulti = () => { setMode("multi"); setSelectedCardId(undefined) }

    // ensure default single selection
    useEffect(() => {
        if (!accountRows.length) { setSelectedCardId(undefined); return }
        if (mode === "single" && (!selectedCardId || !accountRows.some((c) => c.id === selectedCardId))) {
            setSelectedCardId(accountRows[0].id)
        }
    }, [accountRows, mode, selectedCardId])

    // single-mode navigation
    const currentIndex = useMemo(() => {
        if (!selectedCardId) return -1
        return accountRows.findIndex((c) => c.id === selectedCardId)
    }, [accountRows, selectedCardId])

    const goPrev = () => {
        if (!accountRows.length || currentIndex < 0) return
        const prevIdx = (currentIndex - 1 + accountRows.length) % accountRows.length
        setSelectedCardId(accountRows[prevIdx].id)
    }
    const goNext = () => {
        if (!accountRows.length || currentIndex < 0) return
        const nextIdx = (currentIndex + 1) % accountRows.length
        setSelectedCardId(accountRows[nextIdx].id)
    }
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (mode !== "single") return
            if (e.key === "ArrowLeft") goPrev()
            if (e.key === "ArrowRight") goNext()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [mode, currentIndex, accountRows.length])

    // multi helpers
    const handleToggle = (cardId: string) => {
        setSelectedCardIds((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]))
    }

    // summary bits (rolling 30d tiles + donut)
    const donutData = summary.data ? (summary.data.byCategory ?? []).slice(0, 6) : []

    // details for recommendations
    const detailData = spendDetails.data
    const detailCategories = detailData?.categories ?? []
    const detailTotal = detailData?.total ?? 0

    // month-to-date spend from txs
    const mtdSpend = useMemo(() => {
        const txs = txQuery.data?.transactions ?? []
        const from = startOfMonth(new Date())
        const to = endOfMonth(new Date())
        let sum = 0
        for (const t of txs) {
            if (!t?.date) continue
            const amt = typeof t.amount === "number" ? t.amount : Number(t.amount ?? 0)
            if (inRange(t.date, from, to)) sum += Math.max(0, amt)
        }
        return sum
    }, [txQuery.data?.transactions])

    const monthlyBudget = me?.preferences?.budgets?.monthlyTotal

    return (
        <div className="mx-auto max-w-7xl px-5 md:px-8 lg:px-10 space-y-8 md:space-y-10">
            <PageSection
                title={`Welcome back, ${greeting}`}
                description={`Here’s what’s been happening across your wallet.`}
            />

            {/* Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex gap-2 rounded-full border border-border/60 bg-white/80 p-1.5 text-sm shadow-sm backdrop-blur dark:bg-zinc-900/60">
                    {HOME_TABS.map((tab) => {
                        const isActive = tab.id === activeTab
                        const base = "rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none"
                        const active = "bg-primary text-primary-foreground shadow-soft"
                        const inactive = "text-muted-foreground hover:text-foreground"
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                className={`${base} ${isActive ? active : inactive}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        )
                    })}
                </div>

                <div className="flex rounded-full border border-border/60 bg-white/80 p-1 shadow-sm dark:bg-zinc-900/60">
                    <button
                        type="button"
                        onClick={switchToSingle}
                        className={[
                            "rounded-full px-3 py-1.5 text-sm font-medium",
                            mode === "single" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                    >
                        Single
                    </button>
                    <button
                        type="button"
                        onClick={switchToMulti}
                        className={[
                            "rounded-full px-3 py-1.5 text-sm font-medium",
                            mode === "multi" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                    >
                        Multiple
                    </button>
                </div>
            </div>

            {/* Content */}
            {activeTab === "overview" ? (
                <div className="space-y-6">
                    {/* MULTI selector */}
                    {mode === "multi" && (
                        <Card className="rounded-3xl">
                            <CardHeader className="p-5 pb-0">
                                <CardTitle className="text-lg font-semibold">Select cards</CardTitle>
                                <CardDescription>Choose one or more cards to filter your insights.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-5">
                                {accounts.isLoading ? (
                                    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading cards…</div>
                                ) : !accountRows.length ? (
                                    <div className="flex h-32 items-center justify-center text-center text-sm text-muted-foreground">
                                        No cards yet. Add your first card to get insights.
                                    </div>
                                ) : accountRows.length <= 12 ? (
                                    <BigCardListSelector cards={accountRows} selectedIds={selectedCardIds} onToggle={handleToggle} />
                                ) : (
                                    <CompactPicker cards={accountRows} selectedIds={selectedCardIds} onChange={setSelectedCardIds} />
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Grid: 12 cols for clean balance */}
                    <div className="grid gap-6 lg:grid-cols-12">
                        {/* Left: Hero (span 7) with compact stats strip below */}
                        <div className="lg:col-span-7 space-y-6">
                            <Card className="rounded-3xl">
                                <CardHeader className="p-5 pb-0">
                                    <CardTitle className="text-lg font-semibold">
                                        {mode === "single" ? "Selected card" : "Selection"}
                                    </CardTitle>
                                    <CardDescription>
                                        {mode === "single"
                                            ? "Swipe or use side arrows to switch cards."
                                            : selectedCardIds.length
                                                ? `${selectedCardIds.length} card${selectedCardIds.length > 1 ? "s" : ""} selected`
                                                : "No cards selected"}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-5 space-y-4">
                                    {mode === "single" ? (
                                        accounts.isLoading ? (
                                            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading card…</div>
                                        ) : !accountRows.length || currentIndex < 0 ? (
                                            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No cards yet.</div>
                                        ) : (
                                            <SingleCardHero card={accountRows[currentIndex]} onPrev={goPrev} onNext={goNext} />
                                        )
                                    ) : (
                                        <div className="text-sm text-muted-foreground">Filter selection is active.</div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Compact stats strip (no 30-day spend here now) */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <StatTile label="Transactions (30d)" value={stats.txns.toLocaleString()} />
                                <StatTile label="Active cards" value={String(stats.accounts)} />
                            </div>

                            <CategoryMomentumCard txs={(txQuery.data?.transactions ?? []).map(t => ({
                                 date: t.date ?? "",
                            category: t.category,
                            amount: t.amount,
                            }))} />
                        </div>

                        {/* Right: Budget → Rolling 30d (wide) → Donut */}
                        <div className="lg:col-span-5 space-y-6">
                            <BudgetProgressCard monthSpend={mtdSpend} monthlyBudget={monthlyBudget} />

                            <Rolling30WideCard value={stats.totalSpend} />

                            <Card className="rounded-3xl">
                                <CardHeader className="p-5 pb-0">
                                    <CardTitle className="text-lg font-semibold">Spending mix (top categories)</CardTitle>
                                    <CardDescription>Rolling 30-day view.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-5">
                                    <div className="h-64">
                                        <DonutChart
                                            data={donutData}
                                            isLoading={summary.isLoading && hasSelection}
                                            emptyMessage={hasSelection ? "No spending yet in this window." : "Select a card to see categories."}
                                        />
                                    </div>
                                    {donutData?.length ? <DonutLegend data={donutData} /> : null}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            ) : (
                <RecommendationsSection
                    categories={detailCategories}
                    total={detailTotal}
                    windowDays={DETAILS_WINDOW_DAYS}
                    isLoadingDetails={spendDetails.isLoading && hasSelection}
                />
            )}
        </div>
    )
}

/* ===========================================
   Big list selector (large boxes)
   =========================================== */
function BigCardListSelector({
                                 cards,
                                 selectedIds,
                                 onToggle,
                             }: {
    cards: CardRow[]
    selectedIds: string[]
    onToggle: (id: string) => void
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
                const checked = selectedIds.includes(card.id)
                return (
                    <div
                        key={card.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={checked}
                        onClick={() => onToggle(card.id)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle(card.id)}
                        className={[
                            "group flex w-full items-center justify-between gap-4 rounded-2xl border p-4 transition",
                            checked ? "border-primary/60 ring-2 ring-primary/50 bg-primary/5" : "border-border/70 bg-white/60 dark:bg-zinc-900/50 hover:bg-muted/60",
                        ].join(" ")}
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold">{card.nickname}</span>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {card.status || "Active"}
                </span>
                            </div>
                            <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground sm:grid-cols-3">
                                <div className="truncate">{card.issuer} •••• {card.mask}</div>
                                <div className="truncate">{formatLastSynced(card)}</div>
                                {card.expires ? <div className="truncate">Exp {card.expires}</div> : null}
                            </div>
                        </div>
                        <Checkbox checked={checked} onCheckedChange={() => onToggle(card.id)} />
                    </div>
                )
            })}
        </div>
    )
}

/* ===========================================
   Compact picker (13+ cards): dropdown + chips
   =========================================== */
function CompactPicker({
                           cards,
                           selectedIds,
                           onChange,
                       }: {
    cards: CardRow[]
    selectedIds: string[]
    onChange: (ids: string[]) => void
}) {
    const [pendingId, setPendingId] = useState<string | undefined>(undefined)

    const remaining = cards.filter((c) => !selectedIds.includes(c.id))
    const selected = cards.filter((c) => selectedIds.includes(c.id))

    const handleAdd = () => {
        if (!pendingId) return
        if (!selectedIds.includes(pendingId)) onChange([...selectedIds, pendingId])
        setPendingId(undefined)
    }

    const removeId = (id: string) => onChange(selectedIds.filter((x) => x !== id))

    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_auto]">
                <Select value={pendingId} onValueChange={setPendingId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose a card to add…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                        {remaining.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.nickname} — {c.issuer} •••• {c.mask}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="flex gap-2">
                    <Button onClick={handleAdd} disabled={!pendingId}>Add</Button>
                    <Button variant="outline" onClick={() => onChange(cards.map((c) => c.id))} disabled={selectedIds.length === cards.length}>
                        Select all
                    </Button>
                    <Button variant="outline" onClick={() => onChange([])} disabled={selectedIds.length === 0}>
                        Clear
                    </Button>
                </div>
            </div>

            {selected.length ? (
                <div className="flex flex-wrap gap-2">
                    {selected.map((c) => (
                        <span
                            key={c.id}
                            className="inline-flex items-center gap-2 truncate rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs"
                            title={`${c.nickname} — ${c.issuer} •••• ${c.mask}`}
                        >
              <span className="max-w-[200px] truncate">{c.nickname}</span>
              <button
                  type="button"
                  onClick={() => removeId(c.id)}
                  className="rounded-full p-0.5 hover:bg-white/50"
                  aria-label={`Remove ${c.nickname}`}
                  title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
                    ))}
                </div>
            ) : (
                <div className="text-xs text-muted-foreground">No filters applied — showing all cards.</div>
            )}
        </div>
    )
}
