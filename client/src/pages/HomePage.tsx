import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { VerifyEmailBanner } from "@/components/banners/VerifyEmailBanner"
import { StatTile } from "@/components/cards/StatTile"
import { DonutChart } from "@/components/charts/DonutChart"
import { MerchantTable } from "@/components/cards/MerchantTable"
import { MoneyMomentCard } from "@/components/cards/MoneyMomentCard"
import { PageSection } from "@/components/layout/PageSection"
import { useAccounts, useMe, useMerchants, useMoneyMoments, useSpendSummary, useStatus } from "@/hooks/useApi"
import type { CardRow } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

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
  const status = useStatus()
  const verified = status.data?.emailVerified === true

  const summary = useSpendSummary(30, { enabled: verified })
  const merchants = useMerchants({ limit: 8, windowDays: 30 }, { enabled: verified })
  const moments = useMoneyMoments(30, { enabled: verified })
  const accounts = useAccounts({ enabled: verified })

  const stats = summary.data?.stats ?? { totalSpend: 0, txns: 0, accounts: 0 }
  const categories = summary.data?.byCategory ?? []
  const merchantRows = merchants.data ?? []
  const accountRows = accounts.data ?? []
  const momentsList = moments.data ?? []

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
              <Link to="/setup">Link a new account</Link>
            </Button>
          </div>
        }
      />

      {!verified ? <VerifyEmailBanner email={me?.email} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="md:col-span-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile label="Total spend" value={currencyFormatter.format(stats.totalSpend)} />
            <StatTile label="Transactions" value={stats.txns.toLocaleString()} />
            <StatTile label="Active cards" value={stats.accounts.toString()} />
          </div>
        </div>

        <Card className="md:col-span-5 min-h-[16rem] rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Spending mix</CardTitle>
          </CardHeader>
          <CardContent className="h-64 p-0">
            <DonutChart
              data={verified ? categories : []}
              isLoading={verified && summary.isLoading}
              emptyMessage="No spending yet in the last 30 days."
            />
          </CardContent>
        </Card>

        <div className="md:col-span-4">
          <MerchantTable merchants={verified ? merchantRows : []} isLoading={verified && merchants.isLoading} />
        </div>

        <Card className="md:col-span-3 min-h-[16rem] rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Linked cards</CardTitle>
          </CardHeader>
          <CardContent className="flex h-64 flex-col gap-3 overflow-auto px-0 pb-0">
            {verified && accounts.isLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading cards…</div>
            ) : accountRows.length ? (
              accountRows.map((card) => (
                <div key={card.id} className="px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{card.nickname}</p>
                  <p className="text-xs text-muted-foreground">{card.issuer} •••• {card.mask}</p>
                  <p className="text-xs text-muted-foreground">{formatLastSynced(card)}</p>
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
            {verified && moments.isLoading ? (
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
