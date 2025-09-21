import { useMemo, useState } from "react"

import { MerchantDetailsTable } from "@/components/details/MerchantDetailsTable"
import { PageSection } from "@/components/layout/PageSection"
import { StatTile } from "@/components/cards/StatTile"
import { TransactionsTable } from "@/components/transactions/TransactionsTable"
import { UpcomingTransactionsTable } from "@/components/transactions/UpcomingTransactionsTable"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useScanRecurring, useSpendDetails, useTransactions, useUpcomingTransactions } from "@/hooks/useApi"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

const WINDOW_OPTIONS = [30, 60, 90]

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat()

type SpendingTab = "transactions" | "merchants" | "upcoming"

const TABS: { id: SpendingTab; label: string }[] = [
  { id: "transactions", label: "Transactions" },
  { id: "merchants", label: "Merchants" },
  { id: "upcoming", label: "Upcoming bills" },
]

export default function SpendingPage() {
  const [windowDays, setWindowDays] = useState<number>(30)
  const [activeTab, setActiveTab] = useState<SpendingTab>("transactions")
  const { toast } = useToast()

  const { data: transactionsData, isLoading: transactionsLoading } = useTransactions({ windowDays })
  const { data: detailData, isLoading: detailsLoading } = useSpendDetails(windowDays)
  const {
    data: upcomingData,
    isLoading: upcomingLoading,
    refetch: refetchUpcoming,
  } = useUpcomingTransactions()

  const { mutate: scanRecurring, isPending: scanPending } = useScanRecurring({
    onSuccess: (data) => {
      refetchUpcoming()
      toast({
        title: "Recurring scan complete",
        description: data ? `Detected ${data.scanned} merchant patterns.` : undefined,
      })
    },
    onError: (error) => {
      toast({
        title: "Scan failed",
        description: error.message,
      })
    },
  })

  const transactions = transactionsData?.transactions ?? []
  const merchants = detailData?.merchants ?? []
  const upcoming = upcomingData?.upcoming ?? []

  const summary = useMemo(() => {
    const totalSpend = transactionsData?.total ?? 0
    const txnCount = transactionsData?.transactionCount ?? 0
    const merchantCount = merchants.length
    const upcomingTotal = upcoming.reduce((sum, item) => sum + (item.amountPredicted ?? 0), 0)

    return {
      totalSpend,
      txnCount,
      merchantCount,
      upcomingTotal,
      upcomingCount: upcoming.length,
    }
  }, [transactionsData, merchants, upcoming])

  const handleWindowChange = (value: string) => {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      setWindowDays(parsed)
    }
  }

  const handleScanRecurring = () => {
    scanRecurring()
  }

  return (
    <div className="space-y-10">
      <PageSection
        title="Spending activity"
        description="Dive into every transaction, see which merchants dominate your budget, and preview upcoming bills before they hit."
        actions={
          <Select value={String(windowDays)} onValueChange={handleWindowChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Window" />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  Last {option} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Window spend"
            value={currencyFormatter.format(summary.totalSpend)}
            caption={`${numberFormatter.format(summary.txnCount)} transactions`}
          />
          <StatTile
            label="Active merchants"
            value={numberFormatter.format(summary.merchantCount)}
            caption="Unique merchants in this window"
          />
          <StatTile
            label="Predicted bills"
            value={currencyFormatter.format(summary.upcomingTotal)}
            caption={`${numberFormatter.format(summary.upcomingCount)} upcoming`}
          />
          <StatTile
            label="View"
            value={TABS.find((tab) => tab.id === activeTab)?.label ?? "Transactions"}
            caption="Switch tabs below to explore"
          />
        </div>
      </PageSection>

      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/70 p-1 text-sm shadow-sm dark:bg-zinc-900/60">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-full px-4 py-1.5 font-medium transition",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === "upcoming" ? (
            <Button onClick={handleScanRecurring} disabled={scanPending} variant="outline">
              {scanPending ? "Scanning…" : "Scan for recurring bills"}
            </Button>
          ) : null}
        </div>

        {activeTab === "transactions" ? (
          <TransactionsTable data={transactions} isLoading={transactionsLoading} />
        ) : null}

        {activeTab === "merchants" ? (
          <MerchantDetailsTable data={merchants} isLoading={detailsLoading} />
        ) : null}

        {activeTab === "upcoming" ? (
          <UpcomingTransactionsTable data={upcoming} isLoading={upcomingLoading || scanPending} />
        ) : null}
      </section>
    </div>
  )
}
