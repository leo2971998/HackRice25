import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { CardRecommendation } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export type RecommendationCardProps = {
  recommendation: CardRecommendation
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  return (
    <Card className="h-full rounded-3xl border-border/60 bg-white/80 shadow-soft dark:bg-zinc-900/60">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">{recommendation.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{recommendation.issuer}</p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Est. annual value {currencyFormatter.format(recommendation.estAnnualValue)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Why it fits:</p>
        <ul className="space-y-1 list-disc pl-5">
          {recommendation.reasons.slice(0, 3).map((reason, index) => (
            <li key={`${recommendation.cardId}-reason-${index}`}>{reason}</li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled>
          Compare details
        </Button>
        <Button size="sm" disabled>
          Add to wallet
        </Button>
      </CardFooter>
    </Card>
  )
}
