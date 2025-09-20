import { useEffect, useMemo, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DonutChart } from "@/components/charts/DonutChart"
import { StatTile } from "@/components/cards/StatTile"
import { CardSelector } from "@/components/cards/CardSelector"
import { CreditCardDisplay } from "@/components/cards/CreditCardDisplay"
import { AddCardDialog } from "@/components/cards/AddCardDialog"
import { EditCardDialog } from "@/components/cards/EditCardDialog"
import { ImportCardDialog } from "@/components/cards/ImportCardDialog"
import { useCards, useCard, useDeleteCard } from "@/hooks/useCards"
import { useToast } from "@/components/ui/use-toast"
import { apiFetch } from "@/lib/api-client"
import type { CardRow } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
})

export default function CardsPage() {
    const { toast } = useToast()
    const cardsQuery = useCards()
    const cards = cardsQuery.data ?? []
    const [selectedId, setSelectedId] = useState<string | undefined>()
    const cardDetails = useCard(selectedId)
    const deleteCard = useDeleteCard({
        onSuccess: () => {
            toast({
                title: "Card removed",
                description: "We’ll tidy up your stats.",
            })
        },
        onError: (error) => {
            toast({
                title: "Unable to remove card",
                description: error.message,
            })
        },
    })

    useEffect(() => {
        if (!cards.length) {
            setSelectedId(undefined)
            return
        }
        if (!selectedId || !cards.some((card) => card.id === selectedId)) {
            setSelectedId(cards[0].id)
        }
    }, [cards, selectedId])

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [importDialogOpen, setImportDialogOpen] = useState(false)
    const [editingCard, setEditingCard] = useState<CardRow | null>(null)
    const [debugInfo, setDebugInfo] = useState<any>(null)
    const [showDebug, setShowDebug] = useState(false)
    const summary = cardDetails.data?.summary
    const donutData = useMemo(() => summary?.byCategory ?? [], [summary])

    const handleDelete = (id: string) => {
        deleteCard.mutate(id)
    }

    const handleEdit = (id: string) => {
        const card = cards.find(c => c.id === id)
        if (card) {
            setEditingCard(card)
            setEditDialogOpen(true)
        }
    }

    const handleDebug = async () => {
        try {
            const result = await apiFetch("/cards/debug")
            setDebugInfo(result)
            setShowDebug(true)
        } catch (error) {
            toast({
                title: "Debug failed",
                description: error instanceof Error ? error.message : "Unable to fetch debug info",
            })
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-6 md:flex-row">
                <div className="md:w-1/3 space-y-4">
                    <CardSelector
                        cards={cards}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                        onAdd={() => setDialogOpen(true)}
                        isLoading={cardsQuery.isLoading}
                    />
                </div>
                <div className="md:w-2/3 space-y-4">
                    {cardDetails.isLoading ? (
                        <Card className="rounded-3xl">
                            <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                                Loading card details…
                            </CardContent>
                        </Card>
                    ) : cardDetails.data ? (
                        <>
                            <CreditCardDisplay card={cardDetails.data} />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <StatTile label="30-day spend" value={currencyFormatter.format(summary?.spend ?? 0)} />
                                <StatTile label="Transactions" value={summary?.txns.toLocaleString() ?? "0"} />
                                <StatTile
                                    label="Status"
                                    value={cardDetails.data.status}
                                    caption={cardDetails.data.lastSynced ? `Synced ${new Date(cardDetails.data.lastSynced).toLocaleDateString()}` : undefined}
                                />
                            </div>
                            <Card className="rounded-3xl">
                                <CardHeader>
                                    <CardTitle className="text-lg font-semibold">Category breakdown</CardTitle>
                                </CardHeader>
                                <CardContent className="h-64 p-0">
                                    <DonutChart data={donutData} isLoading={cardDetails.isLoading} emptyMessage="No spending yet in the last 30 days." />
                                </CardContent>
                            </Card>
                            {cardDetails.data.features?.length ? (
                                <Card className="rounded-3xl">
                                    <CardHeader>
                                        <CardTitle className="text-lg font-semibold">
                                            {cardDetails.data.productName ?? "Card benefits"}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                                            {cardDetails.data.features.map((feature) => (
                                                <li key={feature}>{feature}</li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            ) : null}
                        </>
                    ) : cards.length ? (
                        <Card className="rounded-3xl">
                            <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                                Select a card to see its details.
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="rounded-3xl">
                            <CardHeader>
                                <CardTitle className="text-lg font-semibold">No cards yet</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-muted-foreground">
                                <p>Add your first card to unlock tailored coaching and spend insights.</p>
                                <div className="flex flex-col gap-2">
                                    <Button onClick={() => setDialogOpen(true)}>
                                        Link a card
                                    </Button>
                                    <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                                        Import existing card
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={handleDebug}>
                                        Debug card data
                                    </Button>
                                </div>
                                {showDebug && debugInfo && (
                                    <div className="mt-4 p-3 bg-muted rounded-md text-xs">
                                        <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
            <AddCardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            <EditCardDialog
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                card={editingCard}
            />
            <ImportCardDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
            />
        </div>
    )
}