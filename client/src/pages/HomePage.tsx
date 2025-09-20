import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { StatTile } from "@/components/cards/StatTile"
import { DonutChart } from "@/components/charts/DonutChart"
import { MerchantTable } from "@/components/cards/MerchantTable"
import { MoneyMomentCard } from "@/components/cards/MoneyMomentCard"
import { PageSection } from "@/components/layout/PageSection"
import { DetailsTable } from "@/components/details/DetailsTable"
import { MerchantDetailsTable } from "@/components/details/MerchantDetailsTable"
import { RecommendationsSection } from "@/components/recommendations/RecommendationsSection"
import {
    useAccounts,
    useMe,
    useMerchants,
    useMoneyMoments,
    useSpendDetails,
    useSpendSummary,
} from "@/hooks/useApi"
import { useCardCatalog } from "@/hooks/useCards"
import type { CardRow } from "@/types/api"
import { openFlowCoach } from "@/lib/flow-coach"

const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
})

type HomeTab = "overview" | "details" | "recommendations"

const HOME_TABS: { id: HomeTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
    { id: "recommendations", label: "Recommendations" },
]

function formatLastSynced(card: CardRow) {
    if (!card.lastSynced) return "Not synced yet"
    const date = new Date(card.lastSynced)
    if (Number.isNaN(date.getTime())) return "Synced recently"
    return `Synced ${date.toLocaleDateString()}`
}

const DETAILS_WINDOW_DAYS = 30

