import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { DonutChart } from "@/components/charts/DonutChart"
import { StatTile } from "@/components/cards/StatTile"
import { CardSelector } from "@/components/cards/CardSelector"
import { CreditCardDisplay } from "@/components/cards/CreditCardDisplay"

import { AddCardDialog } from "@/components/cards/AddCardDialog"
import { EditCardDialog } from "@/components/cards/EditCardDialog"
import { ImportCardDialog } from "@/components/cards/ImportCardDialog"

import { useToast } from "@/components/ui/use-toast"
import { apiFetch } from "@/lib/api-client"

import { useApplyForCard, useApproveApplication, useCards, useCard, useDeleteCard, useCardCatalog } from "@/hooks/useCards"
import { useRewardsEstimate } from "@/hooks/useRewards"
import type { CardRow as CardRowType, CreditCardProduct } from "@/types/api"
import { AlertTriangle, Loader2 } from "lucide-react"

const currency0 = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const currency2 = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
const percent1 = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 })

type CardsTab = "linked" | "catalog"
const TABS: { id: CardsTab; label: string }[] = [
    { id: "linked", label: "Linked cards" },
    { id: "catalog", label: "All cards" },
]

const ANNUAL_FEE_FILTERS = [
    { value: "all", label: "Any annual fee" },
    { value: "0", label: "No annual fee" },
    { value: "low", label: "Up to $99" },
    { value: "mid", label: "$100 – $199" },
    { value: "high", label: "$200+" },
] as const
type AnnualFeeFilter = typeof ANNUAL_FEE_FILTERS[number]["value"]

const PAGE_SIZE = 4

const STATUS_FILTERS = [
    { value: "all", label: "All" },
    { value: "applied", label: "Applied only" },
    { value: "not_applied", label: "Not applied" },
] as const
type StatusFilter = typeof STATUS_FILTERS[number]["value"]

