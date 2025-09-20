import { Card, CardContent } from "@/components/ui/card"

export type MoneyMomentCardProps = {
  title: string
  caption: string
  emoji: string
}

export function MoneyMomentCard({ title, caption, emoji }: MoneyMomentCardProps) {
  return (
    <Card className="hover-lift h-full rounded-3xl bg-white/90 p-4 dark:bg-zinc-900/60">
      <CardContent className="flex h-full flex-col justify-between space-y-4 p-0">
        <div className="text-2xl">{emoji}</div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
      </CardContent>
    </Card>
  )
}
