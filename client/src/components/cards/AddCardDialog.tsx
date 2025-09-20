import { useState } from "react"
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
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAddCard } from "@/hooks/useCards"
import { useToast } from "@/components/ui/use-toast"
import { extractLast4, formatCardNumber } from "@/lib/card-number"

export type AddCardDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ISSUER_OPTIONS = [
  "Amex",
  "Chase",
  "Citi",
  "Capital One",
  "Bank of America",
  "Discover",
  "US Bank",
  "Wells Fargo",
  "Synchrony",
]

const NETWORK_OPTIONS = ["Visa", "Mastercard", "Amex", "Discover"]

export function AddCardDialog({ open, onOpenChange }: AddCardDialogProps) {
  const { toast } = useToast()
  const [nickname, setNickname] = useState("")
  const [issuer, setIssuer] = useState("")
  const [network, setNetwork] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [expiryMonth, setExpiryMonth] = useState("")
  const [expiryYear, setExpiryYear] = useState("")
  const [productId, setProductId] = useState("")
  const resetForm = () => {
    setNickname("")
    setIssuer("")
    setNetwork("")
    setCardNumber("")
    setExpiryMonth("")
    setExpiryYear("")
    setProductId("")
  }
  const addCard = useAddCard({
    onSuccess: () => {
      toast({
        title: "Card added",
        description: "We’ll start tracking spend on this card right away.",
      })
      resetForm()
      onOpenChange(false)
    },
    onError: (error) => {
      toast({
        title: "Unable to add card",
        description: error.message || "Please try again in a moment.",
      })
    },
  })

  const digitsOnly = cardNumber.replace(/\D+/g, "")
  const last4 = extractLast4(cardNumber)
  const isLast4Valid = /^\d{4}$/.test(last4)
  const hasFullCardNumber = digitsOnly.length === 16
  const hasIssuer = issuer.trim().length > 0
  const hasNetwork = network.trim().length > 0
  const trimmedMonth = expiryMonth.trim()
  const trimmedYear = expiryYear.trim()
  const monthNumber = Number(trimmedMonth)
  const yearNumber = Number(trimmedYear)
  const hasMonthInput = trimmedMonth.length > 0
  const hasYearInput = trimmedYear.length === 4
  const isValidMonth =
    hasMonthInput && Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12
  const currentYear = new Date().getFullYear()
  const maxYear = currentYear + 15
  const isValidYear =
    hasYearInput && Number.isInteger(yearNumber) && yearNumber >= currentYear && yearNumber <= maxYear

  const canSubmit =
    hasIssuer &&
    hasNetwork &&
    hasFullCardNumber &&
    isLast4Valid &&
    isValidMonth &&
    isValidYear

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Link a new card</DialogTitle>
          <DialogDescription>
            Add your card details. We’ll securely keep only the essentials.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issuer">Issuer</Label>
            <Select value={issuer || undefined} onValueChange={setIssuer}>
              <SelectTrigger id="issuer">
                <SelectValue placeholder="Select issuer" />
              </SelectTrigger>
              <SelectContent>
                {ISSUER_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
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
                onChange={(event) => setExpiryMonth(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                placeholder="03"
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiryYear">Expiry year</Label>
              <Input
                id="expiryYear"
                value={expiryYear}
                onChange={(event) => setExpiryYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="2029"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="productId">Card product (optional)</Label>
            <Input
              id="productId"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              placeholder="cc_prod_platinum"
            />
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
                mask: last4,
                expiry_month: monthNumber,
                expiry_year: yearNumber,
                card_product_id: productId.trim() || undefined,
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