export default function CardsPage() {
    const { toast } = useToast()

    /* =============== LINKED CARDS =============== */
    const cardsQuery = useCards()
    const cards = cardsQuery.data ?? []
    const [linkedFilter, setLinkedFilter] = useState<StatusFilter>("all")
    const [selectedId, setSelectedId] = useState<string | undefined>()
    const cardDetails = useCard(selectedId)
    const selectedCardSlug = cardDetails.data?.cardProductSlug ?? null
    const rewardsEstimate = useRewardsEstimate(selectedCardSlug, { enabled: Boolean(selectedCardSlug) })

    const deleteCard = useDeleteCard({
        onSuccess: () => toast({ title: "Card removed", description: "We’ll tidy up your stats." }),
        onError: (error) => toast({ title: "Unable to remove card", description: error.message }),
    })
    const applyMutation = useApplyForCard()
    const approveMutation = useApproveApplication()
    const [pendingSlug, setPendingSlug] = useState<string | null>(null)

    const filteredLinkedCards = useMemo(() => {
        if (linkedFilter === "all") return cards
        return cards.filter((card) => {
            const applied = isCardApplied(card)
            return linkedFilter === "applied" ? applied : !applied
        })
    }, [cards, linkedFilter])

    useEffect(() => {
        if (!filteredLinkedCards.length) {
            setSelectedId(undefined)
            return
        }
        if (!selectedId || !filteredLinkedCards.some((c) => c.id === selectedId)) {
            setSelectedId(filteredLinkedCards[0].id)
        }
    }, [filteredLinkedCards, selectedId])

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [importDialogOpen, setImportDialogOpen] = useState(false)
    const [editingCard, setEditingCard] = useState<CardRowType | null>(null)
    const [debugInfo, setDebugInfo] = useState<any>(null)
    const [showDebug, setShowDebug] = useState(false)

    const summary = cardDetails.data?.summary
    const donutData = useMemo(() => summary?.byCategory ?? [], [summary])
    const showLinkingBanner = cardDetails.data ? isCardApplied(cardDetails.data) && !cardDetails.data.mask : false
    const rewardsData = rewardsEstimate.data
    const rewardsByCategory = useMemo(
        () => Object.entries(rewardsData?.earnings.byCategory ?? {}).sort((a, b) => Number(b[1]) - Number(a[1])),
        [rewardsData]
    )
    const rewardsProjection = rewardsData ? currency2.format(rewardsData.projectedMonthly) : currency2.format(0)
    const statusCaption = cardDetails.data
        ? isCardApplied(cardDetails.data) && cardDetails.data.appliedAt
            ? `Applied ${new Date(cardDetails.data.appliedAt).toLocaleDateString()}`
            : cardDetails.data.lastSynced
                ? `Synced ${new Date(cardDetails.data.lastSynced).toLocaleDateString()}`
                : undefined
        : undefined

    const handleDelete = (id: string) => deleteCard.mutate(id)
    const handleEdit = (id: string) => {
        const card = cards.find((c) => c.id === id)
        if (card) {
            setEditingCard(card)
            setEditDialogOpen(true)
        }
    }
    const handleDebug = async () => {
        try {
            const result = await apiFetch("/cards/debug")
            setDebugInfo(result)
            setShowDebug(true)
        } catch (error) {
            toast({
                title: "Debug failed",
                description: error instanceof Error ? error.message : "Unable to fetch debug info",
            })
        }
    }

    // already-linked/applied matcher
    const appliedMatcher = useMemo(() => buildAppliedMatcher(cards), [cards])

    /* =============== CATALOG =============== */
    const catalogQuery = useCardCatalog({ active: true })
    const rawCatalog = catalogQuery.data as any
    const catalogCards: CreditCardProduct[] = useMemo(() => extractCatalogCards(rawCatalog), [rawCatalog])

    const issuers = useMemo(() => {
        const s = new Set<string>()
        for (const card of catalogCards) if (card?.issuer) s.add(card.issuer)
        return [...s].sort((a, b) => a.localeCompare(b))
    }, [catalogCards])

    const categories = useMemo(() => {
        const s = new Set<string>()
        for (const card of catalogCards) for (const r of card?.rewards ?? []) if (r?.category) s.add(r.category)
        return [...s].sort((a, b) => a.localeCompare(b))
    }, [catalogCards])

    const [issuerFilter, setIssuerFilter] = useState<string>("all")
    const [categoryFilter, setCategoryFilter] = useState<string>("all")
    const [annualFeeFilter, setAnnualFeeFilter] = useState<AnnualFeeFilter>("all")
    const [catalogStatusFilter, setCatalogStatusFilter] = useState<StatusFilter>("all")

    const [appliedSlugs, setAppliedSlugs] = useState<Set<string>>(new Set())

    const catalogWithApplied = useMemo<Array<{ product: CreditCardProduct; applied: boolean }>>(() => {
        return catalogCards.map((product) => {
            const hasLinkedSlug = product.slug ? appliedSlugs.has(product.slug) : false
            const applied = hasLinkedSlug || appliedMatcher(product)
            return { product, applied }
        })
    }, [catalogCards, appliedMatcher, appliedSlugs])

    const filteredCatalogEntries = useMemo(() => {
        return catalogWithApplied.filter(({ product, applied }) => {
            const matchesIssuer = issuerFilter === "all" || product.issuer === issuerFilter
            const matchesCategory =
                categoryFilter === "all" || (product.rewards ?? []).some((r) => r.category === categoryFilter)
            const matchesFee = matchesAnnualFee(product.annual_fee, annualFeeFilter)
            const matchesStatus =
                catalogStatusFilter === "all"
                    ? true
                    : catalogStatusFilter === "applied"
                        ? applied
                        : !applied
            return matchesIssuer && matchesCategory && matchesFee && matchesStatus
        })
    }, [catalogWithApplied, issuerFilter, categoryFilter, annualFeeFilter, catalogStatusFilter])

    const [page, setPage] = useState(1)
    useEffect(() => {
        setPage(1)
    }, [issuerFilter, categoryFilter, annualFeeFilter, catalogStatusFilter, filteredCatalogEntries.length])

    const totalPages = Math.max(1, Math.ceil(filteredCatalogEntries.length / PAGE_SIZE))
    const start = (page - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE
    const pageItems = filteredCatalogEntries.slice(start, end)

    const [activeTab, setActiveTab] = useState<CardsTab>("linked")

    const onApply = async (product: CreditCardProduct) => {
        if (!product.slug) {
            toast({ title: "Couldn’t start application", description: "Product slug missing." })
            return
        }
        try {
            setPendingSlug(product.slug)
            const response = await applyMutation.mutateAsync({ slug: product.slug })
            setAppliedSlugs((prev) => {
                const next = new Set(prev)
                next.add(product.slug!)
                return next
            })
            toast({ title: "Application started", description: `${product.product_name} by ${product.issuer}` })
            try {
                await approveMutation.mutateAsync({ application_id: response.id })
                setActiveTab("linked")
                toast({ title: "Application approved", description: "We added the card to your linked list." })
            } catch (error: any) {
                toast({
                    title: "Approval pending",
                    description: error?.message ?? "We started your application but couldn't auto-link it.",
                })
            }
        } catch (error: any) {
            toast({ title: "Couldn’t start application", description: error?.message ?? "Unknown error" })
        } finally {
            setPendingSlug(null)
        }
    }

    return (
        <div className="mx-auto max-w-7xl space-y-8 px-4 md:px-6 lg:px-8">
            {/* Tabs header */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-2 rounded-full border border-border/60 bg-white/80 p-1 text-sm shadow-sm backdrop-blur dark:bg-zinc-900/60">
                    {TABS.map((tab) => {
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
            </div>

            {/* Linked cards */}
            {activeTab === "linked" ? (
                <div className="space-y-6">
                    <div className="flex flex-col gap-6 md:flex-row">
                        <div className="md:w-5/12 space-y-4">
                            <CardSelector
                                cards={filteredLinkedCards}
                                selectedId={selectedId}
                                onSelect={setSelectedId}
                                onDelete={handleDelete}
                                onEdit={handleEdit}
                                onAdd={() => setDialogOpen(true)}
                                isLoading={cardsQuery.isLoading}
                                heightClass="max-h-[780px]"
                                headerExtras={<StatusFilterPills value={linkedFilter} onChange={setLinkedFilter} />}
                                emptyMessage={cards.length ? "No cards match this filter." : "No cards linked yet."}
                            />
                        </div>

                        <div className="md:w-7/12 space-y-4">
                            {cardDetails.isLoading ? (
                                <Card className="rounded-3xl">
                                    <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                                        Loading card details…
                                    </CardContent>
                                </Card>
                            ) : cardDetails.data ? (
                                <>
                                    <CreditCardDisplay card={cardDetails.data} />

                                    {showLinkingBanner ? (
                                        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-start gap-3">
                                                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
                                                <div>
                                                    <p className="text-sm font-semibold">Finish linking to sync spend</p>
                                                    <p className="text-xs text-amber-800/80">
                                                        Add your card details so we can pull transactions automatically.
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-amber-300 text-amber-900 hover:bg-amber-100"
                                                onClick={() => {
                                                    setEditingCard(cardDetails.data as CardRowType)
                                                    setEditDialogOpen(true)
                                                }}
                                            >
                                                Update card
                                            </Button>
                                        </div>
                                    ) : null}

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <StatTile label="30-day spend" value={currency2.format(summary?.spend ?? 0)} />
                                        <StatTile label="Transactions" value={(summary?.txns ?? 0).toLocaleString()} />
                                        <StatTile
                                            label="Status"
                                            value={cardDetails.data.status}
                                            caption={statusCaption}
                                        />
                                    </div>

                                    {selectedCardSlug ? (
                                        <Card className="rounded-3xl">
                                            <CardHeader>
                                                <CardTitle className="text-lg font-semibold">Cash-back (last 30 days)</CardTitle>
                                                <CardDescription>
                                                    {rewardsEstimate.isLoading
                                                        ? "Crunching the numbers…"
                                                        : `Projected monthly ${rewardsProjection}`}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {rewardsEstimate.isLoading ? (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Calculating rewards…
                                                    </div>
                                                ) : rewardsData ? (
                                                    <>
                                                        <div className="text-2xl font-semibold">
                                                            {currency2.format(rewardsData.earnings.total)}
                                                        </div>
                                                        {rewardsByCategory.length ? (
                                                            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                                                {rewardsByCategory.slice(0, 4).map(([category, total]) => (
                                                                    <div
                                                                        key={category}
                                                                        className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2"
                                                                    >
                                                                        <span className="font-medium text-foreground/80">{category}</span>
                                                                        <span className="font-semibold text-foreground">
                                                                            {currency2.format(Number(total))}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-muted-foreground">
                                                                We haven’t detected any category bonuses yet.
                                                            </p>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">
                                                        We don’t have enough spend yet to estimate cash-back for this card.
                                                    </p>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ) : null}

                                    <Card className="rounded-3xl">
                                        <CardHeader>
                                            <CardTitle className="text-lg font-semibold">Category breakdown</CardTitle>
                                            <CardDescription>Last 30 days</CardDescription>
                                        </CardHeader>
                                        <CardContent className="h-64 p-0">
                                            <DonutChart
                                                data={donutData}
                                                isLoading={cardDetails.isLoading}
                                                emptyMessage="No spending yet in the last 30 days."
                                            />
                                        </CardContent>
                                    </Card>

                                    {cardDetails.data.features?.length ? (
                                        <Card className="rounded-3xl">
                                            <CardHeader>
                                                <CardTitle className="text-lg font-semibold">
                                                    {cardDetails.data.productName ?? "Card benefits"}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                                                    {cardDetails.data.features.map((feature) => (
                                                        <li key={feature}>{feature}</li>
                                                    ))}
                                                </ul>
                                            </CardContent>
                                        </Card>
                                    ) : null}
                                </>
                            ) : cards.length ? (
                                <Card className="rounded-3xl">
                                    <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                                        Select a card to see its details.
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="rounded-3xl">
                                    <CardHeader>
                                        <CardTitle className="text-lg font-semibold">No cards yet</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                                        <p>Add your first card to unlock tailored coaching and spend insights.</p>
                                        <div className="flex flex-col gap-2">
                                            <Button onClick={() => setDialogOpen(true)}>Link a card</Button>
                                            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                                                Import existing card
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={handleDebug}>
                                                Debug card data
                                            </Button>
                                        </div>
                                        {showDebug && debugInfo && (
                                            <div className="mt-4 rounded-md bg-muted p-3 text-xs">
                                                <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>

                    <AddCardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
                    <EditCardDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} card={editingCard} />
                    <ImportCardDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
                </div>
            ) : (
                /* =============== CATALOG: glossy cards + pagination (4 per page) =============== */
                <div className="space-y-6">
                    <Card className="rounded-3xl p-0">
                        <CardHeader className="p-6 md:p-8 pb-0">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-xl font-semibold">All cards</CardTitle>
                                    <CardDescription>Deterministic catalog data — no PII, no surprises.</CardDescription>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {catalogQuery.isLoading ? "…" : `${filteredCatalogEntries.length} items`}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 p-6 md:p-8 pt-4">
                            <div className="grid gap-4 md:grid-cols-3">
                                <Select value={issuerFilter} onValueChange={setIssuerFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Filter by issuer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All issuers</SelectItem>
                                        {issuers.map((issuer) => (
                                            <SelectItem key={issuer} value={issuer}>
                                                {issuer}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select value={annualFeeFilter} onValueChange={(v) => setAnnualFeeFilter(v as AnnualFeeFilter)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Annual fee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ANNUAL_FEE_FILTERS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Bonus category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All categories</SelectItem>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat} value={cat}>
                                                {cat}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                <StatusFilterPills value={catalogStatusFilter} onChange={setCatalogStatusFilter} />
                            </div>
                        </CardContent>
                    </Card>

                    {catalogQuery.isLoading ? (
                        <Card className="rounded-3xl p-0">
                            <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                                Loading catalog…
                            </CardContent>
                        </Card>
                    ) : filteredCatalogEntries.length === 0 ? (
                        <Card className="rounded-3xl p-0">
                            <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                                No cards match the selected filters.
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="grid gap-6 md:grid-cols-2">
                                {pageItems.map(({ product, applied }) => (
                                    <CatalogCreditCard
                                        key={product.slug ?? product.product_name}
                                        product={product}
                                        applied={applied}
                                        isApplying={
                                            pendingSlug === product.slug && (applyMutation.isPending || approveMutation.isPending)
                                        }
                                        onApply={() => onApply(product)}
                                    />
                                ))}
                            </div>

                            {/* Pagination: shows only when more than 4 results */}
                            {filteredCatalogEntries.length > PAGE_SIZE && (
                                <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                                    <div className="text-xs text-muted-foreground">
                                        Showing <b>{start + 1}</b>–<b>{Math.min(end, filteredCatalogEntries.length)}</b> of{" "}
                                        <b>{filteredCatalogEntries.length}</b>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                                            Previous
                                        </Button>
                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setPage(p)}
                                                    className={[
                                                        "h-8 w-8 rounded-full text-xs",
                                                        p === page ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                                                    ].join(" ")}
                                                    aria-label={`Go to page ${p}`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

/* ===================== helpers ===================== */

function isCardApplied(card: CardRowType): boolean {
    const status = (card.status ?? "").toLowerCase()
    return status === "applied" || Boolean(card.appliedAt)
}

function matchesAnnualFee(fee: number | null | undefined, filter: AnnualFeeFilter) {
    if (filter === "all") return true
    if (fee == null) return false
    if (filter === "0") return fee === 0
    if (filter === "low") return fee > 0 && fee < 100
    if (filter === "mid") return fee >= 100 && fee < 200
    if (filter === "high") return fee >= 200
    return true
}

function formatAnnualFee(fee: number | null | undefined) {
    if (fee == null) return "—"
    if (fee === 0) return "$0"
    return currency0.format(fee)
}
function extractCatalogCards(raw: any): CreditCardProduct[] {
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    const keys = ["items", "results", "data", "cards", "products", "catalog", "rows", "list"]
    for (const k of keys) {
        const v = raw?.[k]
        if (Array.isArray(v)) return v
    }
    if (raw.data && typeof raw.data === "object") {
        for (const k of keys) {
            const v = raw.data[k]
            if (Array.isArray(v)) return v
        }
        if (Array.isArray(raw.data)) return raw.data
    }
    for (const v of Object.values(raw)) {
        if (Array.isArray(v) && v.length && typeof v[0] === "object") {
            const obj = v[0] as any
            if ("product_name" in obj || "issuer" in obj || "rewards" in obj) return v as any
        }
    }
    return []
}

function buildAppliedMatcher(cards: CardRowType[]) {
    const norm = (s?: string | null) =>
        (s ?? "")
            .toLowerCase()
            .replace(/[®™]/g, "")
            .replace(/\b(card|credit|preferred|gold|x)\b/g, "")
            .replace(/[^\w]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()

    const nameSet = new Set<string>()
    const issuerNameSet = new Set<string>()
    const slugSet = new Set<string>()

    for (const c of cards) {
        const n1 = norm((c as any).productName)
        const n2 = norm((c as any).nickname)
        if (n1) nameSet.add(n1)
        if (n2) nameSet.add(n2)

        const issuer = norm((c as any).issuer)
        const joined = `${issuer} ${n1 || n2}`.trim()
        if (issuer && (n1 || n2)) issuerNameSet.add(joined)

        const pslug = c.cardProductSlug
        if (pslug) slugSet.add(pslug)
    }

    return (p: CreditCardProduct) => {
        const pName = norm(p.product_name)
        const pIssuer = norm(p.issuer)
        const pJoined = `${pIssuer} ${pName}`.trim()
        const matchesSlug = p.slug ? slugSet.has(p.slug) : false
        const matchesName = pName ? nameSet.has(pName) : false
        const matchesIssuerName = pIssuer && pName ? issuerNameSet.has(pJoined) : false
        return matchesSlug || matchesName || matchesIssuerName
    }
}

/* ===================== glossy catalog card ===================== */

type StatusFilterPillsProps = {
    value: StatusFilter
    onChange: (value: StatusFilter) => void
}

function StatusFilterPills({ value, onChange }: StatusFilterPillsProps) {
    return (
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 p-0.5 text-xs shadow-sm">
            {STATUS_FILTERS.map((option) => {
                const isActive = option.value === value
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        aria-pressed={isActive}
                        className={[
                            "rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            isActive
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}

type CatalogCreditCardProps = {
    product: CreditCardProduct
    applied: boolean
    onApply: () => void
    isApplying?: boolean
}

function gradientFor(product: CreditCardProduct) {
    const key = (product.issuer || product.network || "").toLowerCase()
    if (key.includes("american")) return "from-fuchsia-500 via-purple-500 to-indigo-600"
    if (key.includes("chase")) return "from-sky-500 via-blue-500 to-indigo-600"
    if (key.includes("capital")) return "from-emerald-500 via-teal-500 to-cyan-600"
    if (key.includes("citi")) return "from-pink-500 via-rose-500 to-red-600"
    return "from-violet-500 via-purple-500 to-fuchsia-600"
}

function CatalogCreditCard({ product, applied, onApply, isApplying = false }: CatalogCreditCardProps) {
    const gradient = gradientFor(product)
    const issuer = (product.issuer ?? "").toUpperCase()
    const name = product.product_name
    const annual = formatAnnualFee(product.annual_fee)

    return (
        <div className="space-y-3">
            {/* glossy card */}
            <div className="relative overflow-hidden rounded-3xl">
                <div className={`relative h-40 w-full rounded-3xl bg-gradient-to-br ${gradient} p-5 text-white`}>
                    {/* sheen */}
                    <div className="pointer-events-none absolute -left-1/4 -top-1/2 h-[220%] w-[150%] rotate-12 bg-white/10 blur-2xl" />
                    {/* content */}
                    <div className="relative flex h-full flex-col">
                        <div className="flex items-center justify-between">
                            <div className="text-[11px] font-semibold tracking-[0.18em] opacity-90">{issuer || "CARD ISSUER"}</div>
                            {/* Only show pill when applied */}
                            {applied ? (
                                <div className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-semibold">
                                    Applied
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-1 text-xl font-semibold leading-6">{name}</div>

                        <div className="mt-auto flex items-end justify-between text-xs">
                            <div className="space-x-2 opacity-90">
                                <span>•••• •••• •••• 0000</span>
                                <span className="hidden sm:inline">SWIPE COACH MEMBER</span>
                            </div>
                            <div className="text-right opacity-90">
                                <div className="uppercase tracking-wide">Annual fee</div>
                                <div className="font-semibold">{annual}</div>
                            </div>
                        </div>
                    </div>
                </div>
                {/* soft shadow */}
                <div className="absolute inset-0 -z-10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)]" />
            </div>

            {/* actions + quick details (outside to avoid nested buttons) */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Base: {percent1.format(product.base_cashback ?? 0)}</span>
                    {product.rewards?.slice(0, 2).map((r, i) => (
                        <Badge key={i} variant="secondary" className="rounded-full px-3 py-1">
                            {r.category}: {percent1.format(r.rate ?? 0)}
                        </Badge>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    {applied ? (
                        <Button variant="outline" size="sm" disabled>
                            Applied
                        </Button>
                    ) : (
                        <Button size="sm" onClick={onApply} disabled={isApplying}>
                            {isApplying ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Applying…
                                </>
                            ) : (
                                "Apply"
                            )}
                        </Button>
                    )}
                    {product.link_url ? (
                        <Button asChild variant="ghost" size="sm">
                            <a href={product.link_url} target="_blank" rel="noreferrer">
                                Details
                            </a>
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    )
}