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
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast"
import { apiFetch } from "@/lib/api-client"
import { useQueryClient } from "@tanstack/react-query"

export type ImportCardDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportCardDialog({ open, onOpenChange }: ImportCardDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [cardId, setCardId] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async () => {
    if (!cardId.trim()) return
    
    setIsLoading(true)
    try {
      await apiFetch("/cards/import", {
        method: "POST",
        body: JSON.stringify({ card_id: cardId.trim() }),
      })
      
      // Invalidate cards query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["cards"] })
      
      toast({
        title: "Card imported",
        description: "The card has been successfully linked to your account.",
      })
      
      onOpenChange(false)
      setCardId("")
    } catch (error) {
      toast({
        title: "Unable to import card",
        description: error instanceof Error ? error.message : "Please check the card ID and try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Import existing card</DialogTitle>
          <DialogDescription>
            If you have existing card data in the database, enter the card ID to link it to your account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="cardId">Card ID (MongoDB ObjectId)</Label>
            <Input 
              id="cardId" 
              value={cardId} 
              onChange={(event) => setCardId(event.target.value)} 
              placeholder="e.g. 68ce69b39324d73a6b56b95b"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!cardId.trim() || isLoading}
          >
            {isLoading ? "Importing…" : "Import card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}