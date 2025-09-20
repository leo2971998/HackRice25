import { useState } from "react"
import { CheckCircle, Link as LinkIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { VerifyEmailBanner } from "@/components/banners/VerifyEmailBanner"
import { useMe, useStatus } from "@/hooks/useApi"
import { AddCardDialog } from "@/components/cards/AddCardDialog"

export function SetupPage() {
  const statusQuery = useStatus()
  const meQuery = useMe()
  const verified = statusQuery.data?.emailVerified
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!verified ? <VerifyEmailBanner email={meQuery.data?.email} /> : null}
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-foreground">1. Verify your email</p>
                <p>If you haven’t already, confirm your address so we can enable card linking and insights.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LinkIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-foreground">2. Add your first card</p>
                <p>
                  Once you’re verified, connect the cards you’d like to track. We’ll crunch the numbers and share helpful tips.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setDialogOpen(true)} disabled={!verified}>
              Link a card
            </Button>
            <Button asChild variant="secondary">
              <Link to="/cards">Manage cards</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <AddCardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
