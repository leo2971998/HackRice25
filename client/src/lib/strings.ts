export function titleCaseMerchant(name?: string) {
    if (!name) return "";
    return name
        .split(/\s+/)
        .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}

// Optional: force some acronyms if you want perfect brand caps later
export const MERCHANT_OVERRIDES: Record<string, string> = {
    kfc: "KFC",
    heb: "HEB", // or "H-E-B" if you prefer
};
export function formatMerchant(name?: string) {
    if (!name) return "";
    const key = name.toLowerCase();
    if (MERCHANT_OVERRIDES[key]) return MERCHANT_OVERRIDES[key];
    return titleCaseMerchant(name);
}