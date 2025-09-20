// Minimal, dependency-free API client. Uses an injected token getter.
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

let tokenProvider: null | (() => Promise<string | null>) = null
export function setAccessTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers || {})
  headers.set("Content-Type", "application/json")

  const token = tokenProvider ? await tokenProvider() : null
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
  })

  if (!res.ok) {
    const msg = await res.text().catch(() => "")
    throw new ApiError(msg || res.statusText, res.status)
  }
  // Some endpoints might return 204
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}
