const BRAND_ORDER = [
    "amex",
    "chase",
    "cap1",
    "citi",
    "discover",
    "boa",
    "wells",
] as const

export type BrandKey = (typeof BRAND_ORDER)[number] | "default"

type NullableString = string | null | undefined

const GRADIENTS: Record<BrandKey, string> = {
    amex: "from-fuchsia-500 via-purple-500 to-indigo-600",
    chase: "from-sky-500 via-blue-500 to-indigo-600",
    cap1: "from-emerald-500 via-teal-500 to-cyan-600",
    citi: "from-pink-500 via-rose-500 to-red-600",
    discover: "from-orange-500 via-amber-500 to-yellow-600",
    boa: "from-red-500 via-rose-500 to-pink-600",
    wells: "from-red-500 via-rose-500 to-pink-600",
    default: "from-violet-500 via-purple-500 to-fuchsia-600",
}

function sanitize(raw?: NullableString) {
    if (typeof raw !== "string") return ""
    return raw
        .toLowerCase()
        .trim()
        .replace(/[®™]/g, "")
        .replace(/[._]/g, " ")
}

function condensed(value: string) {
    return value.replace(/[^a-z0-9]+/g, "")
}

const BRAND_MATCHERS: Record<Exclude<BrandKey, "default">, (value: string) => boolean> = {
    amex: (value) => /american express|americanexpress|\bamerican\b|\bamex\b/.test(value),
    chase: (value) => /\bchase\b|jp\s*morgan|jpmorgan/.test(value),
    cap1: (value) => /capital\s*one|capitalone|cap\s*one|capone|\bc1\b|\bcap1\b/.test(value),
    citi: (value) => /\bciti\b|citibank/.test(value),
    discover: (value) => /discover/.test(value),
    boa: (value) => /bank\s*of\s*america|bankofamerica|\bboa\b|\bbofa\b/.test(value),
    wells: (value) => /wells\s*fargo|wellsfargo|\bwf\b/.test(value),
}

export function normalizeBrand(raw?: NullableString): BrandKey {
    const sanitized = sanitize(raw)
    if (!sanitized) return "default"
    const condensedValue = condensed(sanitized)
    const haystack = `${sanitized} ${condensedValue}`
    for (const brand of BRAND_ORDER) {
        const matcher = BRAND_MATCHERS[brand]
        if (matcher(haystack)) {
            return brand
        }
    }
    return "default"
}

export function gradientForIssuer(...hints: NullableString[]) {
    for (const hint of hints) {
        if (!hint) continue
        const brand = normalizeBrand(hint)
        if (brand !== "default") {
            return GRADIENTS[brand]
        }
    }
    return GRADIENTS.default
}

export function gradientForBrandKey(key: BrandKey) {
    return GRADIENTS[key] ?? GRADIENTS.default
}
