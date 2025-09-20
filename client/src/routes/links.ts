import type { LucideIcon } from "lucide-react"
import { CreditCard, Home, PieChart, Settings, Sparkles } from "lucide-react"

type NavLink = {
  label: string
  path: string
  icon: LucideIcon
  description?: string
}

export const NAV_LINKS: NavLink[] = [
  { label: "Home", path: "/", icon: Home },
  { label: "Spending", path: "/spending", icon: PieChart },
  { label: "Recommendations", path: "/recommendations", icon: Sparkles },
  { label: "Cards", path: "/cards", icon: CreditCard },
  { label: "Settings", path: "/settings", icon: Settings },
]

export type { NavLink }
