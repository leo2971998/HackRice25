import { MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Merchant } from "@/types/api"

export type MerchantTableProps = {
  merchants: Merchant[]
}

export function MerchantTable({ merchants }: MerchantTableProps) {
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Top merchants</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="pb-3 font-medium">Merchant</th>
              <th className="pb-3 font-medium">Category</th>
              <th className="pb-3 font-medium">Total</th>
              <th className="pb-3 font-medium">Recurring</th>
              <th className="pb-3 font-medium" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {merchants.map((merchant) => (
              <tr key={merchant.id} className="transition hover:bg-muted/40">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <img
                        src={merchant.logoUrl}
                        alt={merchant.name}
                        className="h-8 w-8 rounded-2xl object-cover"
                      />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{merchant.name}</p>
                      <p className="text-xs text-muted-foreground">ID ••••{merchant.id.slice(-4)}</p>
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
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">More options</span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
