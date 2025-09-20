import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { SpendDetailCategory } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
})

export type DetailsTableProps = {
  data: SpendDetailCategory[]
  total: number
  windowDays: number
  transactionCount: number
  isLoading?: boolean
}

export function DetailsTable({ data, total, windowDays, transactionCount, isLoading }: DetailsTableProps) {
  const hasData = data.length > 0 && total > 0

  return (
    <Card className="rounded-3xl p-0">
      <CardHeader className="p-6 md:p-8 pb-0">
        <CardTitle className="text-lg font-semibold">Category breakdown</CardTitle>
        <CardDescription>
          Showing the last {windowDays} days. Totals match your overview donut.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 md:p-8 pt-4">
        {isLoading ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Crunching the numbers…
          </div>
        ) : hasData ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm md:text-base">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
                    <th className="pb-3 pr-4">Category</th>
                    <th className="pb-3 pr-4">Spend</th>
                    <th className="pb-3 pr-4">Transactions</th>
                    <th className="pb-3">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.map((row) => (
                    <tr key={row.key} className="transition hover:bg-muted/40">
                      <td className="py-3 pr-4 text-sm font-semibold text-foreground md:text-base">{row.key}</td>
                      <td className="py-3 pr-4 font-semibold">
                        {currencyFormatter.format(row.amount)}
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground md:text-base">{row.count}</td>
                      <td className="py-3 font-semibold text-primary">
                        {percentFormatter.format(Math.min(Math.max(row.pct, 0), 1))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:text-base">
              Tracking {transactionCount.toLocaleString()} transactions ·
              {" "}
              {currencyFormatter.format(total)} total spend.
            </div>
          </div>
        ) : (
          <div className="flex h-[240px] flex-col items-center justify-center space-y-2 text-center text-sm text-muted-foreground">
            <p>No transactions yet in this window.</p>
            <p>Once spending starts flowing in, you’ll see a detailed category breakdown here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

