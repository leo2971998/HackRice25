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

import { useCards, useCard, useDeleteCard, useCardCatalog } from "@/hooks/useCards"
import type { CardRow, CreditCardProduct } from "@/types/api"

const currency0 = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
})
const currency2 = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
})
const percent1 = new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
})

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

export default function CardsPage() {
    const { toast } = useToast()

    // ----- LINKED CARDS (management) -----
    const cardsQuery = useCards()
    const cards = cardsQuery.data ?? []
    const [selectedId, setSelectedId] = useState<string | undefined>()
    const cardDetails = useCard(selectedId)

    const deleteCard = useDeleteCard({
        onSuccess: () => {
            toast({ title: "Card removed", description: "We’ll tidy up your stats." })
        },
        onError: (error) => {
            toast({ title: "Unable to remove card", description: error.message })
        },
    })

    useEffect(() => {
        if (!cards.length) {
            setSelectedId(undefined)
            return
        }
        if (!selectedId || !cards.some((c) => c.id === selectedId)) {
            setSelectedId(cards[0].id)
        }
    }, [cards, selectedId])

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [importDialogOpen, setImportDialogOpen] = useState(false)
    const [editingCard, setEditingCard] = useState<CardRow | null>(null)
    const [debugInfo, setDebugInfo] = useState<any>(null)
    const [showDebug, setShowDebug] = useState(false)

    const summary = cardDetails.data?.summary
    const donutData = useMemo(() => summary?.byCategory ?? [], [summary])

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

    // ----- CATALOG (filterable list) -----
    const catalogQuery = useCardCatalog({ active: true })
    const catalogCards: CreditCardProduct[] = catalogQuery.data ?? []

    const issuers = useMemo(() => {
        const s = new Set<string>()
        for (const card of catalogCards) if (card?.issuer) s.add(card.issuer)
        return [...s].sort((a, b) => a.localeCompare(b))
    }, [catalogCards])

    const categories = useMemo(() => {
        const s = new Set<string>()
        for (const card of catalogCards) {
            for (const r of card?.rewards ?? []) if (r?.category) s.add(r.category)
        }
        return [...s].sort((a, b) => a.localeCompare(b))
    }, [catalogCards])

    const [issuerFilter, setIssuerFilter] = useState<string>("all")
    const [categoryFilter, setCategoryFilter] = useState<string>("all")
    const [annualFeeFilter, setAnnualFeeFilter] = useState<AnnualFeeFilter>("all")

    const filteredCatalog = useMemo(() => {
        return catalogCards.filter((card) => {
            const matchesIssuer = issuerFilter === "all" || card.issuer === issuerFilter
            const matchesCategory =
                categoryFilter === "all" || (card.rewards ?? []).some((r) => r.category === categoryFilter)
            const matchesFee = matchesAnnualFee(card.annual_fee, annualFeeFilter)
            return matchesIssuer && matchesCategory && matchesFee
        })
    }, [catalogCards, issuerFilter, categoryFilter, annualFeeFilter])

    // ----- TABS -----
    const [activeTab, setActiveTab] = useState<CardsTab>("linked")

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

            {/* Linked cards tab */}
            {activeTab === "linked" ? (
                <div className="space-y-6">
                    <div className="flex flex-col gap-6 md:flex-row">
                        <div className="md:w-1/3 space-y-4">
                            <CardSelector
                                cards={cards}
                                selectedId={selectedId}
                                onSelect={setSelectedId}
                                onDelete={handleDelete}
                                onEdit={handleEdit}
                                onAdd={() => setDialogOpen(true)}
                                isLoading={cardsQuery.isLoading}
                            />
                        </div>

                        <div className="md:w-2/3 space-y-4">
                            {cardDetails.isLoading ? (
                                <Card className="rounded-3xl">
                                    <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                                        Loading card details…
                                    </CardContent>
                                </Card>
                            ) : cardDetails.data ? (
                                <>
                                    <CreditCardDisplay card={cardDetails.data} />

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <StatTile label="30-day spend" value={currency2.format(summary?.spend ?? 0)} />
                                        <StatTile label="Transactions" value={(summary?.txns ?? 0).toLocaleString()} />
                                        <StatTile
                                            label="Status"
                                            value={cardDetails.data.status}
                                            caption={
                                                cardDetails.data.lastSynced
                                                    ? `Synced ${new Date(cardDetails.data.lastSynced).toLocaleDateString()}`
                                                    : undefined
                                            }
                                        />
                                    </div>

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

                    {/* dialogs for linked tab */}
                    <AddCardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
                    <EditCardDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} card={editingCard} />
                    <ImportCardDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
                </div>
            ) : (
                // Catalog tab
                <div className="space-y-6">
                    <Card className="rounded-3xl p-0">
                        <CardHeader className="p-6 md:p-8 pb-0">
                            <CardTitle className="text-xl font-semibold">All cards</CardTitle>
                            <CardDescription>Deterministic catalog data — no PII, no surprises.</CardDescription>
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

                            {(issuerFilter !== "all" || categoryFilter !== "all" || annualFeeFilter !== "all") && (
                                <div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setIssuerFilter("all")
                                            setCategoryFilter("all")
                                            setAnnualFeeFilter("all")
                                        }}
                                    >
                                        Clear filters
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {catalogQuery.isLoading ? (
                        <Card className="rounded-3xl p-0">
                            <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                                Loading catalog…
                            </CardContent>
                        </Card>
                    ) : filteredCatalog.length === 0 ? (
                        <Card className="rounded-3xl p-0">
                            <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                                No cards match the selected filters.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-6 md:grid-cols-2">
                            {filteredCatalog.map((card) => (
                                <CatalogCard key={card.slug ?? card.product_name} card={card} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/* ---------------- helpers ---------------- */

function matchesAnnualFee(fee: number | null | undefined, filter: AnnualFeeFilter) {
    if (filter === "all") return true
    if (fee == null) return false
    if (filter === "0") return fee === 0
    if (filter === "low") return fee > 0 && fee < 100
    if (filter === "mid") return fee >= 100 && fee < 200
    if (filter === "high") return fee >= 200
    return true
}

type CatalogCardProps = { card: CreditCardProduct }

function CatalogCard({ card }: CatalogCardProps) {
    const rewards = card.rewards ?? []
    const topRewards = rewards.slice(0, 3)
    const welcome = card.welcome_offer
    const baseCashback = card.base_cashback ?? 0

    return (
        <Card className="rounded-3xl p-0">
            <CardHeader className="space-y-1 p-6 md:p-8 pb-4">
                <CardTitle className="text-xl font-semibold text-foreground">{card.product_name}</CardTitle>
                <CardDescription>{[card.issuer, card.network].filter(Boolean).join(" • ")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6 md:p-8 pt-0 text-sm md:text-base">
                <div className="grid gap-2 sm:grid-cols-3">
                    <DetailBlock label="Annual fee" value={formatAnnualFee(card.annual_fee)} />
                    <DetailBlock label="Base rate" value={percent1.format(baseCashback)} />
                    <DetailBlock label="Foreign Tx fee" value={formatForeignFee(card.foreign_tx_fee)} />
                </div>

                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground md:text-base">Bonus categories</h4>
                    {topRewards.length === 0 ? (
                        <p className="text-sm text-muted-foreground md:text-base">No published category boosts.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {topRewards.map((r) => (
                                <Badge
                                    key={`${r.category}-${r.rate}`}
                                    variant="secondary"
                                    className="rounded-full px-3 py-1 text-xs md:text-sm"
                                >
                                    {r.category ?? "Category"}: {percent1.format(r.rate ?? 0)}
                                    {r.cap_monthly ? ` up to ${currency0.format(r.cap_monthly)} / mo` : ""}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>

                {welcome && (welcome.bonus_value_usd || welcome.min_spend) ? (
                    <div className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:text-base">
                        Welcome offer worth approximately {currency0.format(welcome.bonus_value_usd ?? 0)}
                        {welcome.min_spend ? ` after ${currency0.format(welcome.min_spend)} in spend` : ""}
                        {welcome.window_days ? ` within ${welcome.window_days} days` : ""}.
                    </div>
                ) : null}

                {card.link_url ? (
                    <Button asChild variant="outline" size="sm">
                        <a href={card.link_url} target="_blank" rel="noreferrer">
                            View card details
                        </a>
                    </Button>
                ) : null}
            </CardContent>
        </Card>
    )
}

type DetailBlockProps = { label: string; value: string }
function DetailBlock({ label, value }: DetailBlockProps) {
    return (
        <div className="rounded-2xl border border-border/60 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold text-foreground md:text-base">{value}</p>
        </div>
    )
}

function formatAnnualFee(fee: number | null | undefined) {
    if (fee == null) return "—"
    if (fee === 0) return "$0"
    return currency0.format(fee)
}
function formatForeignFee(value: number | null | undefined) {
    if (value == null) return "None"
    if (value <= 0) return "None"
    if (value > 0 && value <= 1) return percent1.format(value) // treat decimal as %
    return currency0.format(value) // treat as flat USD fee
}
