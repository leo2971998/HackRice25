import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ChatInsights({ payload }: { payload: any }) {
    if (!payload) return null
    if (payload.by_category_delta) {
        const items = payload.by_category_delta.slice(0, 5)
        return (
            <Card className="rounded-3xl">
                <CardHeader><CardTitle>What changed</CardTitle></CardHeader>
                <CardContent className="text-sm">
                    <ul className="list-disc pl-5">
                        {items.map((x: any) => (
                            <li key={x.category}><b>{x.category}</b>: Δ ${x.delta.toFixed(2)} (now ${x.now.toFixed(2)} vs {x.prev.toFixed(2)})</li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        )
    }
    if (payload.insights) {
        return (
            <Card className="rounded-3xl">
                <CardHeader><CardTitle>Overspend drivers</CardTitle></CardHeader>
                <CardContent className="text-sm">
                    <ul className="list-disc pl-5">
                        {payload.insights.map((i: any, idx: number) => (
                            <li key={idx}><b>{i.category}</b>: {Math.round(i.share*100)}% of total; ↑ {Math.round(i.growth*100)}%. {i.suggestion}</li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        )
    }
    if (payload.top) {
        return (
            <Card className="rounded-3xl">
                <CardHeader><CardTitle>Top subscriptions (annual)</CardTitle></CardHeader>
                <CardContent className="text-sm">
                    <ul className="list-disc pl-5">
                        {payload.top.map((s: any) => (
                            <li key={s.merchant}><b>{s.merchant}</b>: ${s.annual_usd?.toFixed?.(2)} / yr {s.next_due ? `(next due ${s.next_due})` : ""}</li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        )
    }
    return null
}
