import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

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
  if (Number.isNaN(date.getTime())) {
    return "Synced recently"
  }
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

  const handleSelectAllCards = () => {
    setSelectedCardIds(accountRows.map((card) => card.id))
  }

  const handleClearSelection = () => {
    setSelectedCardIds([])
  }

  const selectedCardsText = useMemo(() => {
    if (selectedCardIds.length === 0 || selectedCardIds.length === accountRows.length) {
      return "All cards"
    }
    return `${selectedCardIds.length} selected card${selectedCardIds.length > 1 ? "s" : ""}`
  }, [accountRows.length, selectedCardIds])

  const [activeTab, setActiveTab] = useState<HomeTab>("overview")

  const overviewContent = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total spend" value={currencyFormatter.format(stats.totalSpend)} />
        <StatTile label="Transactions" value={stats.txns.toLocaleString()} />
        <StatTile label="Active cards" value={stats.accounts.toString()} />
      </div>

      <div className="grid grid-cols-12 gap-6 md:gap-8">
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="min-h-[320px] rounded-3xl p-0">
              <CardHeader className="p-6 md:p-8 pb-0">
                <CardTitle className="text-lg font-semibold">Spending mix</CardTitle>
                <CardDescription>Top categories from the last {DETAILS_WINDOW_DAYS} days.</CardDescription>
              </CardHeader>
              <CardContent className="flex h-full flex-col justify-between gap-4 p-6 md:p-8 pt-4">
                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="h-64 flex-1">
                    <DonutChart
                      data={topCategories}
                      isLoading={summary.isLoading}
                      emptyMessage="No spending yet in this window."
                    />
                  </div>
                  <div className="flex-1 space-y-2 text-sm md:text-base">
                    {summary.isLoading ? (
                      <div className="flex h-full items-center justify-center rounded-2xl bg-muted/40 px-4 text-muted-foreground">
                        Loading categories…
                      </div>
                    ) : topCategories.length ? (
                      <div className="space-y-2">
                        {topCategories.map((category) => (
                          <div
                            key={category.name}
                            className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-2"
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
                      <div className="flex h-full items-center justify-center rounded-2xl bg-muted/40 px-4 text-muted-foreground">
                        No spending yet in this window.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <MerchantTable merchants={merchantRows} isLoading={merchants.isLoading} />
          </div>

          <Card className="rounded-3xl p-0">
            <CardHeader className="p-6 md:p-8 pb-0">
              <CardTitle className="text-lg font-semibold">Money moments</CardTitle>
            </CardHeader>
            <CardContent className="p-6 md:p-8 pt-4">
              {moments.isLoading ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  Loading insights…
                </div>
              ) : momentsList.length ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {momentsList.map((moment) => (
                    <MoneyMomentCard key={moment.id} moment={moment} />
                  ))}
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  We’ll highlight tips and wins here.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="rounded-3xl p-0">
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
                <div className="space-y-3">
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
                  <div className="space-y-2">
                    {accountRows.map((card) => (
                      <div
                        key={card.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 px-4 py-3"
                      >
                        {accountRows.length > 1 ? (
                          <Checkbox
                            checked={selectedCardIds.includes(card.id)}
                            onCheckedChange={() => handleCardToggle(card.id)}
                          />
                        ) : null}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground md:text-base">{card.nickname}</p>
                          <p className="text-xs text-muted-foreground">{card.issuer} •••• {card.mask}</p>
                          <p className="text-xs text-muted-foreground">{formatLastSynced(card)}</p>
                        </div>
                      </div>
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
        </aside>
      </div>
    </div>
  )

  const detailsContent = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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

  const tabContent =
    activeTab === "overview"
      ? overviewContent
      : activeTab === "details"
        ? detailsContent
        : recommendationsContent

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 space-y-10">
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 rounded-full border border-border/60 bg-white/80 p-1 text-sm shadow-sm backdrop-blur dark:bg-zinc-900/60">
          {HOME_TABS.map((tab) => {
            const isActive = tab.id === activeTab
            const baseClasses = "rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none"
            const activeClasses = "bg-primary text-primary-foreground shadow-soft"
            const inactiveClasses = "text-muted-foreground hover:text-foreground"
            return (
              <button
                key={tab.id}
                type="button"
                className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-8">{tabContent}</div>
    </div>
  )
}

