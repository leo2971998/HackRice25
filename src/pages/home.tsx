import { Link } from "react-router-dom"
import { ChevronRight, Link2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageSection } from "@/components/layout/PageSection"
import { StatTile } from "@/components/cards/StatTile"
import { CreditCardDisplay } from "@/components/cards/CreditCardDisplay"
import { MoneyMomentCard } from "@/components/cards/MoneyMomentCard"
import { DonutChart } from "@/components/charts/DonutChart"
import { MerchantTable } from "@/components/cards/MerchantTable"
import {
  categorySummaries,
  linkedAccounts,
  merchants,
  moneyMoments,
  statSummaries,
} from "@/lib/mock-data"

export function HomePage() {
  return (
    <div className="space-y-12">
      <PageSection
        title="Welcome back, Avery"
        description="Here’s the pulse on your spend, accounts, and the money moments worth celebrating."
        actions={
          <Button asChild variant="secondary">
            <Link to="/recommendations">Explore recommendations</Link>
          </Button>
        }
      >
        <div className="grid gap-6 md:grid-cols-3">
          {statSummaries.map((stat) => (
            <StatTile key={stat.label} {...stat} />
          ))}
        </div>
      </PageSection>

      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-6 rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Spending by category</CardTitle>
            <p className="text-sm text-muted-foreground">Latest 30 days compared with your plan.</p>
          </CardHeader>
          <CardContent>
            <DonutChart data={categorySummaries} />
          </CardContent>
        </Card>
        <Card className="space-y-6 rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Money Moments</CardTitle>
            <p className="text-sm text-muted-foreground">Little wins and nudges curated by Flow Coach.</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            {moneyMoments.map((moment) => (
              <MoneyMomentCard key={moment.title} {...moment} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <MerchantTable merchants={merchants} />
        <Card className="space-y-6 rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Linked accounts</CardTitle>
            <p className="text-sm text-muted-foreground">Connect all the places your money flows.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {linkedAccounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">{account.institution}</p>
                  <p className="text-xs text-muted-foreground">•••• {account.mask} · Sync {account.lastSynced}</p>
                </div>
                <Badge variant={account.status === "Active" ? "success" : "outline"}>{account.status}</Badge>
              </div>
            ))}
            <Button variant="ghost" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link a new account
              </span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <CreditCardDisplay
              nickname="Evergreen Rewards"
              last4="4321"
              holderName="Avery Johnson"
              issuerText="Evergreen"
              status="Active"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
