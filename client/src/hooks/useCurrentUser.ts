import { useQuery } from "@tanstack/react-query"
import { useAuth0 } from "@auth0/auth0-react"

import { apiClient } from "@/lib/api-client"
import type { UserProfile } from "@/types/api"
import { authConfig } from "@/lib/env"

export function useCurrentUser() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery({
    queryKey: ["current-user"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const authorizationParams: Record<string, string> = {}
      if (authConfig.audience) {
        authorizationParams.audience = authConfig.audience
      }

      const token = await getAccessTokenSilently({
        authorizationParams,
      })

      return apiClient<UserProfile>("/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    },
  })
}
