import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { UpcomingTransaction } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
})

type UpcomingTransactionsTableProps = {
  data: UpcomingTransaction[]
  isLoading?: boolean
  emptyMessage?: string
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return dateFormatter.format(parsed)
}

function formatConfidence(value?: number | null) {
  if (typeof value !== "number") return "—"
  const pct = Math.max(0, Math.min(1, value))
  return `${Math.round(pct * 100)}%`
}

export function UpcomingTransactionsTable({ data, isLoading, emptyMessage = "No predicted bills yet." }: UpcomingTransactionsTableProps) {
  const hasData = data.length > 0

  return (
    <Card className="rounded-3xl p-0">
      <CardHeader className="p-6 pb-0 md:p-8">
        <CardTitle className="text-lg font-semibold">Upcoming bills</CardTitle>
        <CardDescription>Predicted from your recent recurring activity.</CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-4 md:p-8">
        {isLoading ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Crunching predictions…
          </div>
        ) : hasData ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm md:text-base">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
                  <th className="pb-3 pr-4">Merchant</th>
                  <th className="pb-3 pr-4">Expected</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Confidence</th>
                  <th className="pb-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.map((item) => (
                  <tr key={item.id} className="transition hover:bg-muted/40">
                    <td className="py-3 pr-4 text-sm font-semibold text-foreground md:text-base">
                      {item.merchantName ?? "Merchant"}
                    </td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground md:text-base">{formatDate(item.expectedAt)}</td>
                    <td className="py-3 pr-4 font-semibold">
                      {item.amountPredicted != null ? currencyFormatter.format(item.amountPredicted) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground md:text-base">{formatConfidence(item.confidence)}</td>
                    <td className="py-3 text-sm text-muted-foreground md:text-base">{item.explain ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
