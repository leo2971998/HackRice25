import { useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { StatTile } from "@/components/cards/StatTile"
import { DonutChart } from "@/components/charts/DonutChart"
import { MerchantTable } from "@/components/cards/MerchantTable"
import { MoneyMomentCard } from "@/components/cards/MoneyMomentCard"
import { PageSection } from "@/components/layout/PageSection"
import { useAccounts, useMe, useMerchants, useMoneyMoments, useSpendSummary } from "@/hooks/useApi"
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

export function HomePage() {
  const { data: me } = useMe()
  const accounts = useAccounts()
  const accountRows = accounts.data ?? []

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const cardIdsForFiltering = selectedCardIds.length > 0 ? selectedCardIds : undefined

  const summary = useSpendSummary(30, { cardIds: cardIdsForFiltering })
  const merchants = useMerchants({ limit: 8, windowDays: 30, cardIds: cardIdsForFiltering })
  const moments = useMoneyMoments(30, { cardIds: cardIdsForFiltering })

  const stats = summary.data?.stats ?? { totalSpend: 0, txns: 0, accounts: 0 }
  const categories = summary.data?.byCategory ?? []
  const topCategories = categories.slice(0, 6)
  const otherCategoryCount = categories.length > topCategories.length ? categories.length - topCategories.length : 0
  const merchantRows = merchants.data ?? []
  const momentsList = moments.data ?? []
  const topCategory = topCategories[0]

  const greeting = me?.name?.trim() || (me?.email ? me.email.split("@")[0] : "there")

  const handleCardToggle = (cardId: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    )
  }

  const handleSelectAllCards = () => {
    setSelectedCardIds(accountRows.map((card) => card.id))
  }

  const handleClearSelection = () => {
    setSelectedCardIds([])
  }

  const selectedCardsText =
    selectedCardIds.length === 0
      ? "All cards"
      : selectedCardIds.length === accountRows.length
        ? "All cards"
        : `${selectedCardIds.length} selected card${selectedCardIds.length > 1 ? "s" : ""}`

  const [activeTab, setActiveTab] = useState<HomeTab>("overview")

  const overviewContent = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <div className="md:col-span-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Total spend" value={currencyFormatter.format(stats.totalSpend)} />
          <StatTile label="Transactions" value={stats.txns.toLocaleString()} />
          <StatTile label="Active cards" value={stats.accounts.toString()} />
        </div>
      </div>

      <Card className="md:col-span-5 rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Spending mix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="h-64 flex-1">
              <DonutChart
                data={topCategories}
                isLoading={summary.isLoading}
                emptyMessage="No spending yet in the last 30 days."
              />
            </div>
            <div className="flex-1 space-y-2 text-sm">
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
                      <span className="font-semibold">
                        {currencyFormatter.format(category.total)}
                      </span>
                    </div>
                  ))}
                  {otherCategoryCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      +{otherCategoryCount} more categor{otherCategoryCount === 1 ? "y" : "ies"} tracked.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl bg-muted/40 px-4 text-muted-foreground">
                  No spending yet in the last 30 days.
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Showing top categories for the last 30 days. See <span className="font-medium text-foreground">Details</span> for full
            breakdown.
          </p>
        </CardContent>
      </Card>

      <div className="md:col-span-4">
        <MerchantTable merchants={merchantRows} isLoading={merchants.isLoading} />
      </div>

      <Card className="md:col-span-3 min-h-[16rem] rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Linked cards</CardTitle>
          {accountRows.length > 1 && (
            <div className="text-xs text-muted-foreground">
              <p className="mb-2">Select cards to filter data: {selectedCardsText}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAllCards}
                  disabled={selectedCardIds.length === accountRows.length}
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearSelection}
                  disabled={selectedCardIds.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex h-64 flex-col gap-3 overflow-auto px-0 pb-0">
          {accounts.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading cards…</div>
          ) : accountRows.length ? (
            accountRows.map((card) => (
              <div key={card.id} className="flex items-center gap-3 px-4 py-3">
                {accountRows.length > 1 && (
                  <Checkbox
                    checked={selectedCardIds.includes(card.id)}
                    onCheckedChange={() => handleCardToggle(card.id)}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{card.nickname}</p>
                  <p className="text-xs text-muted-foreground">{card.issuer} •••• {card.mask}</p>
                  <p className="text-xs text-muted-foreground">{formatLastSynced(card)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No cards yet. Add your first card to get insights.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-12 min-h-[10rem] rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Money moments</CardTitle>
        </CardHeader>
        <CardContent className="grid h-40 grid-cols-1 gap-3 overflow-auto px-0 pb-0 sm:grid-cols-2 md:grid-cols-4">
          {moments.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading insights…</div>
          ) : momentsList.length ? (
            momentsList.map((moment) => <MoneyMomentCard key={moment.id} moment={moment} />)
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
              We’ll highlight tips and wins here.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const detailsContent = (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Detailed breakdown</CardTitle>
        <CardDescription>
          We’re preparing an expanded table with every category, percentage, and export option.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Soon you’ll be able to inspect every category, sort by amount, and download your spending data. This view will also let
          you compare time ranges and card combinations.
        </p>
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-4">
          <p className="font-medium text-foreground">Coming soon</p>
          <p>Interactive category analytics, filters, and CSV export.</p>
        </div>
      </CardContent>
    </Card>
  )

  const recommendationsContent = (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Card recommendations</CardTitle>
        <CardDescription>
          We’ll highlight the best cards and cashback tips for your spending habits right here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        {topCategory ? (
          <p>
            Looks like <span className="font-semibold text-foreground">{topCategory.name}</span> has led your spending at
            {" "}
            {currencyFormatter.format(topCategory.total)} over the last 30 days. We’ll use that to tailor smarter card matches.
          </p>
        ) : (
          <p>As soon as you add some spend, we’ll surface ways to earn more rewards.</p>
        )}
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-4">
          <p className="font-medium text-foreground">Preview</p>
          <p>Expect personalised cashback tips and curated product suggestions in the next sprint.</p>
        </div>
      </CardContent>
    </Card>
  )

  const tabContent =
    activeTab === "overview" ? overviewContent : activeTab === "details" ? detailsContent : recommendationsContent

  return (
    <div className="space-y-10">
      <PageSection
        title={`Welcome back, ${greeting}`}
        description="Here’s what’s been happening across your wallet over the last 30 days."
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
        <div className="flex gap-2 rounded-full border border-border/60 bg-white/70 p-1 text-sm shadow-sm backdrop-blur dark:bg-zinc-900/60">
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

      <div className="space-y-6">{tabContent}</div>
    </div>
  )
}
