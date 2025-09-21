import { Badge } from "@/components/ui/badge"
import { gradientForIssuer } from "@/utils/brand-gradient"
import { cn } from "@/lib/utils"
import type { CardRow } from "@/types/api"

type CreditCardDisplayProps = {
  card: CardRow
  holderName?: string | null
}

function normalizeSlug(value?: string | null) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export function CreditCardDisplay({ card, holderName }: CreditCardDisplayProps) {
  const needsAttention = card.status === "Needs Attention"
  const issuer = (card.issuer ?? "").toUpperCase()
  const nickname = card.nickname || (card as any).productName || "Your Card"
  const gradient = gradientForIssuer(
    (card as any)?.cardProductId,
    (card as any)?.cardProductSlug,
    (card as any)?.productSlug,
    (card as any)?.productName,
    card.issuer,
    card.network,
    nickname
  )
  const expiryMonth = card.expires ? card.expires.split("-")[1] : undefined
  const expiryYear = card.expires ? card.expires.slice(2, 4) : undefined
  const slug =
    normalizeSlug((card as any)?.cardProductSlug) ||
    normalizeSlug((card as any)?.productSlug) ||
    normalizeSlug((card as any)?.cardProductId) ||
    "—"

  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-card", gradient)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-white/80">{issuer || "CARD ISSUER"}</p>
          <h3 className="text-2xl font-semibold leading-7">{nickname}</h3>
        </div>
        <Badge
          variant={needsAttention ? "outline" : "success"}
          className={cn(
            "border-white/40 bg-white/20 text-white",
            needsAttention && "bg-amber-300/40 text-amber-900"
          )}
        >
          {card.status}
        </Badge>
      </div>
      <div className="mt-10 space-y-3 text-sm">
        <p className="text-white/70">•••• •••• •••• {card.mask || "0000"}</p>
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/80">
          <span>{holderName || "Swipe Coach member"}</span>
          {expiryMonth && expiryYear ? <span>Exp {expiryMonth}/{expiryYear}</span> : null}
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between text-xs text-white/85">
        <span className="tracking-[0.2em] text-white/60">CARD PRODUCT</span>
        <div className="text-right">
          <div className="uppercase tracking-wide text-white/70">Slug</div>
          <div className="text-base font-semibold leading-5 text-white">{slug}</div>
        </div>
      </div>
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
    </div>
  )
}
