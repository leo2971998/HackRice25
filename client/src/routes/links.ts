import type { LucideIcon } from "lucide-react"
import { Home } from "lucide-react"

type NavLink = {
  label: string
  path: string
  icon: LucideIcon
  description?: string
}

export const NAV_LINKS: NavLink[] = [{ label: "Home", path: "/", icon: Home }]

export type { NavLink }
