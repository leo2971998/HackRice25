import { useState } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AddCardDialog } from "@/components/cards/AddCardDialog"
import { useCards } from "@/hooks/useCards"

export default function CardsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const cardsQuery = useCards()
  const totalCards = cardsQuery.data?.length ?? 0
  const cardsLoading = cardsQuery.isLoading

  const linkedText = cardsLoading
    ? "Checking your wallet…"
    : totalCards === 0
      ? "No cards linked yet."
      : `${totalCards} card${totalCards === 1 ? "" : "s"} linked.`

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Add a credit card</CardTitle>
          <CardDescription>
            Connect your go-to cards so we can tailor insights and recommendations. Detailed card management is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">{linkedText}</div>
            <Button onClick={() => setDialogOpen(true)} size="lg">
              Add card
            </Button>
          </div>
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
            We'll surface your cards here next, along with syncing controls and product matches.
          </div>
        </CardContent>
      </Card>
      <AddCardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
