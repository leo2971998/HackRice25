import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

export type StatTileProps = {
  label: string
  value: string
  delta?: number
}

export function StatTile({ label, value, delta }: StatTileProps) {
  const DeltaIcon = delta && delta < 0 ? ArrowDownRight : ArrowUpRight
  const formattedDelta = delta ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%` : null

  return (
    <Card className="hover-lift space-y-3 rounded-3xl bg-white/90 p-6 shadow-soft dark:bg-zinc-900/60">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        {formattedDelta ? (
          <Badge variant={delta && delta < 0 ? "outline" : "success"} className="gap-1">
            <DeltaIcon className="h-3.5 w-3.5" />
            {formattedDelta}
          </Badge>
        ) : null}
      </div>
    </Card>
  )
}
