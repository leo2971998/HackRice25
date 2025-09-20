import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CardRow } from "@/types/api"
import { CardRow as CardRowItem } from "./CardRow"

type CardSelectorProps = {
  cards: CardRow[]
  selectedId?: string
  onSelect?: (id: string) => void
  onDelete?: (id: string) => void
  onAdd?: () => void
  isLoading?: boolean
}

export function CardSelector({ cards, selectedId, onSelect, onDelete, onAdd, isLoading }: CardSelectorProps) {
  return (
    <Card className="flex h-full flex-col rounded-3xl">
      <CardHeader className="flex-none space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Your cards</CardTitle>
          {onAdd ? (
            <Button size="sm" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" /> Add card
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden px-0 pb-0">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading cards…</div>
        ) : cards.length ? (
          <div className="flex h-full flex-col gap-2 overflow-auto px-4 pb-4">
            {cards.map((card) => (
              <CardRowItem
                key={card.id}
                card={card}
                isSelected={card.id === selectedId}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <p>No cards yet. Add your first card to get insights.</p>
            {onAdd ? (
              <Button size="sm" variant="secondary" onClick={onAdd}>
                <Plus className="mr-2 h-4 w-4" /> Link a card
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
