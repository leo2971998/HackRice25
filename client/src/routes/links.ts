import type { LucideIcon } from "lucide-react"
import { Home, Sparkles, Wallet2, MessageCircle, Settings2, Smile } from "lucide-react"

type NavLink = {
  label: string
  path: string
  icon: LucideIcon
  description?: string
}

export const NAV_LINKS: NavLink[] = [
  { label: "Welcome", path: "/welcome", icon: Sparkles },
  { label: "Home", path: "/", icon: Home },
  { label: "Spending", path: "/spending", icon: Wallet2 },
  { label: "Recommendations", path: "/recommendations", icon: Smile },
  { label: "Chat", path: "/chat", icon: MessageCircle },
  { label: "Settings", path: "/settings", icon: Settings2 },
]

export type { NavLink }
