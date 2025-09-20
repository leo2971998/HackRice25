import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AddCardDialog } from "@/components/cards/AddCardDialog"
import { useCardCatalog, useCards } from "@/hooks/useCards"
import type { CreditCardProduct } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat(undefined, {
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
]

export default function CardsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const cardsQuery = useCards()
  const catalogQuery = useCardCatalog({ active: true })
  const [activeTab, setActiveTab] = useState<CardsTab>("linked")

  const totalCards = cardsQuery.data?.length ?? 0
  const cardsLoading = cardsQuery.isLoading

  const linkedText = cardsLoading
    ? "Checking your wallet…"
    : totalCards === 0
      ? "No cards linked yet."
      : `${totalCards} card${totalCards === 1 ? "" : "s"} linked.`

  const catalogCards = catalogQuery.data ?? []

  const issuers = useMemo(() => {
    const values = new Set<string>()
    catalogCards.forEach((card) => {
      if (card.issuer) {
        values.add(card.issuer)
      }
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [catalogCards])

  const categories = useMemo(() => {
    const values = new Set<string>()
    catalogCards.forEach((card) => {
      card.rewards.forEach((reward) => {
        if (reward.category) {
          values.add(reward.category)
        }
      })
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [catalogCards])

  const [issuerFilter, setIssuerFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [annualFeeFilter, setAnnualFeeFilter] = useState<string>("all")

  const filteredCatalog = useMemo(() => {
    return catalogCards.filter((card) => {
      const matchesIssuer = issuerFilter === "all" || card.issuer === issuerFilter
      const matchesCategory =
        categoryFilter === "all" || card.rewards.some((reward) => reward.category === categoryFilter)
      const matchesFee = matchesAnnualFee(card.annual_fee, annualFeeFilter)
      return matchesIssuer && matchesCategory && matchesFee
    })
  }, [catalogCards, issuerFilter, categoryFilter, annualFeeFilter])

  const linkedContent = (
    <Card className="rounded-3xl p-0">
      <CardHeader className="p-6 md:p-8 pb-0">
        <CardTitle className="text-xl font-semibold">Add a credit card</CardTitle>
        <CardDescription>
          Connect your go-to cards so we can tailor insights and recommendations. Detailed card management is coming soon.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6 md:p-8 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">{linkedText}</div>
          <Button onClick={() => setDialogOpen(true)} size="lg">
            Add card
          </Button>
        </div>
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
          We’ll surface your cards here next, along with syncing controls and product matches.
        </div>
      </CardContent>
    </Card>
  )

  const catalogContent = (
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
            <Select value={annualFeeFilter} onValueChange={setAnnualFeeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Annual fee" />
              </SelectTrigger>
              <SelectContent>
                {ANNUAL_FEE_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            <CatalogCard key={card.slug} card={card} />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 rounded-full border border-border/60 bg-white/80 p-1 text-sm shadow-sm backdrop-blur dark:bg-zinc-900/60">
          {TABS.map((tab) => {
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

      {activeTab === "linked" ? linkedContent : catalogContent}

      <AddCardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

function matchesAnnualFee(fee: number, filter: string) {
  if (filter === "all") return true
  if (filter === "0") return fee === 0
  if (filter === "low") return fee > 0 && fee < 100
  if (filter === "mid") return fee >= 100 && fee < 200
  if (filter === "high") return fee >= 200
  return true
}

type CatalogCardProps = {
  card: CreditCardProduct
}

function CatalogCard({ card }: CatalogCardProps) {
  const topRewards = card.rewards.slice(0, 3)
  const welcome = card.welcome_offer

  return (
    <Card className="rounded-3xl p-0">
      <CardHeader className="space-y-1 p-6 md:p-8 pb-4">
        <CardTitle className="text-xl font-semibold text-foreground">{card.product_name}</CardTitle>
        <CardDescription>{[card.issuer, card.network].filter(Boolean).join(" • ")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6 md:p-8 pt-0 text-sm md:text-base">
        <div className="grid gap-2 sm:grid-cols-3">
          <DetailBlock label="Annual fee" value={currencyFormatter.format(card.annual_fee)} />
          <DetailBlock label="Base rate" value={percentFormatter.format(card.base_cashback)} />
          <DetailBlock
            label="Foreign Tx fee"
            value={card.foreign_tx_fee ? currencyFormatter.format(card.foreign_tx_fee) : "$0"}
          />
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground md:text-base">Bonus categories</h4>
          {topRewards.length === 0 ? (
            <p className="text-sm text-muted-foreground md:text-base">No published category boosts.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topRewards.map((reward) => (
                <Badge key={reward.category} variant="secondary" className="rounded-full px-3 py-1 text-xs md:text-sm">
                  {reward.category}: {percentFormatter.format(reward.rate)}
                  {reward.cap_monthly ? ` up to ${currencyFormatter.format(reward.cap_monthly)} / mo` : ""}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {welcome && (welcome.bonus_value_usd || welcome.min_spend) ? (
          <div className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:text-base">
            Welcome offer worth approximately {currencyFormatter.format(welcome.bonus_value_usd ?? 0)}
            {welcome.min_spend ? ` after ${currencyFormatter.format(welcome.min_spend)} in spend` : ""}
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

type DetailBlockProps = {
  label: string
  value: string
}

function DetailBlock({ label, value }: DetailBlockProps) {
  return (
    <div className="rounded-2xl border border-border/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground md:text-base">{value}</p>
    </div>
  )
}

