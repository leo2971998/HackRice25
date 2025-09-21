import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { TransactionRow } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
})

type TransactionsTableProps = {
  data: TransactionRow[]
  isLoading?: boolean
  title?: string
  description?: string
  emptyMessage?: string
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return dateFormatter.format(parsed)
}

function formatAccountName(row: TransactionRow) {
  if (row.accountName) return row.accountName
  if (row.accountId) {
    const last = row.accountId.slice(-4)
    return row.accountId.length > 4 ? `•••• ${last}` : row.accountId
  }
  return "—"
}

export function TransactionsTable({
  data,
  isLoading,
  title = "Recent transactions",
  description = "Every swipe and purchase within the selected window.",
  emptyMessage = "No transactions recorded for this window.",
}: TransactionsTableProps) {
  const hasData = data.length > 0

  return (
    <Card className="rounded-3xl p-0">
      <CardHeader className="p-6 pb-0 md:p-8">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="p-6 pt-4 md:p-8">
        {isLoading ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Loading transactions…
          </div>
        ) : hasData ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm md:text-base">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Merchant</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4">Account</th>
                  <th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.map((row) => {
                  const formattedAmount = currencyFormatter.format(row.amount)
                  const isPending = typeof row.status === "string" && row.status.toLowerCase() === "pending"
                  return (
                    <tr key={row.id} className="align-top transition hover:bg-muted/40">
                      <td className="whitespace-nowrap py-3 pr-4 text-sm text-muted-foreground md:text-base">
                        {formatDate(row.date)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground md:text-base">{row.merchantName}</span>
                            {isPending ? <Badge variant="outline">Pending</Badge> : null}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {row.description && row.description !== row.merchantName
                              ? row.description
                              : formatAccountName(row)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground md:text-base">{row.category}</td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground md:text-base">{formatAccountName(row)}</td>
                      <td className="whitespace-nowrap py-3 text-right text-sm font-semibold text-foreground md:text-base">
                        {formattedAmount}
                      </td>
                    </tr>
                  )
                })}
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
