import { useMemo, useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAddCard, useCardCatalog } from "@/hooks/useCards"
import { useToast } from "@/components/ui/use-toast"
import { extractLast4, formatCardNumber } from "@/lib/card-number"

export type AddCardDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const NETWORK_OPTIONS = ["Visa", "Mastercard", "Amex", "Discover"]

export function AddCardDialog({ open, onOpenChange }: AddCardDialogProps) {
    const { toast } = useToast()

    // Load catalog so we can populate issuer + products
    const catalogQuery = useCardCatalog({ active: true })
    const catalog = useMemo(() => {
        const raw = catalogQuery.data as any
        if (Array.isArray(raw)) return raw
        return raw?.items ?? raw?.data ?? raw?.results ?? []
    }, [catalogQuery.data])

    // Build issuer list dynamically (fallback to common issuers if empty)
    const issuerOptions = useMemo(() => {
        const s = new Set<string>()
        ;(catalog ?? []).forEach((p: any) => p?.issuer && s.add(p.issuer))
        const arr = Array.from(s).sort((a, b) => a.localeCompare(b))
        return arr.length
            ? arr
            : ["Amex", "Chase", "Citi", "Capital One", "Bank of America", "Discover", "US Bank", "Wells Fargo", "Synchrony"]
    }, [catalog])

    // Form state
    const [nickname, setNickname] = useState("")
    const [issuer, setIssuer] = useState("")              // step 1
    const [network, setNetwork] = useState("")            // can be auto-filled from product
    const [cardNumber, setCardNumber] = useState("")
    const [expiryMonth, setExpiryMonth] = useState("")
    const [expiryYear, setExpiryYear] = useState("")
    const [selectedSlug, setSelectedSlug] = useState<string>("") // DERIVED from product selection (required)

    // Products filtered by selected issuer
    const filteredProducts = useMemo(() => {
        if (!issuer) return []
        return (catalog ?? []).filter((p: any) => p?.issuer === issuer)
    }, [catalog, issuer])

    // When issuer changes, clear product/slug and (optionally) network
    const handleIssuerChange = (value: string) => {
        setIssuer(value)
        setSelectedSlug("")
        setNetwork("") // reset; will re-fill after product select
    }

    // When product changes, set slug + auto-fill network (editable)
    const handleProductChange = (slug: string) => {
        setSelectedSlug(slug)
        const p = filteredProducts.find((x: any) => x.slug === slug)
        if (p?.network) setNetwork(p.network)
    }

    // Derived validations
    const { last4, isLast4Valid, hasFullCardNumber } = useMemo(() => {
        const digits = cardNumber.replace(/\D+/g, "")
        const last = extractLast4(cardNumber)
        return {
            last4: last,
            isLast4Valid: /^\d{4}$/.test(last),
            hasFullCardNumber: digits.length === 16,
        }
    }, [cardNumber])

    const trimmedMonth = expiryMonth.trim()
    const trimmedYear = expiryYear.trim()
    const monthNumber = Number(trimmedMonth)
    const yearNumber = Number(trimmedYear)
    const hasMonthInput = trimmedMonth.length > 0
    const hasYearInput = trimmedYear.length === 4
    const isValidMonth = hasMonthInput && Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12
    const currentYear = new Date().getFullYear()
    const maxYear = currentYear + 15
    const isValidYear = hasYearInput && Number.isInteger(yearNumber) && yearNumber >= currentYear && yearNumber <= maxYear

    const hasIssuer = issuer.trim().length > 0
    const hasNetwork = network.trim().length > 0
    const hasProduct = !!selectedSlug // REQUIRED

    const canSubmit =
        hasIssuer &&
        hasProduct &&
        hasNetwork &&
        hasFullCardNumber &&
        isLast4Valid &&
        isValidMonth &&
        isValidYear

    const resetForm = () => {
        setNickname("")
        setIssuer("")
        setNetwork("")
        setCardNumber("")
        setExpiryMonth("")
        setExpiryYear("")
        setSelectedSlug("")
    }

    const addCard = useAddCard({
        onSuccess: () => {
            toast({ title: "Card added", description: "We’ll start tracking spend on this card right away." })
            resetForm()
            onOpenChange(false)
        },
        onError: (error) => {
            toast({ title: "Unable to add card", description: error.message || "Please try again in a moment." })
        },
    })

    const handleDialogChange = (nextOpen: boolean) => {
        if (!nextOpen) resetForm()
        onOpenChange(nextOpen)
    }

    return (
        <Dialog open={open} onOpenChange={handleDialogChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>Link a new card</DialogTitle>
                    <DialogDescription>Add your card details. We’ll securely keep only the essentials.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="nickname">Nickname</Label>
                        <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Amex Gold" />
                    </div>

                    {/* Step 1: Issuer (required) */}
                    <div className="grid gap-2">
                        <Label htmlFor="issuer">Issuer</Label>
                        <Select value={issuer || undefined} onValueChange={handleIssuerChange} disabled={catalogQuery.isLoading}>
                            <SelectTrigger id="issuer">
                                <SelectValue placeholder={catalogQuery.isLoading ? "Loading…" : "Select issuer"} />
                            </SelectTrigger>
                            <SelectContent>
                                {issuerOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Step 2: Product (required, filtered by issuer). We display product_name, but we store the slug internally. */}
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="productSlug">Card product (required)</Label>
                            <span className="text-[11px] text-muted-foreground">linked to catalog slug</span>
                        </div>
                        <Select
                            value={selectedSlug || undefined}
                            onValueChange={handleProductChange}
                            disabled={!issuer || filteredProducts.length === 0}
                        >
                            <SelectTrigger id="productSlug">
                                <SelectValue
                                    placeholder={!issuer ? "Select issuer first" : filteredProducts.length ? "Select a product" : "No products for this issuer"}
                                />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                                {filteredProducts.map((p: any) => (
                                    <SelectItem key={p.slug} value={p.slug}>
                                        {p.product_name} — {p.issuer}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Network (auto-filled from product but still editable) */}
                    <div className="grid gap-2">
                        <Label htmlFor="network">Network</Label>
                        <Select value={network || undefined} onValueChange={setNetwork}>
                            <SelectTrigger id="network">
                                <SelectValue placeholder="Select network" />
                            </SelectTrigger>
                            <SelectContent>
                                {NETWORK_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="cardNumber">Card number</Label>
                        <Input
                            id="cardNumber"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="•••• •••• •••• ••••"
                            maxLength={19}
                        />
                        <p className="text-xs text-muted-foreground">
                            We’ll store only the last four digits: {isLast4Valid ? `•••• ${last4}` : "—"}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="expiryMonth">Expiry month</Label>
                            <Input
                                id="expiryMonth"
                                value={expiryMonth}
                                onChange={(e) => setExpiryMonth(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                                placeholder="03"
                                inputMode="numeric"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="expiryYear">Expiry year</Label>
                            <Input
                                id="expiryYear"
                                value={expiryYear}
                                onChange={(e) => setExpiryYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                                placeholder="2029"
                                inputMode="numeric"
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => handleDialogChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() =>
                            addCard.mutate({
                                nickname: nickname.trim() || undefined,
                                issuer: issuer.trim(),
                                network: network.trim(),
                                mask: last4,                       // last 4 only
                                expiry_month: monthNumber,
                                expiry_year: yearNumber,
                                product_slug: selectedSlug,        // REQUIRED — derived from product selection
                                // legacy/back-compat if your API still uses this name:
                                card_product_id: selectedSlug,
                            })
                        }
                        disabled={!canSubmit || addCard.isPending}
                    >
                        {addCard.isPending ? "Adding…" : "Add card"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
