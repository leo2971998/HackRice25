import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type CreditCardDisplayProps = {
  nickname: string
  last4: string
  holderName: string
  issuerText: string
  status: "Active" | "Reconnect"
  theme?: "indigo" | "violet" | "emerald"
}

const gradientMap: Record<NonNullable<CreditCardDisplayProps["theme"]>, string> = {
  indigo: "from-indigo-500 via-indigo-400 to-violet-500",
  violet: "from-violet-500 via-fuchsia-500 to-indigo-500",
  emerald: "from-emerald-500 via-teal-400 to-cyan-400",
}

export function CreditCardDisplay({
  nickname,
  last4,
  holderName,
  issuerText,
  status,
  theme = "indigo",
}: CreditCardDisplayProps) {
  return (
    <div
      className={cn(
        "hover-lift relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-card",
        gradientMap[theme]
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/80">{issuerText}</p>
          <h3 className="mt-2 text-2xl font-semibold">{nickname}</h3>
        </div>
        <Badge variant="success" className={cn("border-white/30 bg-white/20 text-white", status === "Reconnect" && "bg-amber-400/30")}> 
          {status}
        </Badge>
      </div>
      <div className="mt-10 space-y-2 text-sm">
        <p className="text-white/70">•••• •••• •••• {last4}</p>
        <p className="text-lg font-semibold uppercase tracking-wide text-white">{holderName}</p>
      </div>
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
    </div>
  )
}
