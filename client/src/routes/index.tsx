import { Outlet, useRoutes } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { WelcomePage } from "@/pages/welcome"
import { HomePage } from "@/pages/HomePage"
import CardsPage from "@/pages/CardsPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { SetupPage } from "@/pages/SetupPage"
import { SpendingDetailsPage } from "@/pages/SpendingDetailsPage"
import { RecommendationsPage } from "@/pages/RecommendationsPage"
import { ProtectedRoute } from "@/routes/ProtectedRoute"

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

const routes = [
  {
    path: "/welcome",
    element: (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-primary/10 via-background to-background">
        <div className="container flex flex-1 py-16">
          <WelcomePage />
        </div>
      </div>
    ),
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: "spending", element: <SpendingDetailsPage /> },
      { path: "recommendations", element: <RecommendationsPage /> },
      { path: "cards", element: <CardsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "setup", element: <SetupPage /> },
    ],
  },
]

export function AppRoutes() {
  return useRoutes(routes)
}

export { routes }
