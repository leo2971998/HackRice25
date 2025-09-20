import type { JSX } from "react"

import { Sparkle, Lightbulb, AlertTriangle } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import type { MoneyMoment } from "@/types/api"

const ICON_MAP: Record<MoneyMoment["type"], JSX.Element> = {
  win: <Sparkle className="h-5 w-5" />,
  tip: <Lightbulb className="h-5 w-5" />,
  alert: <AlertTriangle className="h-5 w-5" />,
}

export type MoneyMomentCardProps = {
  moment: MoneyMoment
}

export function MoneyMomentCard({ moment }: MoneyMomentCardProps) {
  return (
    <Card className="hover-lift h-full rounded-3xl bg-white/90 p-5 dark:bg-zinc-900/60 md:p-6">
      <CardContent className="flex h-full flex-col justify-between space-y-4 p-0">
        <div className="flex items-center gap-2 text-primary">{ICON_MAP[moment.type]}</div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground md:text-base">{moment.title}</p>
          <p className="text-xs text-muted-foreground md:text-sm">{moment.body}</p>
        </div>
      </CardContent>
    </Card>
  )
}
