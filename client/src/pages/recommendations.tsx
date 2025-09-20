import * as React from "react"
import { Lightbulb, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Toggle } from "@/components/ui/toggle"
import { PageSection } from "@/components/layout/PageSection"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { recommendations, spendingWindows } from "@/lib/mock-data"
import type { Recommendation, SpendingWindow } from "@/types/api"

export function RecommendationsPage() {
  const [selected, setSelected] = React.useState<Recommendation | null>(null)
  const [open, setOpen] = React.useState(false)
  const [window, setWindow] = React.useState<SpendingWindow>(30)

  return (
    <div className="space-y-10">
      <PageSection
        title="Top card matches"
        description="Based on your last 90 days of spend, here are the upgrades bringing the highest estimated annual value."
        actions={<Badge variant="success" className="gap-1"><Sparkles className="h-3.5 w-3.5" /> Auto refreshed</Badge>}
      />

      <div className="grid gap-6 md:grid-cols-3">
        {recommendations.map((recommendation) => (
          <Card key={recommendation.id} className="hover-lift flex h-full flex-col justify-between rounded-3xl p-6">
            <div className="space-y-4">
              <Badge variant="outline" className="w-fit">+${recommendation.estimatedValue} / yr</Badge>
              <h3 className="text-lg font-semibold">{recommendation.title}</h3>
              <p className="text-sm text-muted-foreground">
                Tuned to your dining, travel, and subscription patterns. Tap for the breakdown.
              </p>
            </div>
            <Button
              variant="ghost"
              className="justify-start px-0 text-sm text-primary"
              onClick={() => {
                setSelected(recommendation)
                setOpen(true)
              }}
            >
              See why
            </Button>
          </Card>
        ))}
      </div>

      <Card className="rounded-3xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Lightbulb className="h-5 w-5 text-primary" />
              What-if simulator
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose a spending window to forecast your cashback and lounge value.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {spendingWindows.map((value) => (
              <Toggle
                key={value}
                pressed={window === value}
                onPressedChange={() => setWindow(value)}
              >
                {value}d
              </Toggle>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl bg-primary/10 p-5 text-sm">
            <p className="text-xs uppercase text-primary/80">Projected cashback</p>
            <p className="mt-2 text-2xl font-semibold">${(window * 4).toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Includes dining + travel boosts</p>
          </div>
          <div className="rounded-3xl bg-emerald-100/60 p-5 text-sm text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100">
            <p className="text-xs uppercase">Lounge passes</p>
            <p className="mt-2 text-2xl font-semibold">{Math.round(window / 10)}</p>
            <p className="mt-1 text-xs text-emerald-900/70 dark:text-emerald-100/80">Nimbus + partner lounges</p>
          </div>
          <div className="rounded-3xl bg-muted/70 p-5 text-sm">
            <p className="text-xs uppercase text-muted-foreground">Annual value</p>
            <p className="mt-2 text-2xl font-semibold">${(window * 6).toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Based on your current trendline</p>
          </div>
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-md space-y-6">
          <SheetHeader>
            <SheetTitle>Why we love this card</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">{selected?.title}</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {selected?.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </div>
          <Button onClick={() => setOpen(false)}>Add to planner</Button>
        </SheetContent>
      </Sheet>
    </div>
  )
}
