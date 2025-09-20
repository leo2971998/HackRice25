import { apiConfig } from "@/lib/env"

let tokenGetter: (() => Promise<string | null>) | null = null

export function setAccessTokenProvider(getter: (() => Promise<string | null>) | null) {
  tokenGetter = getter
}

export const setTokenGetter = setAccessTokenProvider

const API_BASE_URL = apiConfig.baseUrl?.replace(/\/$/, "") ?? ""

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  headers.set("Accept", "application/json")
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  if (tokenGetter) {
    const token = await tokenGetter()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
    credentials: init?.credentials ?? "include",
  })

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get("Content-Type")
  const hasJson = contentType?.includes("application/json")
  if (!response.ok) {
    const message = hasJson ? await response.json().catch(() => undefined) : await response.text()
    const errorMessage = typeof message === "string" ? message : message?.message
    throw new Error(errorMessage || `Request failed with status ${response.status}`)
  }

  if (!hasJson) {
    return undefined as T
  }

  return (await response.json()) as T
}
