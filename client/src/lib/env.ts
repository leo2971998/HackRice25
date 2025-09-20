const rawDisableAuth = (import.meta.env.VITE_DISABLE_AUTH ?? "0").toString().toLowerCase()
const disableAuth = ["1", "true", "yes"].includes(rawDisableAuth)

const domain = import.meta.env.VITE_AUTH0_DOMAIN ?? ""
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID ?? ""
const audience = import.meta.env.VITE_AUTH0_AUDIENCE ?? ""
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api"

if (!disableAuth) {
  if (!domain) {
    throw new Error("VITE_AUTH0_DOMAIN is required")
  }

  if (!clientId) {
    throw new Error("VITE_AUTH0_CLIENT_ID is required")
  }
}

export const authConfig = {
  domain,
  clientId,
  audience,
  disableAuth,
}

export const apiConfig = {
  baseUrl: apiBaseUrl,
}
