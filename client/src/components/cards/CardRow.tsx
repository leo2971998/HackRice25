import type { KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"
import type { CardRow as CardRowType } from "@/types/api" // avoid name clash with component

type Props = {
    card: CardRowType
    isSelected?: boolean
    onSelect: (id: string) => void
    onEdit?: (id: string) => void
    onDelete?: (id: string) => void
}

export default function CardRow({ card, isSelected = false, onSelect, onEdit, onDelete }: Props) {
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect(card.id)
        }
    }

    const title =
        card.nickname ||
        [card.issuer, card.network].filter(Boolean).join(" ") ||
        "Credit card"

    const mask = card.mask ? `•••• ${card.mask}` : "•••• •••• •••• ••••"
    const expires = card.expires ? `Exp ${card.expires}` : undefined

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(card.id)}
            onKeyDown={handleKeyDown}
            aria-selected={isSelected}
            className={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl border",
                "border-border/70 bg-white/60 p-3 transition hover:bg-muted/60 dark:bg-zinc-900/50",
                isSelected ? "ring-2 ring-primary/70" : "",
            ].join(" ")}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{title}</span>
                    {card.status ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {card.status}
            </span>
                    ) : null}
                </div>
                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {mask}
                    {expires ? <span className="ml-2">• {expires}</span> : null}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                {onEdit ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation()
                            onEdit(card.id)
                        }}
                        aria-label="Edit card"
                        title="Edit card"
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                ) : null}

                {onDelete ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation()
                            onDelete(card.id)
                        }}
                        aria-label="Remove card"
                        title="Remove card"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                ) : null}
            </div>
        </div>
    )
}
