import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageSection } from "@/components/layout/PageSection"
import { RecommendationCard } from "@/components/cards/RecommendationCard"
import { useRecommendations } from "@/hooks/useApi"

export function RecommendationsPage() {
  const recommendations = useRecommendations({ windowDays: 90, topN: 5 })
  const ranked = recommendations.data?.ranked ?? []

  return (
    <div className="space-y-10">
      <PageSection
        title="Smart card matches"
        description="We analysed your recent spend to surface the cards that could return the most value."
        actions={
          <Button asChild variant="secondary">
            <Link to="/spending">Review spending details</Link>
          </Button>
        }
      />

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Top picks</CardTitle>
          <p className="text-sm text-muted-foreground">Ranked by estimated annual value based on the last 90 days.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {recommendations.isLoading ? (
            <div className="col-span-full flex items-center justify-center py-12 text-sm text-muted-foreground">
              Gathering recommendations…
            </div>
          ) : ranked.length ? (
            ranked.map((recommendation) => (
              <RecommendationCard key={recommendation.cardId} recommendation={recommendation} />
            ))
          ) : (
            <div className="col-span-full flex items-center justify-center py-12 text-sm text-muted-foreground text-center">
              We need a bit more spending history to tailor your recommendations.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
