// client/src/lib/api-client.ts
import { apiConfig } from "@/lib/env"

/**
 * Optional auth token provider (e.g., from Auth0 hook).
 * Call setAccessTokenProvider(() => getAccessTokenSilently()) during app bootstrap.
 */
let tokenGetter: (() => Promise<string | null>) | null = null

export function setAccessTokenProvider(getter: (() => Promise<string | null>) | null) {
    tokenGetter = getter
}

// Alias some code might already import
export const setTokenGetter = setAccessTokenProvider

// Normalize base URL (e.g. http://localhost:8000/api)
const API_BASE_URL = (apiConfig.baseUrl ?? "").replace(/\/$/, "")

/** Build an absolute URL from a path or passthrough absolute URL */
function buildUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path
    const normalizedPath = path.startsWith("/") ? path : `/${path}`
    return `${API_BASE_URL}${normalizedPath}`
}

type Options = RequestInit & { body?: any }

/**
 * Fetch wrapper:
 * - Adds Accept + (auto) Content-Type: application/json
 * - Auto-stringifies plain object bodies
 * - Adds Authorization if tokenGetter is provided
 * - Parses JSON when present, throws Error with server message on failures
 * - Sends credentials by default ("include")
 */
export async function apiFetch<T>(path: string, init: Options = {}): Promise<T> {
    const headers = new Headers(init.headers ?? {})
    headers.set("Accept", "application/json")

    let body = init.body

    // Auto-JSON for plain objects (not FormData / Blob / string)
    const isPlainObject =
        body &&
        typeof body === "object" &&
        !(body instanceof FormData) &&
        !(body instanceof Blob) &&
        !(body instanceof ArrayBuffer)

    if (isPlainObject) {
        if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")
        body = JSON.stringify(body)
    }

    // Attach bearer token if available
    if (tokenGetter) {
        try {
            const token = await tokenGetter()
            if (token) headers.set("Authorization", `Bearer ${token}`)
        } catch {
            // ignore token errors; request can proceed unauthenticated if server allows
        }
    }

    const res = await fetch(buildUrl(path), {
        ...init,
        headers,
        body,
        credentials: init.credentials ?? "include",
    })

    // No content
    if (res.status === 204) return undefined as T

    const contentType = res.headers.get("Content-Type") || ""
    const isJson = contentType.includes("application/json")

    const payload = isJson ? await res.json().catch(() => undefined) : await res.text().catch(() => "")

    if (!res.ok) {
        // Prefer server-provided message
        const msg =
            (isJson && payload && (payload.message || payload.error || payload.detail)) ||
            (typeof payload === "string" && payload) ||
            `Request failed with status ${res.status}`
        throw new Error(String(msg))
    }

    return (isJson ? payload : (undefined as T)) as T
}
