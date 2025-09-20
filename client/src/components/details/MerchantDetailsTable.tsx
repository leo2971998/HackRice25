import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { SpendDetailMerchant } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

export type MerchantDetailsTableProps = {
  data: SpendDetailMerchant[]
  isLoading?: boolean
}

export function MerchantDetailsTable({ data, isLoading }: MerchantDetailsTableProps) {
  const hasData = data.length > 0

  return (
    <Card className="rounded-3xl p-0">
      <CardHeader className="p-6 md:p-8 pb-0">
        <CardTitle className="text-lg font-semibold">Merchants</CardTitle>
        <CardDescription>
          Categories reflect any custom mappings you’ve added (e.g., KFC → dining).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 md:p-8 pt-4">
        {isLoading ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Loading merchant activity…
          </div>
        ) : hasData ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm md:text-base">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
                    <th className="pb-3 pr-4">Merchant</th>
                    <th className="pb-3 pr-4">Category</th>
                    <th className="pb-3 pr-4">Transactions</th>
                    <th className="pb-3">Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.map((row) => (
                    <tr key={`${row.name}-${row.category}`} className="transition hover:bg-muted/40">
                      <td className="py-3 pr-4 text-sm font-semibold text-foreground md:text-base">{row.name}</td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground md:text-base">{row.category}</td>
                      <td className="py-3 pr-4 font-medium">{row.count}</td>
                      <td className="py-3 font-semibold">{currencyFormatter.format(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
            No individual merchants to highlight yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

