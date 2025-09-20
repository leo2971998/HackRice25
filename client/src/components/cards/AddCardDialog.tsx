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
import { useAddCard } from "@/hooks/useCards"
import { useToast } from "@/components/ui/use-toast"

export type AddCardDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddCardDialog({ open, onOpenChange }: AddCardDialogProps) {
  const { toast } = useToast()
  const [nickname, setNickname] = useState("")
  const [issuer, setIssuer] = useState("")
  const [network, setNetwork] = useState("")
  const [mask, setMask] = useState("")
  const [expiryMonth, setExpiryMonth] = useState("")
  const [expiryYear, setExpiryYear] = useState("")
  const [productId, setProductId] = useState("")
  const addCard = useAddCard({
    onSuccess: () => {
      toast({
        title: "Card added",
        description: "We’ll start tracking spend on this card right away.",
      })
      onOpenChange(false)
      setNickname("")
      setIssuer("")
      setNetwork("")
      setMask("")
      setExpiryMonth("")
      setExpiryYear("")
      setProductId("")
    },
    onError: (error) => {
      toast({
        title: "Unable to add card",
        description: error.message || "Please try again in a moment.",
      })
    },
  })

  const canSubmit =
    nickname.trim() &&
    issuer.trim() &&
    network.trim() &&
    mask.trim().length === 4 &&
    expiryMonth.trim().length === 2 &&
    expiryYear.trim().length === 4

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Link a new card</DialogTitle>
          <DialogDescription>
            Add the nickname and last four digits to keep your wallet organised.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issuer">Issuer</Label>
            <Input id="issuer" value={issuer} onChange={(event) => setIssuer(event.target.value)} placeholder="e.g. Chase" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="network">Network</Label>
            <Input id="network" value={network} onChange={(event) => setNetwork(event.target.value)} placeholder="Visa" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mask">Last 4 digits</Label>
            <Input id="mask" value={mask} onChange={(event) => setMask(event.target.value.replace(/[^0-9]/g, ""))} maxLength={4} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="expiryMonth">Expiry month</Label>
              <Input
                id="expiryMonth"
                value={expiryMonth}
                onChange={(event) => setExpiryMonth(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                placeholder="03"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiryYear">Expiry year</Label>
              <Input
                id="expiryYear"
                value={expiryYear}
                onChange={(event) => setExpiryYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="2029"
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              addCard.mutate({
                nickname: nickname.trim(),
                issuer: issuer.trim(),
                network: network.trim(),
                mask: mask.trim(),
                expiry_month: Number(expiryMonth),
                expiry_year: Number(expiryYear),
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
