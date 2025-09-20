import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MerchantBreakdownRow } from "@/types/api"

export type MerchantTableProps = {
  merchants: MerchantBreakdownRow[]
  isLoading?: boolean
}

export function MerchantTable({ merchants, isLoading }: MerchantTableProps) {
  const hasMerchants = merchants.length > 0

  return (
    <Card className="flex h-full flex-col rounded-3xl">
      <CardHeader className="flex-none">
        <CardTitle className="text-lg font-semibold">Top merchants</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden px-0 pb-0">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading merchants…</div>
        ) : hasMerchants ? (
          <div className="h-full overflow-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 pb-3 font-medium">Merchant</th>
                  <th className="px-4 pb-3 font-medium">Category</th>
                  <th className="px-4 pb-3 font-medium">Visits</th>
                  <th className="px-4 pb-3 font-medium">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {merchants.map((merchant) => (
                  <tr
                    key={`${merchant.merchant}-${merchant.subcategory}`}
                    className="transition hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-sm font-medium text-muted-foreground">
                          {merchant.merchant.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{merchant.merchant}</p>
                          <p className="text-xs text-muted-foreground">Recent activity</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{merchant.category}</td>
                    <td className="px-4 py-3 font-medium">{merchant.count}</td>
                    <td className="px-4 py-3 font-semibold">
                      ${merchant.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
            No recent merchants to show.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
