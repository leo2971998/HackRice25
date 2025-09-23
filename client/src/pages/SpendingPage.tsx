import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAccounts, useSpendDetails, useTransactions } from "@/hooks/useApi"

type Tx = {
    id?: string
    _id?: string
    date: string
    merchantName: string
    category?: string
    amount: number
    status?: string
}

type MerchantRow = {
    name: string
    category: string
    amount: number
    count: number
    logoUrl?: string
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

const MERCHANT_OVERRIDES: Record<string, string> = {
    kfc: "KFC",
    heb: "H-E-B",
    chickfila: "Chick-fil-A",
    mcdonalds: "McDonald’s",
    atandt: "AT&T",
}
function titleCaseWords(name?: string) {
    if (!name) return ""
    return name
        .split(/\s+/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ")
}
function formatMerchant(name?: string) {
    if (!name) return ""
    const key = name.toLowerCase()
    if (MERCHANT_OVERRIDES[key]) return MERCHANT_OVERRIDES[key]
    return titleCaseWords(name)
}

const WINDOW_OPTIONS = [30, 60, 90] as const
const PAGE_SIZE_OPTIONS = [5, 10] as const

export default function SpendingPage() {
    const [tab, setTab] = useState<"merchants" | "transactions">("merchants")
    const [windowDays, setWindowDays] = useState<number>(30)

    // NEW: card filter (single card or "all")
    const accounts = useAccounts()
    const cards = accounts.data ?? []
    const [selectedCardId, setSelectedCardId] = useState<string>("all")

    // when cards load the first time, default to first card (or keep "all" if you prefer)
    useEffect(() => {
        if (cards.length && selectedCardId === "all") {
            // if you want default = ALL, comment the next line:
            setSelectedCardId(cards[0].id)
        }
    }, [cards]) // eslint-disable-line react-hooks/exhaustive-deps

    const cardIdsParam = selectedCardId === "all" ? undefined : [selectedCardId]

    const [pageSize, setPageSize] = useState<number>(10)
    const [merchantPage, setMerchantPage] = useState<number>(1)
    const [txPageIndex, setTxPageIndex] = useState<number>(1)

    // reset pagination when filter changes
    useEffect(() => {
        setMerchantPage(1)
        setTxPageIndex(1)
    }, [selectedCardId, windowDays])

    // Fetch with card filter
    const { data: detailData, isLoading: merchantsLoading } = useSpendDetails(windowDays, { cardIds: cardIdsParam })
    const { data: transactionsData, isLoading: txLoading } = useTransactions({ windowDays, cardIds: cardIdsParam })

    // ----- Merchants -----
    const merchantsRaw: MerchantRow[] = detailData?.merchants ?? []
    const merchants = useMemo(() => [...merchantsRaw].sort((a, b) => b.amount - a.amount), [merchantsRaw])

    const merchTotal = merchants.length
    const merchTotalPages = Math.max(1, Math.ceil(merchTotal / pageSize))
    useEffect(() => setMerchantPage(1), [merchTotal, pageSize])
    const merchPageClamped = Math.min(merchantPage, merchTotalPages)
    const merchStartIdx = (merchPageClamped - 1) * pageSize
    const merchEndIdx = Math.min(merchStartIdx + pageSize, merchTotal)
    const merchantsPage = merchants.slice(merchStartIdx, merchEndIdx)

    // ----- Transactions -----
    const txsAll: Tx[] = (transactionsData?.transactions as Tx[]) ?? []
    const txTotal = txsAll.length
    const txTotalPages = Math.max(1, Math.ceil(txTotal / pageSize))
    useEffect(() => setTxPageIndex(1), [txTotal, pageSize])
    const txPageClamped = Math.min(txPageIndex, txTotalPages)
    const txStartIdx = (txPageClamped - 1) * pageSize
    const txEndIdx = Math.min(txStartIdx + pageSize, txTotal)
    const txPage = txsAll.slice(txStartIdx, txEndIdx)

    return (
        <div className="space-y-6">
            {/* Header + controls */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold">Spending</h1>

                <div className="flex items-center gap-2">
                    {/* NEW: Card selector */}
                    <Select value={selectedCardId} onValueChange={setSelectedCardId} disabled={accounts.isLoading}>
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Select card" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All cards</SelectItem>
                            {cards.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.nickname ?? c.issuer ?? "Card"} •••• {c.mask}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Window selector */}
                    <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Window" />
                        </SelectTrigger>
                        <SelectContent>
                            {WINDOW_OPTIONS.map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                    Last {d} days
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Rows per page for BOTH tabs */}
                    <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Rows/page" />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {n} / page
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
                <TabsList className="mb-3">
                    <TabsTrigger value="merchants">Merchants</TabsTrigger>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                </TabsList>

                {/* Merchants tab */}
                <TabsContent value="merchants" className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm opacity-80">
                            {merchTotal === 0 ? "No merchants" : `${merchStartIdx + 1}–${merchEndIdx} of ${merchTotal}`}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMerchantPage((p) => Math.max(1, p - 1))}
                                disabled={merchPageClamped <= 1}
                            >
                                Prev
                            </Button>
                            <span className="text-sm tabular-nums">
                Page {merchPageClamped} / {merchTotalPages}
              </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMerchantPage((p) => Math.min(merchTotalPages, p + 1))}
                                disabled={merchPageClamped >= merchTotalPages}
                            >
                                Next
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border">
                        <table className="min-w-full text-sm">
                            <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">Merchant</th>
                                <th className="text-right p-3">Transactions</th>
                                <th className="text-right p-3">Spend</th>
                                <th className="text-left p-3">Category</th>
                            </tr>
                            </thead>
                            <tbody>
                            {merchantsLoading ? (
                                <tr><td colSpan={4} className="p-4">Loading…</td></tr>
                            ) : merchantsPage.length === 0 ? (
                                <tr><td colSpan={4} className="p-4">No results.</td></tr>
                            ) : (
                                merchantsPage.map((m) => (
                                    <tr key={m.name} className="border-t">
                                        <td className="p-3">{formatMerchant(m.name)}</td>
                                        <td className="p-3 text-right">{m.count}</td>
                                        <td className="p-3 text-right">{currency.format(m.amount)}</td>
                                        <td className="p-3">{m.category || ""}</td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                            {!merchantsLoading && merchantsPage.length > 0 && (
                                <tfoot>
                                <tr className="border-t bg-muted/30">
                                    <td className="p-3 font-medium">Subtotal (page)</td>
                                    <td className="p-3 text-right"></td>
                                    <td className="p-3 text-right font-medium">
                                        {currency.format(merchantsPage.reduce((s, r) => s + (r.amount || 0), 0))}
                                    </td>
                                    <td className="p-3"></td>
                                </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </TabsContent>

                {/* Transactions tab */}
                <TabsContent value="transactions" className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm opacity-80">
                            {txTotal === 0 ? "No transactions" : `${txStartIdx + 1}–${txEndIdx} of ${txTotal}`}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setTxPageIndex((p) => Math.max(1, p - 1))}
                                disabled={txPageClamped <= 1}
                            >
                                Prev
                            </Button>
                            <span className="text-sm tabular-nums">
                Page {txPageClamped} / {txTotalPages}
              </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setTxPageIndex((p) => Math.min(txTotalPages, p + 1))}
                                disabled={txPageClamped >= txTotalPages}
                            >
                                Next
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border">
                        <table className="min-w-full text-sm">
                            <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">Date</th>
                                <th className="text-left p-3">Transaction</th>
                                <th className="text-left p-3">Category</th>
                                <th className="text-right p-3">Amount</th>
                                <th className="text-right p-3">Status</th>
                            </tr>
                            </thead>
                            <tbody>
                            {txLoading ? (
                                <tr><td colSpan={5} className="p-4">Loading…</td></tr>
                            ) : txPage.length === 0 ? (
                                <tr><td colSpan={5} className="p-4">No results.</td></tr>
                            ) : (
                                txPage.map((t, i) => (
                                    <tr key={t.id ?? t._id ?? `${t.date}-${i}`} className="border-t">
                                        <td className="p-3">{new Date(t.date).toLocaleDateString()}</td>
                                        <td className="p-3">{formatMerchant(t.merchantName)}</td>
                                        <td className="p-3">{t.category ?? ""}</td>
                                        <td className="p-3 text-right">{currency.format(Number(t.amount || 0))}</td>
                                        <td className="p-3 text-right capitalize">{t.status ?? ""}</td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