export function HomePage() {
    const { data: me } = useMe()
    const accounts = useAccounts()
    const accountRows = accounts.data ?? []

    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
    const cardIdsForFiltering = selectedCardIds.length > 0 ? selectedCardIds : undefined

    const summary = useSpendSummary(DETAILS_WINDOW_DAYS, { cardIds: cardIdsForFiltering })
    const spendDetails = useSpendDetails(DETAILS_WINDOW_DAYS, { cardIds: cardIdsForFiltering })
    const merchants = useMerchants({ limit: 8, windowDays: DETAILS_WINDOW_DAYS, cardIds: cardIdsForFiltering })
    const moments = useMoneyMoments(DETAILS_WINDOW_DAYS, { cardIds: cardIdsForFiltering })
    const catalog = useCardCatalog({ active: true })

    const stats = summary.data?.stats ?? { totalSpend: 0, txns: 0, accounts: 0 }
    const categories = summary.data?.byCategory ?? []
    const topCategories = categories.slice(0, 6)
    const merchantRows = merchants.data ?? []
    const momentsList = moments.data ?? []

    const detailData = spendDetails.data
    const detailCategories = detailData?.categories ?? []
    const detailMerchants = detailData?.merchants ?? []
    const detailTotal = detailData?.total ?? 0
    const detailTransactions = detailData?.transactionCount ?? 0

    const greeting = me?.name?.trim() || (me?.email ? me.email.split("@")[0] : "there")

    const handleCardToggle = (cardId: string) => {
        setSelectedCardIds((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]))
    }
    const handleSelectAllCards = () => setSelectedCardIds(accountRows.map((c) => c.id))
    const handleClearSelection = () => setSelectedCardIds([])

    const selectedCardsText = useMemo(() => {
        if (selectedCardIds.length === 0 || selectedCardIds.length === accountRows.length) return "All cards"
        return `${selectedCardIds.length} selected card${selectedCardIds.length > 1 ? "s" : ""}`
    }, [accountRows.length, selectedCardIds])

    const [activeTab, setActiveTab] = useState<HomeTab>("overview")

    // ====== OVERVIEW (STACKED, FULL-WIDTH SECTIONS) ======
    const overviewContent = (
        <div className="space-y-8 md:space-y-10 lg:space-y-12">
            {/* Linked cards FIRST (filter control) */}
            <Card className="rounded-3xl">
                <CardHeader className="p-6 md:p-8 pb-0">
                    <CardTitle className="text-lg font-semibold">Linked cards</CardTitle>
                    {accountRows.length > 1 ? (
                        <CardDescription>
                            Select cards to filter your insights. Currently viewing: {selectedCardsText}.
                        </CardDescription>
                    ) : null}
                </CardHeader>
                <CardContent className="p-6 md:p-8 pt-4">
                    {accounts.isLoading ? (
                        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading cards…</div>
                    ) : accountRows.length ? (
                        <div className="space-y-4">
                            {accountRows.length > 1 ? (
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleSelectAllCards}
                                        disabled={selectedCardIds.length === accountRows.length}
                                    >
                                        Select all
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleClearSelection} disabled={selectedCardIds.length === 0}>
                                        Clear
                                    </Button>
                                </div>
                            ) : null}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {accountRows.map((card) => (
                                    <button
                                        key={card.id}
                                        type="button"
                                        onClick={() => handleCardToggle(card.id)}
                                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                                            selectedCardIds.includes(card.id) ? "border-primary/60 ring-1 ring-primary/40" : "border-border/60"
                                        }`}
                                    >
                                        {accountRows.length > 1 ? (
                                            <Checkbox checked={selectedCardIds.includes(card.id)} onCheckedChange={() => handleCardToggle(card.id)} />
                                        ) : null}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-foreground md:text-base">{card.nickname}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {card.issuer} •••• {card.mask}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{formatLastSynced(card)}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
                            No cards yet. Add your first card to get insights.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stats — full width strip */}
            <Card className="rounded-3xl">
                <CardContent className="p-6 md:p-8">
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                        <StatTile label="Total spend" value={currencyFormatter.format(stats.totalSpend)} />
                        <StatTile label="Transactions" value={stats.txns.toLocaleString()} />
                        <StatTile label="Active cards" value={stats.accounts.toString()} />
                    </div>
                </CardContent>
            </Card>

            {/* Flow Coach CTA */}
            <Card className="rounded-3xl border border-primary/40 bg-primary/5">
                <CardHeader className="p-6 md:p-8 pb-0">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                            <MessageCircle className="h-4 w-4" />
                        </span>
                        Flow Coach
                    </CardTitle>
                    <CardDescription>Approve smart actions and get proactive nudges without leaving the dashboard.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 p-6 md:p-8 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                        Gemini tracks spend trends, drafts budgets, and surfaces subscriptions. Tap below to open the chat.
                    </p>
                    <Button size="sm" onClick={() => openFlowCoach()}>
                        Chat with Flow Coach
                    </Button>
                </CardContent>
            </Card>

            {/* Spending mix — full width */}
            <Card className="rounded-3xl">
                <CardHeader className="p-6 md:p-8 pb-0">
                    <CardTitle className="text-lg font-semibold">Spending mix</CardTitle>
                    <CardDescription>Top categories from the last {DETAILS_WINDOW_DAYS} days.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 md:p-8 pt-4">
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="h-64 lg:h-72">
                            <DonutChart data={topCategories} isLoading={summary.isLoading} emptyMessage="No spending yet in this window." />
                        </div>
                        <div className="space-y-2">
                            {summary.isLoading ? (
                                <div className="flex h-full min-h-40 items-center justify-center rounded-2xl bg-muted/40 px-4 text-muted-foreground">
                                    Loading categories…
                                </div>
                            ) : topCategories.length ? (
                                <div className="space-y-2">
                                    {topCategories.map((category) => (
                                        <div
                                            key={category.name}
                                            className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-2"
                                        >
                                            <span className="font-medium text-foreground">{category.name}</span>
                                            <span className="font-semibold">{currencyFormatter.format(category.total)}</span>
                                        </div>
                                    ))}
                                    {categories.length > topCategories.length ? (
                                        <p className="text-xs text-muted-foreground">
                                            +{categories.length - topCategories.length} more categories tracked.
                                        </p>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="flex h-full min-h-40 items-center justify-center rounded-2xl bg-muted/40 px-4 text-muted-foreground">
                                    No spending yet in this window.
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Top merchants — full width (MerchantTable renders its own Card) */}
            <div className="w-full">
                <MerchantTable merchants={merchantRows} isLoading={merchants.isLoading} />
            </div>

            {/* Money moments — full width */}
            <Card className="rounded-3xl">
                <CardHeader className="p-6 md:p-8 pb-0">
                    <CardTitle className="text-lg font-semibold">Money moments</CardTitle>
                </CardHeader>
                <CardContent className="p-6 md:p-8 pt-4">
                    {moments.isLoading ? (
                        <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Loading insights…</div>
                    ) : momentsList.length ? (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                            {momentsList.map((m) => (
                                <MoneyMomentCard key={m.id} moment={m} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                            We’ll highlight tips and wins here.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )

    // ====== DETAILS / RECOMMENDATIONS (unchanged) ======
    const detailsContent = (
        <div className="grid gap-8 md:gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <DetailsTable
                data={detailCategories}
                total={detailTotal}
                windowDays={DETAILS_WINDOW_DAYS}
                transactionCount={detailTransactions}
                isLoading={spendDetails.isLoading}
            />
            <MerchantDetailsTable data={detailMerchants} isLoading={spendDetails.isLoading} />
        </div>
    )

    const recommendationsContent = (
        <RecommendationsSection
            categories={detailCategories}
            total={detailTotal}
            windowDays={DETAILS_WINDOW_DAYS}
            isLoadingDetails={spendDetails.isLoading}
            catalogSize={catalog.data?.length}
        />
    )

    const tabContent = activeTab === "overview" ? overviewContent : activeTab === "details" ? detailsContent : recommendationsContent

    return (
        <div className="mx-auto max-w-7xl px-5 md:px-8 lg:px-10 space-y-10 md:space-y-12">
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

            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-4">
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
            </div>

            <div className="space-y-10 md:space-y-12">{tabContent}</div>
        </div>
    )
}
