import type { PropsWithChildren } from "react"
import { Auth0Provider } from "@auth0/auth0-react"
import { useNavigate } from "react-router-dom"

import { authConfig } from "@/lib/env"

export function Auth0ProviderWithNavigate({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const redirectUri = window.location.origin
  const authorizationParams: Record<string, string> = {
    redirect_uri: redirectUri,
  }

  if (authConfig.audience) {
    authorizationParams.audience = authConfig.audience
  }

  return (
    <Auth0Provider
      domain={authConfig.domain}
      clientId={authConfig.clientId}
      authorizationParams={authorizationParams}
      onRedirectCallback={(appState) => {
        const target = appState?.returnTo ?? window.location.pathname
        navigate(target, { replace: true })
      }}
      cacheLocation="localstorage"
      useRefreshTokens
    >
      {children}
    </Auth0Provider>
  )
}
