import { Badge } from "@/components/ui/badge"
import { gradientForIssuer } from "@/utils/brand-gradient"
import { cn } from "@/lib/utils"
import type { CardRow } from "@/types/api"

type CreditCardDisplayProps = {
  card: CardRow
  holderName?: string | null
  showSlug?: boolean
}

function normalizeSlug(value?: string | null) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export function CreditCardDisplay({ card, showSlug = false }: Props) {
    const gradient = gradientForIssuer(
        (card as any)?.cardProductSlug,
        (card as any)?.productSlug,
        card.issuer,
        (card as any)?.productName,
        card.network,
    )

    const issuer = (card.issuer ?? "").toUpperCase()
    const name = (card as any)?.productName ?? card.nickname ?? "Your Card"
    const last4 = (card.mask ?? "").slice(-4) || "0000"

    // If you kept a slug variable before, you can keep it but only render it when showSlug is true
    const slug =
        (typeof (card as any)?.cardProductSlug === "string" && (card as any).cardProductSlug.trim()) ||
        (typeof (card as any)?.productSlug === "string" && (card as any).productSlug.trim()) ||
        null

    const justify = showSlug ? "justify-between" : "justify-start"

    return (
        <div className="relative overflow-hidden rounded-3xl">
            <div className={`relative h-44 w-full rounded-3xl bg-gradient-to-br ${gradient} p-5 text-white`}>
                <div className="pointer-events-none absolute -left-1/4 -top-1/2 h-[220%] w-[150%] rotate-12 bg-white/10 blur-2xl" />
                <div className="relative flex h-full flex-col">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-semibold tracking-[0.18em] opacity-90">
                            {issuer || "CARD ISSUER"}
                        </div>
                        {(card.status || "").length ? (
                            <div className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-semibold">
                                {card.status}
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-1 text-xl font-semibold leading-6 line-clamp-2">{name}</div>

                    <div className={`mt-auto flex items-end ${justify} text-xs`}>
                        <div className="space-x-2 opacity-90">
                            <span>•••• •••• •••• {last4}</span>
                            <span className="hidden sm:inline">SWIPE COACH MEMBER</span>
                        </div>

                        {/* ↓ Hide this whole block when showSlug is false */}
                        {showSlug && slug ? (
                            <div className="text-right opacity-90">
                                <div className="uppercase tracking-wide">Slug</div>
                                <div className="font-semibold">{slug}</div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            <div className="absolute inset-0 -z-10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)]" />
        </div>
    )
}
