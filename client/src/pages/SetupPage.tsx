import { useState } from "react"
import { CheckCircle, Link as LinkIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAccounts } from "@/hooks/useApi"
import { AddCardDialog } from "@/components/cards/AddCardDialog"

export function SetupPage() {
  const accountsQuery = useAccounts()
  const [dialogOpen, setDialogOpen] = useState(false)

  const hasCards = (accountsQuery.data?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-foreground">1. Set your preferences</p>
                <p>Head over to settings to add your display name and personalise Swipe Coach for you.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LinkIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-foreground">2. Add your first card</p>
                <p>Connect the cards you’d like to track. We’ll crunch the numbers and share helpful tips.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setDialogOpen(true)}>Link a card</Button>
            <Button asChild variant="secondary">
              <Link to="/cards">Manage cards</Link>
            </Button>
          </div>
          {hasCards ? null : (
            <p className="text-xs text-muted-foreground">
              Need a hand? Start by linking a card with the nickname and last four digits.
            </p>
          )}
        </CardContent>
      </Card>
      <AddCardDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
