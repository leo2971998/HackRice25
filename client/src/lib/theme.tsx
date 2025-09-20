import * as React from "react"

type Theme = "light" | "dark"

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

function applyTheme(nextTheme: Theme) {
  const root = window.document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(nextTheme)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "light"
    }
    const stored = window.localStorage.getItem("app-theme") as Theme | null
    if (stored === "light" || stored === "dark") {
      return stored
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    return prefersDark ? "dark" : "light"
  })

  React.useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem("app-theme", theme)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const toggleTheme = React.useCallback(() => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"))
  }, [])

  const value = React.useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
