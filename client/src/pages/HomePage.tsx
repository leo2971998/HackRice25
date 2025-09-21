import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { StatTile } from "@/components/cards/StatTile"
import { DonutChart } from "@/components/charts/DonutChart"
import { MerchantTable } from "@/components/cards/MerchantTable"
import { PageSection } from "@/components/layout/PageSection"
import { DetailsTable } from "@/components/details/DetailsTable"
import { MerchantDetailsTable } from "@/components/details/MerchantDetailsTable"
import { RecommendationsSection } from "@/components/recommendations/RecommendationsSection"

import {
    useAccounts,
    useMe,
    useMerchants,
    useSpendDetails,
    useSpendSummary,
} from "@/hooks/useApi"
import { useCardCatalog } from "@/hooks/useCards"
import type { CardRow } from "@/types/api"

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

type HomeTab = "overview" | "details" | "recommendations"
const HOME_TABS: { id: HomeTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
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

/* ───────── glossy hero helpers (issuer/slug tinted) ───────── */

function normalizeSlug(value?: string | null) {
    if (typeof value !== "string") return null
    const t = value.trim()
    return t.length ? t : null
}

function gradientForKey(keyRaw: string) {
    const key = (keyRaw || "").toLowerCase()
    if (key.includes("american")) return "from-fuchsia-500 via-purple-500 to-indigo-600"
    if (key.includes("chase")) return "from-sky-500 via-blue-500 to-indigo-600"
    if (key.includes("capital")) return "from-emerald-500 via-teal-500 to-cyan-600"
    if (key.includes("citi")) return "from-pink-500 via-rose-500 to-red-600"
    if (key.includes("discover")) return "from-orange-500 via-amber-500 to-yellow-600"
    if (key.includes("wells") || key.includes("bank of america")) return "from-red-500 via-rose-500 to-pink-600"
    return "from-violet-500 via-purple-500 to-fuchsia-600"
}

function gradientForCardRow(card?: Partial<CardRow>) {
    const key = (card?.issuer || (card as any)?.network || (card as any)?.productName || (card as any)?.nickname || "") + ""
    return gradientForKey(key)
}

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
    const slug =
        normalizeSlug((card as any)?.productSlug) ??
        normalizeSlug((card as any)?.cardProductSlug) ??
        "—"

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

                    <div className="mt-auto flex items-end justify-between text-xs">
                        <div className="space-x-2 opacity-90">
                            <span>•••• •••• •••• {last4}</span>
                            <span className="hidden sm:inline">SWIPE COACH MEMBER</span>
                        </div>
                        <div className="text-right opacity-90">
                            <div className="uppercase tracking-wide">Slug</div>
                            <div className="font-semibold">{slug}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="absolute inset-0 -z-10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)]" />
        </div>
    )
}

/* Compact, responsive big-number tile for 30-day spend */
function BigSpendTile({ value }: { value: number }) {
    return (
        <div className="rounded-2xl border bg-muted/40 p-4">
            <div className="text-xs text-muted-foreground">30-day spend</div>
            <div className="font-semibold leading-tight" style={{ fontSize: "clamp(1.25rem, 3.5vw, 2.25rem)" }}>
                {formatCurrencyTight(value)}
            </div>
        </div>
    )
}

