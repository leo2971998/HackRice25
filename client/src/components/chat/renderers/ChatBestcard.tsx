import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCardDisplay } from "@/components/cards/CreditCardDisplay"

export function ChatBestCard({ payload }: { payload: any }) {
    const top = payload?.candidates?.[0]
    if (!top) return null
    return (
        <Card className="rounded-3xl">
            <CardHeader><CardTitle>Best Card</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
                {/* If you want to render a real owned card look, pass your row. Here we fake with issuer/name. */}
                <CreditCardDisplay
                    card={{
                        issuer: String(top.display).split(" ")[0] ?? "Card",
                        nickname: top.display,
                        mask: "0000",
                        network: "",
                        status: "Active",
                    } as any}
                />
                <div><b>{top.display}</b></div>
                <div>Estimated reward: ${Number(top.est_reward_usd).toFixed(2)} ({(Number(top.effective_rate) * 100).toFixed(1)}%)</div>
                <ul className="list-disc pl-5">
                    {top.reasons?.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
            </CardContent>
        </Card>
    )
}
