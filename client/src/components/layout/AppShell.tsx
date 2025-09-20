import { NavLink } from "react-router-dom";
import { ChevronRight, Menu, X } from "lucide-react";
import { useState } from "react";

import { NAV_LINKS } from "@/routes/links";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { ChatDock } from "./ChatDock";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4 px-4 sm:px-6">
          {/* Logo - responsive sizing */}
          <NavLink
            to="/"
            className="group flex items-center gap-2 text-base sm:text-lg font-semibold flex-shrink-0"
          >
            <span className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground shadow-soft text-xs sm:text-sm">
              FF
            </span>
            <div className="hidden xs:flex flex-col leading-tight">
              <span className="text-sm sm:text-base">Flowwise</span>
              <span className="text-xs font-medium text-muted-foreground hidden sm:block">
                Money moments that delight
              </span>
            </div>
          </NavLink>

          {/* Desktop Navigation - hidden on mobile */}
          <nav className="hidden lg:flex items-center gap-1 rounded-full border border-border/60 bg-white/70 p-1 text-sm shadow-sm backdrop-blur dark:bg-zinc-900/60">
            {NAV_LINKS.filter((link) => link.path !== "/welcome").map(
              (link) => (
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
              )
            )}
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Link account button - hidden on small screens */}
            <Button
              variant="outline"
              className="hidden md:flex items-center gap-2 text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-2"
            >
              <span className="hidden lg:inline">Link account</span>
              <span className="lg:hidden">Link</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>

            <ThemeToggle />

            {/* User avatar */}
            {user ? (
              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-white/60 px-2 sm:px-3 py-1 shadow-sm backdrop-blur dark:bg-zinc-900/60">
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-6 w-6 sm:h-8 sm:w-8 rounded-full"
                />
                <div className="hidden sm:block text-xs leading-tight">
                  <p className="font-medium truncate max-w-20 lg:max-w-none">
                    {user.name}
                  </p>
                  <p className="text-muted-foreground">Pro plan</p>
                </div>
              </div>
            ) : null}

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden p-1.5"
              onClick={toggleMobileMenu}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-border/60 bg-background/95 backdrop-blur">
            <nav className="container px-4 py-4 space-y-2">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  onClick={closeMobileMenu}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    )
                  }
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </NavLink>
              ))}
              {/* Mobile link account button */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 mt-4"
              >
                Link account
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </div>
        )}
      </header>

      {/* Main content area */}
      <div className="container flex flex-1 gap-6 lg:gap-10 py-6 sm:py-8 lg:py-10 px-4 sm:px-6">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-60 xl:w-64 shrink-0 space-y-6 rounded-3xl border border-border/60 bg-white/70 p-6 shadow-soft backdrop-blur dark:bg-zinc-900/60">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Journey
            </h3>
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

        {/* Main content - responsive spacing and padding */}
        <main className="flex-1 space-y-8 sm:space-y-10 lg:space-y-12 pb-20 sm:pb-24">
          {children}
        </main>
      </div>

      <ChatDock />
    </div>
  );
}
