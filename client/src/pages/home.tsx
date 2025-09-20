import { ShieldCheck, Sparkles } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageSection } from "@/components/layout/PageSection"

export function HomePage() {
  return (
    <div className="space-y-12">
      <PageSection
        title="Welcome to Swipe Coach"
        description="We’ve connected Auth0 and are ready to plug in your spending data next."
        actions={<Badge variant="success" className="gap-1"><Sparkles className="h-4 w-4" /> Live auth</Badge>}
      />

      <Card className="rounded-3xl border border-border/60 bg-white/70 p-6 shadow-soft backdrop-blur dark:bg-zinc-900/60">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">What’s ready today</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            • Secure Auth0 login protects the dashboard and issues API tokens scoped to
            <span className="font-medium text-foreground"> https://api.hackrice25.com</span>.
          </p>
          <p>• The React app calls <code className="rounded bg-muted px-1 py-0.5 text-xs">GET /api/me</code> after login to provision your profile.</p>
          <p>• MongoDB keeps track of each Auth0 user so future product data can build on a stable identity.</p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border/60 bg-white/70 p-6 shadow-soft backdrop-blur dark:bg-zinc-900/60">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Coming next</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="space-y-2">
              <p className="font-medium text-foreground">Account linking & spend</p>
              <p>
                Plaid and CSV imports are paused for now. As soon as integrations land, this space will unlock real balances,
                category charts, and transaction workflows.
              </p>
            </div>
          </div>
          <p>
            In the meantime, feel free to explore the UI—everything is wired for authenticated API calls once the data layer is ready.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
