import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MandateAttachment } from "@/types/api"

const STATUS_COPY: Record<MandateAttachment["status"], { label: string; variant: "outline" | "secondary" | "success" }> = {
    pending_approval: { label: "Awaiting approval", variant: "outline" },
    approved: { label: "Approved", variant: "secondary" },
    executed: { label: "Completed", variant: "success" },
    declined: { label: "Declined", variant: "outline" },
}

const STATUS_FOOTER: Record<MandateAttachment["status"], string> = {
    pending_approval: "Approve to continue or decline to skip this action.",
    approved: "Approved! Flow Coach will handle the next steps shortly.",
    executed: "All set. We’ve updated your linked cards.",
    declined: "Declined. Flow Coach will drop this request.",
}

type MandateCardProps = {
    mandate: MandateAttachment
    onApprove: () => void
    onDecline: () => void
    isProcessing?: boolean
}

export function MandateCard({ mandate, onApprove, onDecline, isProcessing = false }: MandateCardProps) {
    const { status } = mandate
    const statusInfo = STATUS_COPY[status]
    const context = mandate.context ?? {}
    const data = mandate.data ?? {}

    const productName =
        (context.productName as string) ||
        (data.product_name as string) ||
        (data.productName as string) ||
        "this card"
    const issuer = (context.issuer as string) || (data.issuer as string) || "the issuer"
    const description =
        (context.description as string) ||
        `Flow Coach will submit the ${productName} application with ${issuer} once you approve.`

    return (
        <Card className="w-full rounded-3xl border border-primary/30 bg-white/95 p-5 shadow-soft dark:bg-zinc-900/80">
            <CardHeader className="space-y-3 p-0">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
                        <CardTitle className="text-base font-semibold">Approve {productName}</CardTitle>
                    </div>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0 pt-3 text-sm">
                {status === "pending_approval" ? (
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={onApprove} disabled={isProcessing}>
                            {isProcessing ? "Working…" : "Approve"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={onDecline} disabled={isProcessing}>
                            Decline
                        </Button>
                    </div>
                ) : null}
                <p className="text-xs text-muted-foreground">{STATUS_FOOTER[status]}</p>
            </CardContent>
        </Card>
    )
}

export default MandateCard
