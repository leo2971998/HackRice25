import * as React from "react"
import { ShieldCheck, Download, Trash2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { PageSection } from "@/components/layout/PageSection"
import { linkedAccounts } from "@/lib/mock-data"

export function SettingsPage() {
  const [privacyMode, setPrivacyMode] = React.useState(false)

  return (
    <div className="space-y-10">
      <PageSection
        title="Account & privacy"
        description="Manage your linked institutions, exports, and privacy controls."
        actions={
          <Toggle pressed={privacyMode} onPressedChange={(value) => setPrivacyMode(Boolean(value))}>
            Privacy mode
          </Toggle>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Linked accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {linkedAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/40 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-foreground">{account.institution}</p>
                  <p className="text-xs text-muted-foreground">•••• {account.mask} · Last sync {account.lastSynced}</p>
                </div>
                <Badge variant={account.status === "Active" ? "success" : "outline"}>{account.status}</Badge>
              </div>
            ))}
            <Button variant="outline" className="w-full">
              Manage connections
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Data controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-2xl border border-border/60 bg-white/80 p-4 dark:bg-zinc-900/60">
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Privacy first</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Flowwise only syncs what’s needed for insights. You can export or delete any time.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" className="flex-1 justify-center gap-2">
                <Download className="h-4 w-4" />
                Export data
              </Button>
              <Button variant="outline" className="flex-1 justify-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Delete data
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Privacy mode is {privacyMode ? "on" : "off"}. Amounts will {privacyMode ? "stay blurred" : "show in full"} during screen shares.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
