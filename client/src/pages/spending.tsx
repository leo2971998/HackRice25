import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Toggle } from "@/components/ui/toggle"
import { PageSection } from "@/components/layout/PageSection"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { categorySummaries, merchants } from "@/lib/mock-data"
import type { Merchant } from "@/types/api"

const spendingTabs = [
  { id: "categories", label: "Categories" },
  { id: "merchants", label: "Merchants" },
]

export function SpendingPage() {
  const [activeTab, setActiveTab] = React.useState<(typeof spendingTabs)[number]["id"]>("categories")
  const [subscriptionOnly, setSubscriptionOnly] = React.useState(false)
  const [selectedMerchant, setSelectedMerchant] = React.useState<Merchant | null>(null)
  const [open, setOpen] = React.useState(false)

  const filteredMerchants = merchants.filter((merchant) =>
    subscriptionOnly ? merchant.recurring : true
  )

  return (
    <div className="space-y-10">
      <PageSection
        title="Spending insights"
        description="Navigate top categories or merchants, then fine-tune how each transaction is classified."
        actions={
          <Toggle
            pressed={subscriptionOnly}
            onPressedChange={(value) => setSubscriptionOnly(Boolean(value))}
          >
            Recurring only
          </Toggle>
        }
      />

      <div className="flex items-center gap-2 rounded-full border border-border/70 bg-white/60 p-1 shadow-sm dark:bg-zinc-900/60">
        {spendingTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? "rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-soft"
                : "rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "categories" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categorySummaries.map((category) => (
            <Card key={category.id} className="hover-lift space-y-3 rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{category.label}</p>
                <Badge variant="outline">{category.percentage}%</Badge>
              </div>
              <p className="text-3xl font-semibold">${category.amount.toLocaleString()}</p>
              <Button variant="ghost" className="justify-start px-0 text-sm text-primary">
                See merchant details
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Merchants</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-3 font-medium">Merchant</th>
                  <th className="pb-3 font-medium">Current category</th>
                  <th className="pb-3 font-medium">Total</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredMerchants.map((merchant) => (
                  <tr key={merchant.id} className="transition hover:bg-muted/40">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={merchant.logoUrl}
                          alt={merchant.name}
                          className="h-9 w-9 rounded-2xl object-cover"
                        />
                        <div>
                          <p className="font-medium">{merchant.name}</p>
                          <p className="text-xs text-muted-foreground">••••{merchant.id.slice(-4)}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge variant="outline">{merchant.category}</Badge>
                    </td>
                    <td className="font-semibold">${merchant.total.toLocaleString()}</td>
                    <td>
                      {merchant.recurring ? (
                        <Badge variant="success">Recurring</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">One-time</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedMerchant(merchant)
                          setOpen(true)
                        }}
                      >
                        Fix category
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Sheet
        open={open && Boolean(selectedMerchant)}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) {
            setSelectedMerchant(null)
          }
        }}
      >
        <SheetContent side="right" className="w-full max-w-md space-y-6">
          <SheetHeader>
            <SheetTitle>Fix category</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
              <p className="text-sm font-semibold">{selectedMerchant?.name}</p>
              <p className="text-xs text-muted-foreground">Current: {selectedMerchant?.category}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="category-select">
                New category
              </label>
              <Select key={selectedMerchant?.id} defaultValue={selectedMerchant?.category}>
                <SelectTrigger id="category-select">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categorySummaries.map((category) => (
                    <SelectItem key={category.id} value={category.label}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter className="gap-2">
            <Button
              className="w-full"
              onClick={() => {
                setOpen(false)
              }}
            >
              Save changes
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
