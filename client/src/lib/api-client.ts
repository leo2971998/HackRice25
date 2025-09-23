// src/lib/api-client.ts
type TokenGetter = () => Promise<string | null> | string | null

let tokenGetter: TokenGetter | null = null

export function registerTokenGetter(getter: TokenGetter) {
    tokenGetter = getter
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "")

function makeUrl(path: string) {
    if (/^https?:\/\//i.test(path)) return path
    return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`
}

async function getToken(): Promise<string | null> {
    try {
        const v = tokenGetter?.()
        return v instanceof Promise ? await v : (v ?? null)
    } catch {
        return null
    }
}

export type ApiError = Error & {
    status?: number
    body?: unknown
}

function buildError(status: number, body: unknown, fallbackMsg?: string): ApiError {
    const msg =
        (typeof body === "object" && body && "message" in body && typeof (body as any).message === "string"
            ? (body as any).message
            : typeof body === "string"
                ? body
                : fallbackMsg) || `Request failed with status ${status}`

    const err = new Error(msg) as ApiError
    err.status = status
    err.body = body
    return err
}

export async function apiFetch<T = unknown>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const url = makeUrl(path)

    const headers = new Headers(options.headers || {})
    const hasBody = options.body != null

    if (hasBody && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json")
    }

    const token = await getToken()
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`)
    }

    const resp = await fetch(url, {
        method: options.method ?? (hasBody ? "POST" : "GET"),
        credentials: options.credentials ?? "include",
        ...options,
        headers,
    })

    const text = await resp.text()
    let data: any = undefined
    try {
        data = text ? JSON.parse(text) : undefined
    } catch {
        data = text
    }

    if (!resp.ok) {
        throw buildError(resp.status, data, resp.statusText)
    }

    return data as T
}
