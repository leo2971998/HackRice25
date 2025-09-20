import CardRow from "@/components/cards/CardRow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CardRow as CardRowType } from "@/types/api"

type Props = {
    cards: CardRowType[]
    selectedId?: string
    onSelect: (id: string) => void
    onDelete?: (id: string) => void
    onEdit?: (id: string) => void
    onAdd?: () => void
    isLoading?: boolean
    heightClass?: string
}

export function CardSelector({
                                 cards,
                                 selectedId,
                                 onSelect,
                                 onDelete,
                                 onEdit,
                                 onAdd,
                                 isLoading,
                                 heightClass = "max-h-[760px]", // bumped taller default
                             }: Props) {
    return (
        <Card className="rounded-3xl">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg font-semibold">Your cards</CardTitle>
                    {onAdd ? (
                        <Button size="sm" onClick={onAdd}>
                            Add card
                        </Button>
                    ) : null}
                </div>
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-3">
                {isLoading ? (
                    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                        Loading cards…
                    </div>
                ) : cards.length === 0 ? (
                    <div className="space-y-3 text-sm text-muted-foreground">
                        <p>No cards linked yet.</p>
                        {onAdd ? (
                            <div>
                                <Button onClick={onAdd}>Link a card</Button>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className={`flex flex-col gap-2 overflow-y-auto pr-1 ${heightClass}`}>
                        {cards.map((c) => (
                            <CardRow
                                key={c.id}
                                card={c}
                                isSelected={c.id === selectedId}
                                onSelect={onSelect}
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
