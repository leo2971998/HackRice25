import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRecommendations } from "@/hooks/useRecommendations"
import type { SpendDetailCategory } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const currencyFormatterWithCents = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
})

type RecommendationsSectionProps = {
  categories: SpendDetailCategory[]
  total: number
  windowDays: number
  isLoadingDetails?: boolean
  catalogSize?: number
}

export function RecommendationsSection({
  categories,
  total,
  windowDays,
  isLoadingDetails,
  catalogSize,
}: RecommendationsSectionProps) {
  const hasSpend = total > 0 && categories.some((category) => category.amount > 0)
  const monthlySpend = windowDays > 0 ? (total / windowDays) * 30 : total

  const categoryMix = useMemo(() => {
    if (!hasSpend) return null
    const mix: Record<string, number> = {}
    categories.forEach((category) => {
      if (category.amount > 0) {
        mix[category.key] = category.amount
      }
    })
    return mix
  }, [categories, hasSpend])

  const recommendations = useRecommendations({
    window: 90,
    categoryMix,
    monthlySpend,
    includeExplain: true,
    enabled: hasSpend,
  })

  if (isLoadingDetails) {
    return (
      <Card className="rounded-3xl p-0">
        <CardHeader className="p-6 md:p-8 pb-0">
          <CardTitle className="text-lg font-semibold">Card recommendations</CardTitle>
          <CardDescription>We’re analysing your recent spending mix…</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Calculating deterministic rewards…
        </CardContent>
      </Card>
    )
  }

  if (!hasSpend) {
    return (
      <Card className="rounded-3xl p-0">
        <CardHeader className="p-6 md:p-8 pb-0">
          <CardTitle className="text-lg font-semibold">Card recommendations</CardTitle>
          <CardDescription>
            Add some spending data and we’ll score every card in the catalog for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 md:p-8 pt-4 text-sm text-muted-foreground md:text-base">
          <p>
            Once we know how you spend, we can show deterministic annual values, fees, and net rewards for each product. For
            now, browse the {catalogSize ?? 0} cards in the catalog to see what’s available.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (recommendations.isError) {
    return (
      <Card className="rounded-3xl p-0">
        <CardHeader className="p-6 md:p-8 pb-0">
          <CardTitle className="text-lg font-semibold">Card recommendations</CardTitle>
        </CardHeader>
        <CardContent className="p-6 md:p-8 pt-4 text-sm text-muted-foreground">
          Something went wrong while scoring the catalog. Please try again shortly.
        </CardContent>
      </Card>
    )
  }

  const data = recommendations.data
  const cards = data?.cards ?? []

  const topCategories = categories.slice(0, 6)

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl p-0">
        <CardHeader className="p-6 md:p-8 pb-0">
          <CardTitle className="text-lg font-semibold">Based on your recent mix</CardTitle>
          <CardDescription>
            About {currencyFormatter.format(Math.round(monthlySpend))} in monthly spend across your top categories.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 md:p-8 pt-4">
          <div className="grid gap-3">
            {topCategories.map((category) => (
              <div key={category.key} className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground md:text-base">{category.key}</p>
                  <p className="text-xs text-muted-foreground">
                    ≈ {currencyFormatterWithCents.format(category.pct * monthlySpend)} / month
                  </p>
                </div>
                <span className="text-sm font-semibold text-primary md:text-base">
                  {percentFormatter.format(Math.min(Math.max(category.pct, 0), 1))}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {recommendations.isLoading ? (
        <Card className="rounded-3xl p-0">
          <CardHeader className="p-6 md:p-8 pb-0">
            <CardTitle className="text-lg font-semibold">Scoring cards…</CardTitle>
            <CardDescription>Evaluating base rates, bonus categories, and fees.</CardDescription>
          </CardHeader>
          <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            Working through the catalog…
          </CardContent>
        </Card>
      ) : cards.length === 0 ? (
        <Card className="rounded-3xl p-0">
          <CardHeader className="p-6 md:p-8 pb-0">
            <CardTitle className="text-lg font-semibold">No clear winner yet</CardTitle>
          </CardHeader>
          <CardContent className="p-6 md:p-8 pt-4 text-sm text-muted-foreground md:text-base">
            We couldn’t find a strong match with your current mix. Try linking more cards or broadening your spending history.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {data?.explanation ? (
            <Card className="rounded-3xl border border-primary/20 bg-primary/5 p-0">
              <CardHeader className="p-6 md:p-8 pb-0">
                <CardTitle className="text-base font-semibold text-primary">Why these picks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-6 md:p-8 pt-4 text-sm text-primary md:text-base">
                {data.explanation
                  .split(/\n+/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, index) => (
                    <p key={index} className="leading-relaxed">
                      {line.replace(/^[-•\s]+/, "")}
                    </p>
                  ))}
              </CardContent>
            </Card>
          ) : null}

          {cards.map((card, index) => (
            <Card key={card.slug ?? card.id ?? index} className="rounded-3xl p-0">
              <CardHeader className="p-6 md:p-8 pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-semibold text-foreground">
                      #{index + 1} · {card.product_name ?? card.slug ?? "Card"}
                    </CardTitle>
                    <CardDescription>
                      {[card.issuer, card.network].filter(Boolean).join(" • ") || "Card issuer"}
                    </CardDescription>
                  </div>
                  {card.link_url ? (
                    <Button asChild size="sm" className="self-start">
                      <a href={card.link_url} target="_blank" rel="noreferrer">
                        Apply now
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-6 md:p-8 pt-0">
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatBlock label="Est. annual rewards" value={currencyFormatterWithCents.format(card.annual_reward)} />
                  <StatBlock label="Annual fee" value={currencyFormatterWithCents.format(card.annual_fee)} />
                  <StatBlock label="Net yearly value" value={currencyFormatterWithCents.format(card.net)} highlight />
                </div>

                {card.highlights.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground md:text-base">Why it fits</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground md:text-base">
                      {card.highlights.map((highlight, highlightIndex) => (
                        <li key={highlightIndex} className="flex gap-2">
                          <span className="text-primary">•</span>
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground md:text-base">Base everywhere</h4>
                    <p className="text-sm text-muted-foreground md:text-base">
                      {percentFormatter.format(card.base_cashback)} back on all spend — worth
                      {" "}
                      {currencyFormatterWithCents.format(card.breakdown.base.monthly_amount)} each month.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground md:text-base">Bonus categories</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground md:text-base">
                      {card.breakdown.bonuses.length === 0 ? (
                        <li>No additional category boosts.</li>
                      ) : (
                        card.breakdown.bonuses.map((bonus) => (
                          <li key={bonus.category}>
                            {percentFormatter.format(bonus.rate)} on {bonus.category}
                            {bonus.cap_monthly ? ` (up to ${currencyFormatterWithCents.format(bonus.cap_monthly)} / mo)` : ""}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>

                {card.breakdown.welcome && card.breakdown.welcome.value > 0 ? (
                  <div className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:text-base">
                    Intro bonus worth approximately {currencyFormatterWithCents.format(card.breakdown.welcome.value)}
                    {card.breakdown.welcome.min_spend
                      ? ` after ${currencyFormatterWithCents.format(card.breakdown.welcome.min_spend)} in spend`
                      : ""}
                    {card.breakdown.welcome.window_days
                      ? ` within ${card.breakdown.welcome.window_days} days`
                      : ""}
                    .
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

type StatBlockProps = {
  label: string
  value: string
  highlight?: boolean
}

function StatBlock({ label, value, highlight }: StatBlockProps) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm md:text-base ${
        highlight ? "border-primary/40 bg-primary/5 text-primary" : "border-border/60 text-foreground"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold md:text-xl">{value}</p>
    </div>
  )
}

