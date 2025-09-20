import { NavLink } from "react-router-dom"
import { LogOut } from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"

import { NAV_LINKS } from "@/routes/links"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "./ThemeToggle"
import { useAuthWiring, useMe } from "@/hooks/useApi"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth0()
  const { data: me } = useMe()
  useAuthWiring()

  const displayName = me?.name?.trim() || user?.name || (me?.email ? me.email.split("@")[0] : "Swipe Coach member")
  const displayEmail = me?.email ?? user?.email
  const avatarUrl = user?.picture
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <NavLink to="/" className="group flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              SC
            </span>
            <div className="flex flex-col leading-tight">
              <span>Swipe Coach</span>
              <span className="text-xs font-medium text-muted-foreground">Personalised card coaching</span>
            </div>
          </NavLink>
          <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-white/70 p-1 text-sm shadow-sm backdrop-blur md:flex dark:bg-zinc-900/60">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 transition-all",
                    isActive ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              className="hidden items-center gap-2 sm:flex"
              onClick={() =>
                logout({
                  logoutParams: { returnTo: window.location.origin },
                })
              }
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="container flex-1 space-y-8 pb-16 pt-10">
        <section className="rounded-3xl border border-border/60 bg-white/70 p-6 shadow-soft backdrop-blur dark:bg-zinc-900/60">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Signed in as</p>
              <p className="text-xl font-semibold text-foreground">{displayName}</p>
              {displayEmail ? <p className="text-sm text-muted-foreground">{displayEmail}</p> : null}
            </div>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-14 w-14 rounded-full border border-border/60 object-cover" />
            ) : null}
          </div>
        </section>
        <div className="space-y-8">{children}</div>
      </main>
    </div>
  )
}
