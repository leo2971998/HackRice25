import { useEffect } from "react"
import type { PropsWithChildren } from "react"
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react"
import { useNavigate } from "react-router-dom"

import { authConfig } from "@/lib/env"
import { setAccessTokenProvider } from "@/lib/apiClient"

function TokenBridge() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  useEffect(() => {
    const authorizationParams: Record<string, string> = {}
    if (authConfig.audience) {
      authorizationParams.audience = authConfig.audience
    }

    setAccessTokenProvider(async () => {
      if (!isAuthenticated) {
        return null
      }
      return getAccessTokenSilently({ authorizationParams })
    })

    return () => {
      setAccessTokenProvider(async () => null)
    }
  }, [getAccessTokenSilently, isAuthenticated])

  return null
}

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
      <TokenBridge />
      {children}
    </Auth0Provider>
  )
}
