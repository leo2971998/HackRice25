import { Outlet, useRoutes } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { WelcomePage } from "@/pages/welcome"
import { HomePage } from "@/pages/home"
import { SpendingPage } from "@/pages/spending"
import { RecommendationsPage } from "@/pages/recommendations"
import { ChatPage } from "@/pages/chat"
import { SettingsPage } from "@/pages/settings"

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
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "spending", element: <SpendingPage /> },
      { path: "recommendations", element: <RecommendationsPage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]

export function AppRoutes() {
  return useRoutes(routes)
}

export { routes }
