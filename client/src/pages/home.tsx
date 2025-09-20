import { Link } from "react-router-dom";
import { ChevronRight, Link2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSection } from "@/components/layout/PageSection";
import { StatTile } from "@/components/cards/StatTile";
import { CreditCardDisplay } from "@/components/cards/CreditCardDisplay";
import { MoneyMomentCard } from "@/components/cards/MoneyMomentCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { MerchantTable } from "@/components/cards/MerchantTable";
import {
  categorySummaries,
  linkedAccounts,
  merchants,
  moneyMoments,
  statSummaries,
} from "@/lib/mock-data";

export function HomePage() {
  return (
    <div className="container space-y-8 md:space-y-10 lg:space-y-12">
      {/* Hero Section with Stats */}
      <PageSection
        title="Welcome back, Avery"
        description="Here's the pulse on your spend, accounts, and the money moments worth celebrating."
        actions={
          <Button asChild variant="secondary" className="text-sm md:text-base">
            <Link to="/recommendations">
              <span className="hidden md:inline">Explore recommendations</span>
              <span className="md:hidden">Recommendations</span>
            </Link>
          </Button>
        }
      >
        {/* Responsive Stats Grid */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {statSummaries.map((stat) => (
            <StatTile key={stat.label} {...stat} />
          ))}
        </div>
      </PageSection>

      {/* Row 1: Spending Chart + Money Moments */}
      <div className="grid gap-6 md:gap-8 lg:gap-10 grid-cols-1 lg:grid-cols-12">
        {/* Spending by Category */}
        <Card className="overflow-hidden rounded-2xl md:rounded-3xl lg:col-span-7">
          <CardHeader className="px-4 md:px-6 pb-2 space-y-1">
            <CardTitle className="text-base md:text-lg font-semibold">
              Spending by category
            </CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground">
              Latest 30 days compared with your plan.
            </p>
          </CardHeader>
          <CardContent className="px-4 md:px-6">
            <DonutChart data={categorySummaries} />
          </CardContent>
        </Card>

        {/* Money Moments */}
        <Card className="overflow-hidden rounded-2xl md:rounded-3xl lg:col-span-5">
          <CardHeader className="px-4 md:px-6 pb-2 space-y-1">
            <CardTitle className="text-base md:text-lg font-semibold">
              Money Moments
            </CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground">
              Little wins and nudges curated by Flow Coach.
            </p>
          </CardHeader>
          <CardContent className="px-4 md:px-6 grid gap-3 md:gap-4">
            {moneyMoments.map((moment) => (
              <MoneyMomentCard key={moment.title} {...moment} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Merchants + Linked Accounts */}
      <div className="grid gap-6 md:gap-8 lg:gap-10 grid-cols-1 lg:grid-cols-12">
        {/* Merchants */}
        <Card className="overflow-hidden rounded-2xl md:rounded-3xl lg:col-span-7">
          <CardHeader className="px-4 md:px-6 pb-2 space-y-1">
            <CardTitle className="text-base md:text-lg font-semibold">
              Top merchants
            </CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground">
              Where your money went recently.
            </p>
          </CardHeader>
          <CardContent className="px-0 md:px-2">
            <div className="overflow-x-auto px-4 md:px-4">
              <MerchantTable merchants={merchants} />
            </div>
          </CardContent>
        </Card>

        {/* Linked Accounts */}
        <Card className="overflow-hidden rounded-2xl md:rounded-3xl lg:col-span-5">
          <CardHeader className="px-4 md:px-6 pb-2 space-y-1">
            <CardTitle className="text-base md:text-lg font-semibold">
              Linked accounts
            </CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground">
              Connect all the places your money flows.
            </p>
          </CardHeader>
          <CardContent className="px-4 md:px-6 space-y-3 md:space-y-4">
            {linkedAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-xl md:rounded-2xl border px-3 md:px-4 py-2.5 md:py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm md:text-base truncate">
                    {account.institution}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    •••• {account.mask} ·{" "}
                    <span className="hidden sm:inline">
                      Sync {account.lastSynced}
                    </span>
                    <span className="sm:hidden">{account.lastSynced}</span>
                  </p>
                </div>
                <Badge
                  variant={account.status === "Active" ? "success" : "outline"}
                  className="text-xs shrink-0 ml-2"
                >
                  {account.status}
                </Badge>
              </div>
            ))}

            <Button
              variant="ghost"
              className="w-full justify-between text-sm md:text-base py-2 md:py-2.5"
            >
              <span className="flex items-center gap-2">
                <Link2 className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Link a new account</span>
                <span className="sm:hidden">Link account</span>
              </span>
              <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
            </Button>

            <div className="pt-2">
              <CreditCardDisplay
                nickname="Evergreen Rewards"
                last4="4321"
                holderName="Avery Johnson"
                issuerText="Evergreen"
                status="Active"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
