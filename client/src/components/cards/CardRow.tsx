import type { KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2 } from "lucide-react"
import type { CardRow as CardRowType } from "@/types/api"

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

    const title = card.nickname || (card as any).productName || "Credit card"

    const issuerNet = [card.issuer, card.network].filter(Boolean).join(" • ")
    const mask = card.mask ? `•••• ${card.mask}` : undefined
    const expires = card.expires ? `Exp ${card.expires}` : undefined
    const creditLimit = (card as any).credit_limit != null ? `$${Number((card as any).credit_limit).toLocaleString()}` : undefined
    const balance = (card as any).balance != null ? `$${Number((card as any).balance).toLocaleString()}` : undefined
    const apr = (card as any).purchase_apr != null ? `${Number((card as any).purchase_apr).toFixed(2)}% APR` : undefined
    const lastSynced = (card as any).lastSynced ? new Date((card as any).lastSynced).toLocaleDateString() : undefined

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(card.id)}
            onKeyDown={handleKeyDown}
            aria-selected={isSelected}
            className={[
                "group flex w-full items-center justify-between gap-4 rounded-2xl border",
                "border-border/70 bg-white/60 p-4 transition hover:bg-muted/60 dark:bg-zinc-900/50",
                isSelected ? "ring-2 ring-primary/70" : "",
            ].join(" ")}
        >
            <div className="min-w-0 flex-1">
                {/* top line: title + status */}
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{title}</span>
                    {issuerNet ? (
                        <span className="truncate text-xs text-muted-foreground">• {issuerNet}</span>
                    ) : null}
                    {card.status ? (
                        card.status.toLowerCase() === "applied" || card.appliedAt ? (
                            <Badge variant="outline" className="border-amber-400/60 bg-amber-100/60 text-[10px] uppercase tracking-wide text-amber-800">
                                Applied
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                                {card.status}
                            </Badge>
                        )
                    ) : null}
                </div>

                {/* details grid */}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3 lg:grid-cols-4">
                    {mask ? <div className="truncate">Number: {mask}</div> : null}
                    {expires ? <div className="truncate">{expires}</div> : null}
                    {creditLimit ? <div className="truncate">Limit: {creditLimit}</div> : null}
                    {balance ? <div className="truncate">Balance: {balance}</div> : null}
                    {apr ? <div className="truncate">{apr}</div> : null}
                    {lastSynced ? <div className="truncate">Synced: {lastSynced}</div> : null}
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