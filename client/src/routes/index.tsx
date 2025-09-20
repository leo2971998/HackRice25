import { Outlet, useRoutes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { WelcomePage } from "@/pages/welcome";
import { HomePage } from "@/pages/home";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import CardsPage from "@/pages/Cards";

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
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
    children: [{ index: true, element: <HomePage /> }],
  },
  {
    path: "/cards",
    element: (
      <ProtectedRoute>
        <CardsPage />
      </ProtectedRoute>
    ),
  },
];

export function AppRoutes() {
  return useRoutes(routes);
}

export { routes };
