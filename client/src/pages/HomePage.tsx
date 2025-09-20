import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatTile } from "@/components/cards/StatTile"
import { DonutChart } from "@/components/charts/DonutChart"
import { MerchantTable } from "@/components/cards/MerchantTable"
import { MoneyMomentCard } from "@/components/cards/MoneyMomentCard"
import { PageSection } from "@/components/layout/PageSection"
import { BreakdownList } from "@/components/BreakdownList"
import { useCategorySummary, useCashbackEstimate, useMerchantBreakdown, useMe, useMoneyMoments } from "@/hooks/useApi"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

export function HomePage() {
  const { data: me } = useMe()
  const summary = useCategorySummary(30)
  const merchants = useMerchantBreakdown({ windowDays: 90, limit: 6 })
  const moments = useMoneyMoments(30)
  const cashback = useCashbackEstimate({ windowDays: 90 })

  const stats = summary.data?.stats ?? { totalSpend: 0, txns: 0, accounts: 0 }
  const categories = summary.data?.byCategory ?? []
  const others = summary.data?.others ?? { total: 0, share: 0, count: 0 }
  const merchantRows = merchants.data ?? []
  const momentsList = moments.data ?? []
  const cashbackData = cashback.data

  const greeting = me?.name?.trim() || (me?.email ? me.email.split("@")[0] : "there")

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
              <Link to="/spending">Open spending details</Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="md:col-span-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile label="Total spend" value={currencyFormatter.format(stats.totalSpend)} />
            <StatTile label="Transactions" value={stats.txns.toLocaleString()} />
            <StatTile label="Active cards" value={stats.accounts.toString()} />
          </div>
        </div>

        <Card className="md:col-span-7 min-h-[18rem] rounded-3xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Spending mix</CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link to="/spending">View details</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-0 md:grid-cols-2">
            <div className="flex items-center justify-center">
              <DonutChart
                data={categories}
                isLoading={summary.isLoading}
                emptyMessage="No spending yet in the last 30 days."
              />
            </div>
            <div className="flex flex-col justify-center gap-2 border-t border-border/60 px-6 py-6 md:border-l md:border-t-0">
              <BreakdownList
                isLoading={summary.isLoading}
                categories={categories}
                others={others}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-5 min-h-[18rem] rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Cashback pulse</CardTitle>
            <p className="text-sm text-muted-foreground">Estimated rewards from your recent spending.</p>
          </CardHeader>
          <CardContent className="flex h-full flex-col justify-between gap-4">
            {cashback.isLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Calculating rewards…
              </div>
            ) : cashbackData ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Est. rewards this period</p>
                  <p className="text-3xl font-semibold text-foreground">
                    {currencyFormatter.format(cashbackData.estimatedRewards)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Period spend: {currencyFormatter.format(cashbackData.periodSpend)}
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground">
                    Best card: {cashbackData.bestCard ? cashbackData.bestCard.name : "No match yet"}
                    {cashbackData.bestCard?.issuer ? ` (${cashbackData.bestCard.issuer})` : ""}
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    {cashbackData.byCategory.slice(0, 3).map((entry) => (
                      <li key={entry.category} className="flex justify-between">
                        <span>{entry.category}</span>
                        <span>
                          {currencyFormatter.format(entry.estRewards)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                Link a card to start tracking rewards potential.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="md:col-span-7">
          <MerchantTable merchants={merchantRows} isLoading={merchants.isLoading} />
        </div>

        <Card className="md:col-span-5 min-h-[10rem] rounded-3xl">
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
    </div>
  )
}
