import { useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSpendSummary } from "@/hooks/useApi"
import { useBudgetPreferences } from "@/hooks/useBudgetPreferences"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function daysInMonth(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export function BudgetCard({ cardIds }: { cardIds?: string[] }) {
    const { prefs, setLimit, isLoading: loadingPrefs } = useBudgetPreferences()
    const today = new Date()
    const mtdDays = today.getDate()
    const dim = daysInMonth(today)

    // MTD spend via your existing endpoint
    const summary = useSpendSummary(mtdDays, { cardIds, enabled: true })
    const spendMTD = summary.data?.stats?.totalSpend ?? 0

    // simple “smart” suggestion (3-mo pace if available; fallback to last 30)
    const last90 = useSpendSummary(90, { cardIds, enabled: true })
    const suggested = useMemo(() => {
        const s90 = last90.data?.stats?.totalSpend ?? 0
        const threeMoAvg = (s90 / 90) * 30
        const last30 = summary.data?.stats?.totalSpend ?? 0
        const base = isFinite(threeMoAvg) && threeMoAvg > 0 ? threeMoAvg : last30
        return Math.round(base * 1.05) // +5% buffer
    }, [last90.data, summary.data])

    // pacing
    const projected = mtdDays > 0 ? (spendMTD / mtdDays) * dim : 0
    const limit = prefs.monthly_limit ?? 0
    const pct = limit > 0 ? Math.min(1, spendMTD / limit) : 0
    const over = limit > 0 && projected > limit
    const safePerDay = limit > 0 ? Math.max(0, (limit - spendMTD) / (dim - mtdDays || 1)) : 0

    // local “demo overspend” (UI only)
    const [demoBump, setDemoBump] = useState(0)
    const spendWithDemo = spendMTD + demoBump
    const pctWithDemo = limit > 0 ? Math.min(1, spendWithDemo / limit) : 0

    return (
        <Card className="rounded-3xl">
            <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg font-semibold">Monthly budget</CardTitle>
                <CardDescription>Saved to your profile. No emails, just on-page alerts & pacing.</CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
                {/* Progress */}
                <div className="flex items-center justify-between text-sm">
                    <span>Month-to-date</span>
                    <span className="tabular-nums">
            {money.format(spendWithDemo)}{limit ? ` / ${money.format(limit)}` : ""}
          </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                    <div
                        className={`h-2 rounded-full transition-all ${over || spendWithDemo > limit ? "bg-red-500" : "bg-primary"}`}
                        style={{ width: `${(limit > 0 ? pctWithDemo : 0) * 100}%` }}
                    />
                </div>
                {limit > 0 && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
                        <div>Projected EOM: <span className={over ? "text-red-600 font-medium" : ""}>{money.format(projected)}</span></div>
                        <div>Safe / day left: <span className="font-medium">{money.format(safePerDay)}</span></div>
                        <div>Days passed: <span className="font-medium">{mtdDays}/{dim}</span></div>
                    </div>
                )}

                {/* Set / update budget (persists to /me) */}
                <div className="flex gap-2">
                    <BudgetLimitInput
                        defaultValue={prefs.monthly_limit ?? undefined}
                        onSave={(val) => setLimit(val)}
                        disabled={loadingPrefs}
                    />
                    <Button
                        variant="outline"
                        onClick={() => setLimit(suggested)}
                        disabled={loadingPrefs}
                        title="Use suggested budget based on your recent spend"
                    >
                        Use suggestion ({money.format(suggested)})
                    </Button>
                </div>

                {/* Demo bump – UI only */}
                <div className="pt-1">
                    <Button
                        variant="outline"
                        onClick={() => {
                            if (!limit || limit <= 0) return
                            const bump = Math.max(0, limit - spendMTD) + 5
                            setDemoBump(bump)
                        }}
                        disabled={!limit || limit <= 0}
                    >
                        Demo: add a transaction to go over
                    </Button>
                    {demoBump > 0 && (
                        <Button className="ml-2" variant="ghost" onClick={() => setDemoBump(0)}>
                            Reset demo
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

function BudgetLimitInput({
                              defaultValue,
                              onSave,
                              disabled,
                          }: {
    defaultValue?: number
    onSave: (v: number | null) => void
    disabled?: boolean
}) {
    const [val, setVal] = useState(defaultValue?.toString() ?? "")
    return (
        <>
            <Input
                placeholder={defaultValue ? `Update budget (${defaultValue})` : "Set monthly budget (USD)…"}
                type="number"
                min={0}
                step="0.01"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                disabled={disabled}
            />
            <Button
                onClick={() => {
                    const n = parseFloat(val)
                    onSave(Number.isFinite(n) && n >= 0 ? n : null)
                }}
                disabled={disabled || val === ""}
            >
                {defaultValue != null ? "Update" : "Save"}
            </Button>
        </>
    )
}