/* Simple donut legend (name – amount – %) */
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
    const merchants = useMerchants({ limit: 8, windowDays: DETAILS_WINDOW_DAYS, cardIds: filterCardIds, enabled: queryEnabled })
    const catalog = useCardCatalog({ active: true })

    // computed
    const stats = summary.data?.stats ?? { totalSpend: 0, txns: 0, accounts: 0 }
    const categories = summary.data?.byCategory ?? []
    const topCategories = categories.slice(0, 6)
    const merchantRows = merchants.data ?? []

    const detailData = spendDetails.data
    const detailCategories = detailData?.categories ?? []
    const detailMerchants = detailData?.merchants ?? []
    const detailTotal = detailData?.total ?? 0
    const detailTransactions = detailData?.transactionCount ?? 0

    const greeting = me?.name?.trim() || (me?.email ? me.email.split("@")[0] : "there")

    // selection utilities
    const [activeTab, setActiveTab] = useState<HomeTab>("overview")
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

    return (
        <div className="mx-auto max-w-7xl px-5 md:px-8 lg:px-10 space-y-8 md:space-y-10">
            <PageSection
                title={`Welcome back, ${greeting}`}
                description={`Here’s what’s been happening across your wallet over the last ${DETAILS_WINDOW_DAYS} days.`}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="secondary">
                            <Link to="/recommendations">Explore recommendations</Link>
                        </Button>
                        <Button asChild>
                            <Link to="/setup">Link a new account</Link>
                        </Button>
                    </div>
                }
            />

            {/* Tabs always visible */}
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

            {/* Tabs content */}
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

                    {/* Main grid: hero+stats | donut+top merchants */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* LEFT: Selected card hero + compact stats */}
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
                                        <>
                                            <SingleCardHero card={accountRows[currentIndex]} onPrev={goPrev} onNext={goNext} />

                                            {/* First row: two small tiles */}
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <StatTile label="Transactions" value={(hasSelection ? stats.txns : 0).toLocaleString()} />
                                                <StatTile label="Active cards" value={(hasSelection ? stats.accounts : 0).toString()} />
                                            </div>

                                            {/* Second row: wide spend tile */}
                                            <BigSpendTile value={hasSelection ? stats.totalSpend : 0} />
                                        </>
                                    )
                                ) : (
                                    <>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <StatTile label="Transactions" value={(hasSelection ? stats.txns : 0).toLocaleString()} />
                                            <StatTile label="Active cards" value={(hasSelection ? stats.accounts : 0).toString()} />
                                        </div>
                                        <BigSpendTile value={hasSelection ? stats.totalSpend : 0} />
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        {/* RIGHT: Spending mix + Top merchants */}
                        <div className="space-y-6">
                            <Card className="rounded-3xl">
                                <CardHeader className="p-5 pb-0">
                                    <CardTitle className="text-lg font-semibold">Spending mix</CardTitle>
                                    <CardDescription>Top categories from the last {DETAILS_WINDOW_DAYS} days.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-5">
                                    <div className="h-64">
                                        <DonutChart
                                            data={hasSelection ? topCategories : []}
                                            isLoading={hasSelection && summary.isLoading}
                                            emptyMessage={hasSelection ? "No spending yet in this window." : "Select a card to see categories."}
                                        />
                                    </div>
                                    {hasSelection && !summary.isLoading ? <DonutLegend data={topCategories} /> : null}
                                </CardContent>
                            </Card>

                            <Card className="rounded-3xl">
                                <CardHeader className="p-5 pb-0">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-lg font-semibold">Top merchants</CardTitle>
                                            <CardDescription>Most active in the last {DETAILS_WINDOW_DAYS} days.</CardDescription>
                                        </div>
                                        {(merchantRows.length > 2) && (
                                            <Button variant="outline" size="sm" onClick={() => setActiveTab("details")}>
                                                Full details
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-5">
                                    {/* Modern thin scrollbar via tailwind-scrollbar */}
                                    <div className="overflow-x-auto overscroll-contain scroll-smooth rounded-2xl scrollbar-thin scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent scrollbar-corner-transparent">
                                        <div className="min-w-[560px]">
                                            <MerchantTable
                                                merchants={hasSelection ? merchantRows.slice(0, 2) : []}
                                                isLoading={hasSelection && merchants.isLoading}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            ) : activeTab === "details" ? (
                <div className="grid gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                        <DetailsTable
                            data={hasSelection ? detailCategories : []}
                            total={hasSelection ? detailTotal : 0}
                            windowDays={DETAILS_WINDOW_DAYS}
                            transactionCount={hasSelection ? detailTransactions : 0}
                            isLoading={hasSelection && spendDetails.isLoading}
                        />
                    </div>
                    <div className="lg:col-span-4">
                        <MerchantDetailsTable
                            data={hasSelection ? detailMerchants : []}
                            isLoading={hasSelection && spendDetails.isLoading}
                        />
                    </div>
                </div>
            ) : (
                <RecommendationsSection
                    categories={hasSelection ? detailCategories : []}
                    total={hasSelection ? detailTotal : 0}
                    windowDays={DETAILS_WINDOW_DAYS}
                    isLoadingDetails={hasSelection && spendDetails.isLoading}
                    catalogSize={catalog.data?.length}
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
