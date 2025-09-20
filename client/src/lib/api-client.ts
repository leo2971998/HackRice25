import { apiConfig } from "@/lib/env"

let tokenGetter: (() => Promise<string | null>) | null = null

type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | undefined
}

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

export async function apiFetch<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  const isFormData = init?.body instanceof FormData
  headers.set("Accept", "application/json")
  if (!isFormData) {
    headers.set("Content-Type", "application/json")
  }

  if (tokenGetter) {
    const token = await tokenGetter()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
  }

  const rawBody = init?.body
  let body: BodyInit | undefined
  if (rawBody != null && !isFormData && typeof rawBody !== "string") {
    body = JSON.stringify(rawBody)
  } else {
    body = rawBody as BodyInit | undefined
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    body,
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
