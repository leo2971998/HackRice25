import type { LucideIcon } from "lucide-react";
import { CreditCard, Home, Settings, Clock } from "lucide-react";

type NavLink = {
  label: string;
  path: string;
  icon: LucideIcon;
  description?: string;
};

export const NAV_LINKS: NavLink[] = [
  { label: "Home", path: "/", icon: Home },
  { label: "Cards", path: "/cards", icon: CreditCard },
  { label: "Real Time", path: "/best-card", icon: Clock },
  { label: "Settings", path: "/settings", icon: Settings },
];

export type { NavLink };
