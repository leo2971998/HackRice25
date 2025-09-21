import { useEffect, useState } from "react"
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
import { useUpdateCard } from "@/hooks/useCards"
import { useToast } from "@/components/ui/use-toast"
import type { CardRow } from "@/types/api"

export type EditCardDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  card: CardRow | null
}

export function EditCardDialog({ open, onOpenChange, card }: EditCardDialogProps) {
  const { toast } = useToast()
  const [nickname, setNickname] = useState("")
  const [issuer, setIssuer] = useState("")
  const [network, setNetwork] = useState("")
  const [mask, setMask] = useState("")
  const [expiryMonth, setExpiryMonth] = useState("")
  const [expiryYear, setExpiryYear] = useState("")
  
  const updateCard = useUpdateCard({
    onSuccess: () => {
      toast({
        title: "Card updated",
        description: "Your card details have been updated successfully.",
      })
      onOpenChange(false)
    },
    onError: (error) => {
      toast({
        title: "Unable to update card",
        description: error.message || "Please try again in a moment.",
      })
    },
  })

  // Populate form when card data changes
  useEffect(() => {
    if (card) {
      setNickname(card.nickname || "")
      setIssuer(card.issuer || "")
      setNetwork(card.network || "")
      setMask(card.mask || "")
      
      // Parse expiry date if available
      if (card.expires) {
        const [year, month] = card.expires.split("-")
        setExpiryYear(year || "")
        setExpiryMonth(month || "")
      } else {
        setExpiryYear("")
        setExpiryMonth("")
      }
    }
  }, [card])

  const canSubmit =
    nickname.trim() &&
    issuer.trim() &&
    network.trim() &&
    mask.trim().length === 4 &&
    expiryMonth.trim().length === 2 &&
    expiryYear.trim().length === 4

  const handleSubmit = () => {
    if (!card || !canSubmit) return
    
    updateCard.mutate({
      id: card.id,
      payload: {
        nickname: nickname.trim(),
        issuer: issuer.trim(),
        network: network.trim(),
        mask: mask.trim(),
        expiry_month: Number(expiryMonth),
        expiry_year: Number(expiryYear),
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
          <DialogDescription>
            Update your card details and preferences.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-nickname">Nickname</Label>
            <Input 
              id="edit-nickname" 
              value={nickname} 
              onChange={(event) => setNickname(event.target.value)} 
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-issuer">Issuer</Label>
            <Input 
              id="edit-issuer" 
              value={issuer} 
              onChange={(event) => setIssuer(event.target.value)} 
              placeholder="e.g. Chase" 
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-network">Network</Label>
            <Input 
              id="edit-network" 
              value={network} 
              onChange={(event) => setNetwork(event.target.value)} 
              placeholder="Visa" 
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-mask">Last 4 digits</Label>
            <Input 
              id="edit-mask" 
              value={mask} 
              onChange={(event) => setMask(event.target.value.replace(/[^0-9]/g, ""))} 
              maxLength={4} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-expiryMonth">Expiry month</Label>
              <Input
                id="edit-expiryMonth"
                value={expiryMonth}
                onChange={(event) => setExpiryMonth(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                placeholder="03"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-expiryYear">Expiry year</Label>
              <Input
                id="edit-expiryYear"
                value={expiryYear}
                onChange={(event) => setExpiryYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="2029"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || updateCard.isPending}
          >
            {updateCard.isPending ? "Updating…" : "Update card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}