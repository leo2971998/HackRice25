import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { CardRow } from "@/types/api"

type CreditCardDisplayProps = {
  card: CardRow
  holderName?: string | null
}

const GRADIENTS = [
  "from-indigo-500 via-indigo-400 to-violet-500",
  "from-violet-500 via-fuchsia-500 to-indigo-500",
  "from-emerald-500 via-teal-400 to-cyan-400",
  "from-blue-500 via-sky-400 to-cyan-400",
]

export function CreditCardDisplay({ card, holderName }: CreditCardDisplayProps) {
  const needsAttention = card.status === "Needs Attention"
  const gradient = GRADIENTS[card.nickname.charCodeAt(0) % GRADIENTS.length]
  const expiryMonth = card.expires ? card.expires.split("-")[1] : undefined
  const expiryYear = card.expires ? card.expires.slice(2, 4) : undefined

  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-card", gradient)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-white/80">{card.issuer}</p>
          <h3 className="text-2xl font-semibold">{card.nickname}</h3>
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
        <p className="text-white/70">•••• •••• •••• {card.mask}</p>
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/80">
          <span>{holderName || "Swipe Coach member"}</span>
          {expiryMonth && expiryYear ? <span>Exp {expiryMonth}/{expiryYear}</span> : null}
        </div>
      </div>
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
    </div>
  )
}
