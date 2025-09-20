import { CreditCard, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CardRow as CardRowType } from "@/types/api"

type CardRowProps = {
  card: CardRowType
  isSelected?: boolean
  onSelect?: (id: string) => void
  onDelete?: (id: string) => void
}

export function CardRow({ card, isSelected, onSelect, onDelete }: CardRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(card.id)}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-2xl border border-transparent px-4 py-3 text-left transition",
        isSelected ? "bg-primary/10 text-primary" : "hover:border-border/80 hover:bg-muted/60"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{card.nickname}</p>
          <p className="text-xs text-muted-foreground">
            {card.issuer} •••• {card.mask}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{card.status}</span>
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(card.id)
            }}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Remove card</span>
          </Button>
        ) : null}
      </div>
    </button>
  )
}
