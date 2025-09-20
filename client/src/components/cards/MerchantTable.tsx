import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MerchantRow } from "@/types/api"

export type MerchantTableProps = {
  merchants: MerchantRow[]
  isLoading?: boolean
}

export function MerchantTable({ merchants, isLoading }: MerchantTableProps) {
  const hasMerchants = merchants.length > 0

  return (
    <Card className="flex h-full min-h-[320px] flex-col rounded-3xl p-0">
      <CardHeader className="flex-none p-6 md:p-8 pb-0">
        <CardTitle className="text-lg font-semibold">Top merchants</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-6 md:p-8 pt-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading merchants…</div>
        ) : hasMerchants ? (
          <div className="h-full overflow-auto">
            <table className="w-full min-w-[420px] text-sm md:text-base">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
                  <th className="pb-3 pr-4 font-medium">Merchant</th>
                  <th className="pb-3 pr-4 font-medium">Category</th>
                  <th className="pb-3 pr-4 font-medium">Visits</th>
                  <th className="pb-3 font-medium">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {merchants.map((merchant) => (
                  <tr key={merchant.id} className="transition hover:bg-muted/40">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                          {merchant.logoUrl ? (
                            <img
                              src={merchant.logoUrl}
                              alt={merchant.name}
                              className="h-8 w-8 rounded-2xl object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-sm font-medium text-muted-foreground">
                              {merchant.name.substring(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground md:text-base">{merchant.name}</p>
                          <p className="text-xs text-muted-foreground">Recent activity</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground md:text-base">{merchant.category}</td>
                    <td className="py-3 pr-4 font-medium">{merchant.count}</td>
                    <td className="py-3 font-semibold">
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
