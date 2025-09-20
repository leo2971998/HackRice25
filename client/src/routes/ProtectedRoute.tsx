import type { PropsWithChildren } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth0 } from "@auth0/auth0-react"

export function ProtectedRoute({ children }: PropsWithChildren) {
  const location = useLocation()
  const { isLoading, isAuthenticated } = useAuth0()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading Swipe Coach…
      </div>
    )
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/welcome" state={{ returnTo }} replace />
  }

  return <>{children}</>
}
