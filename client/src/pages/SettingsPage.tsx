import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/Label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAccounts, useMe, useResendVerification, useStatus, useUpdateMe } from "@/hooks/useApi"
import { useDeleteCard } from "@/hooks/useCards"
import { useToast } from "@/components/ui/use-toast"
import type { Preferences } from "@/types/api"

const TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "America/Denver",
]

const CURRENCIES = [
  { code: "USD", label: "US Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "EUR", label: "Euro" },
]

export function SettingsPage() {
  const { toast } = useToast()
  const meQuery = useMe()
  const statusQuery = useStatus()
  const accountsQuery = useAccounts()
  const deleteCard = useDeleteCard({
    onSuccess: () => {
      toast({
        title: "Card removed",
        description: "We’ll update your settings shortly.",
      })
    },
    onError: (error) => {
      toast({
        title: "Unable to remove card",
        description: error.message,
      })
    },
  })
  const resendVerification = useResendVerification({
    onSuccess: () => {
      toast({
        title: "Verification email sent",
        description: "Check your inbox for a fresh link.",
      })
    },
    onError: (error) => {
      toast({
        title: "Unable to send email",
        description: error.message,
      })
    },
  })

  const updateMe = useUpdateMe({
    onSuccess: () => {
      toast({
        title: "Saved",
        description: "Your preferences were updated.",
      })
    },
    onError: (error) => {
      toast({
        title: "Could not save",
        description: error.message,
      })
    },
  })

  const me = meQuery.data
  const status = statusQuery.data
  const verified = status?.emailVerified
  const accounts = accountsQuery.data ?? []

  const [name, setName] = useState("")
  const [preferences, setPreferences] = useState<Preferences | null>(null)

  useEffect(() => {
    if (me) {
      setName(me.name ?? "")
      setPreferences(me.preferences)
    }
  }, [me])

  const handlePrefChange = (updater: (prefs: Preferences) => Preferences) => {
    setPreferences((current) => (current ? updater(current) : current))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!preferences) return
    updateMe.mutate({
      name: name.trim() || undefined,
      preferences,
    })
  }

  const blurAmounts = preferences?.privacy.blurAmounts ?? false
  const notifications = preferences?.notifications ?? { monthly_summary: true, new_recommendation: true }

  const timezoneOptions = useMemo(() => TIMEZONES, [])

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={me?.email ?? ""} disabled readOnly />
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className={verified ? "text-emerald-600" : "text-amber-600"}>
              {verified ? "Email verified" : "Email not yet verified"}
            </span>
            {!verified ? (
              <Button type="button" size="sm" variant="outline" onClick={() => resendVerification.mutate()}>
                Resend verification
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Time zone</Label>
              <Select
                value={preferences?.timezone}
                onValueChange={(value) =>
                  handlePrefChange((prefs) => ({ ...prefs, timezone: value }))
                }
              >
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select time zone" />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={preferences?.currency}
                onValueChange={(value) =>
                  handlePrefChange((prefs) => ({ ...prefs, currency: value }))
                }
              >
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Select
                value={preferences?.theme}
                onValueChange={(value: Preferences["theme"]) =>
                  handlePrefChange((prefs) => ({ ...prefs, theme: value }))
                }
              >
                <SelectTrigger id="theme">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Hide amounts</p>
                <p className="text-xs text-muted-foreground">Blur sensitive numbers until you choose to reveal them.</p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={blurAmounts}
                onChange={(event) =>
                  handlePrefChange((prefs) => ({
                    ...prefs,
                    privacy: { ...prefs.privacy, blurAmounts: event.target.checked },
                  }))
                }
              />
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
              <p className="text-sm font-semibold">Notifications</p>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notifications.monthly_summary}
                    onChange={(event) =>
                      handlePrefChange((prefs) => ({
                        ...prefs,
                        notifications: {
                          ...prefs.notifications,
                          monthly_summary: event.target.checked,
                        },
                      }))
                    }
                  />
                  Monthly summary emails
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notifications.new_recommendation}
                    onChange={(event) =>
                      handlePrefChange((prefs) => ({
                        ...prefs,
                        notifications: {
                          ...prefs.notifications,
                          new_recommendation: event.target.checked,
                        },
                      }))
                    }
                  />
                  New recommendation alerts
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Connected cards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accountsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading linked cards…</div>
          ) : accounts.length ? (
            accounts.map((card) => (
              <div
                key={card.id}
                className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{card.nickname}</p>
                  <p className="text-xs text-muted-foreground">{card.issuer} •••• {card.mask}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => deleteCard.mutate(card.id)}
                  disabled={deleteCard.isPending}
                >
                  Remove
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No cards connected yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={updateMe.isPending || !preferences}>
          {updateMe.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}
