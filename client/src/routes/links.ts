import type { LucideIcon } from "lucide-react";
import { CreditCard, Home, Settings, Clock, PieChart } from "lucide-react";

type NavLink = {
  label: string;
  path: string;
  icon: LucideIcon;
  description?: string;
};

export const NAV_LINKS: NavLink[] = [
  { label: "Home", path: "/", icon: Home },
  { label: "Spending", path: "/spending", icon: PieChart },
  { label: "Cards", path: "/cards", icon: CreditCard },
  { label: "Smart Swipe", path: "/best-card", icon: Clock },
  { label: "Settings", path: "/settings", icon: Settings },
];

export type { NavLink };
