// client/src/lib/auth0-provider.tsx
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react"
import { authConfig } from "@/lib/env"
import { registerTokenGetter } from "@/lib/api-client"

function TokenBridge() {
    const { getAccessTokenSilently } = useAuth0()

    // Register synchronously so queries have a token on first run
    registerTokenGetter(async () => {
        const audience = authConfig.audience?.trim()
        if (audience) {
            // Auth0 React SDK v2 signature
            return await getAccessTokenSilently({
                authorizationParams: { audience },
            })
        }
        // No audience (e.g., DISABLE_AUTH=1 local), just get an OIDC token
        return await getAccessTokenSilently()
    })

    return null
}

export function Auth0ProviderWithNavigate({ children }: { children?: ReactNode }) {
    const navigate = useNavigate()
    const audience = authConfig.audience?.trim()

    return (
        <Auth0Provider
            domain={authConfig.domain}
            clientId={authConfig.clientId}
            authorizationParams={{
                redirect_uri: window.location.origin,
                scope: "openid profile email",
                ...(audience ? { audience } : {}), // only include when present
            }}
            cacheLocation="localstorage"
            useRefreshTokens
            useRefreshTokensFallback
            onRedirectCallback={(appState) => {
                const to = appState?.returnTo || window.location.pathname
                navigate(to)
            }}
        >
            <TokenBridge />
            {children}
        </Auth0Provider>
    )
}
