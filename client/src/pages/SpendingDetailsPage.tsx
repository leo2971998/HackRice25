import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageSection } from "@/components/layout/PageSection"
import { DonutChart } from "@/components/charts/DonutChart"
import { BreakdownList } from "@/components/BreakdownList"
import { useCategorySummary, useCashbackEstimate, useMerchantBreakdown } from "@/hooks/useApi"

const windowOptions = [30, 90, 180]

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

export function SpendingDetailsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "details">("overview")
  const [windowDays, setWindowDays] = useState(90)
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [searchTerm, setSearchTerm] = useState("")

  const summary = useCategorySummary(windowDays)
  const cashback = useCashbackEstimate({ windowDays })
  const merchantBreakdown = useMerchantBreakdown({
    windowDays,
    category: selectedCategory === "All" ? undefined : selectedCategory,
  })

  const categories = summary.data?.byCategory ?? []
  const others = summary.data?.others
  const merchantRows = merchantBreakdown.data ?? []
  const categoryOptions = useMemo(() => {
    const unique = new Set<string>(["All"])
    categories.forEach((category) => unique.add(category.name))
    merchantRows.forEach((row) => unique.add(row.category))
    return Array.from(unique)
  }, [categories, merchantRows])
  useEffect(() => {
    if (!categoryOptions.includes(selectedCategory)) {
      setSelectedCategory("All")
    }
  }, [categoryOptions, selectedCategory])

  const filteredRows = merchantRows.filter((row) => {
    if (!searchTerm.trim()) return true
    const lower = searchTerm.toLowerCase()
    return (
      row.merchant.toLowerCase().includes(lower) ||
      row.category.toLowerCase().includes(lower) ||
      row.subcategory.toLowerCase().includes(lower)
    )
  })

  return (
    <div className="space-y-10">
      <PageSection
        title="Spending insights"
        description="Dig into where your money is going and see which cards are winning for you."
        actions={
          <Button asChild variant="secondary">
            <Link to="/recommendations">See card recommendations</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        {[
          { id: "overview", label: "Overview" },
          { id: "details", label: "Details" },
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "ghost"}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-6">
          <Card className="rounded-3xl">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg font-semibold">{activeTab === "overview" ? "Category overview" : "Merchant details"}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {windowOptions.map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    variant={option === windowDays ? "default" : "outline"}
                    onClick={() => setWindowDays(option)}
                  >
                    {option}d
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {activeTab === "overview" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center justify-center">
                    <DonutChart
                      data={categories}
                      isLoading={summary.isLoading}
                      emptyMessage="No spending captured for this window."
                    />
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                    <BreakdownList categories={categories} others={others} isLoading={summary.isLoading} />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-border/60 bg-background/90 px-6 py-4 backdrop-blur">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap gap-2">
                        {categoryOptions.map((category) => (
                          <Button
                            key={category}
                            size="sm"
                            variant={selectedCategory === category ? "default" : "outline"}
                            onClick={() => setSelectedCategory(category)}
                          >
                            {category}
                          </Button>
                        ))}
                      </div>
                      <Input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search merchants"
                        className="max-w-xs"
                      />
                    </div>
                  </div>
                  <div className="overflow-auto rounded-2xl border border-border/60">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Merchant</th>
                          <th className="px-4 py-3 font-medium">Category</th>
                          <th className="px-4 py-3 font-medium">Subcategory</th>
                          <th className="px-4 py-3 font-medium">Count</th>
                          <th className="px-4 py-3 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {merchantBreakdown.isLoading ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                              Loading merchants…
                            </td>
                          </tr>
                        ) : filteredRows.length ? (
                          filteredRows.map((merchant) => (
                            <tr key={`${merchant.merchant}-${merchant.subcategory}`} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-medium text-foreground">{merchant.merchant}</td>
                              <td className="px-4 py-3 text-muted-foreground">{merchant.category}</td>
                              <td className="px-4 py-3 text-muted-foreground">{merchant.subcategory}</td>
                              <td className="px-4 py-3 font-medium">{merchant.count}</td>
                              <td className="px-4 py-3 font-semibold">{currencyFormatter.format(merchant.total)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                              No merchants matched your filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-4 space-y-6">
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Rewards spotlight</CardTitle>
              <p className="text-sm text-muted-foreground">Your estimated rewards from the selected window.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {cashback.isLoading ? (
                <p className="text-sm text-muted-foreground">Calculating…</p>
              ) : cashback.data ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated rewards</p>
                    <p className="text-2xl font-semibold text-foreground">
                      {currencyFormatter.format(cashback.data.estimatedRewards)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm">
                    <p className="font-medium text-foreground">Best card</p>
                    <p className="text-muted-foreground">
                      {cashback.data.bestCard
                        ? `${cashback.data.bestCard.name} · ${cashback.data.bestCard.issuer}`
                        : "No standout card yet"}
                    </p>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {cashback.data.byCategory.slice(0, 4).map((entry) => (
                      <div key={entry.category} className="flex justify-between">
                        <span>{entry.category}</span>
                        <span>{currencyFormatter.format(entry.estRewards)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No transactions in this window.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
