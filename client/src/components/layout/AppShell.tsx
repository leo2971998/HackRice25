import { NavLink } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import { NAV_LINKS } from "@/routes/links"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "./ThemeToggle"
import { ChatDock } from "./ChatDock"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <NavLink to="/" className="group flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              FF
            </span>
            <div className="flex flex-col leading-tight">
              <span>Flowwise</span>
              <span className="text-xs font-medium text-muted-foreground">Money moments that delight</span>
            </div>
          </NavLink>
          <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-white/70 p-1 text-sm shadow-sm backdrop-blur md:flex dark:bg-zinc-900/60">
            {NAV_LINKS.filter((link) => link.path !== "/welcome").map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="hidden items-center gap-2 sm:flex">
              Link account
              <ChevronRight className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            {user ? (
              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-white/60 px-3 py-1 shadow-sm backdrop-blur dark:bg-zinc-900/60">
                <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full" />
                <div className="hidden text-xs leading-tight sm:block">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-muted-foreground">Pro plan</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="container flex flex-1 gap-10 py-10">
        <aside className="hidden w-60 shrink-0 space-y-6 rounded-3xl border border-border/60 bg-white/70 p-6 shadow-soft backdrop-blur md:block dark:bg-zinc-900/60">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Journey</h3>
            <div className="space-y-1">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-all",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    )
                  }
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 p-5 shadow-card">
            <p className="text-sm font-semibold">Money Moments</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Your highlights refresh daily with AI notes and next steps.
            </p>
          </div>
        </aside>
        <main className="flex-1 space-y-12 pb-24">{children}</main>
      </div>
      <ChatDock />
    </div>
  )
}
