import { useState } from "react"
import { useCards } from "@/hooks/useApi"
import { AddCardDialog } from "@/components/cards/AddCardDialog"

export default function CardsPage() {
  const { data: cards, isLoading, error } = useCards()
  const [open, setOpen] = useState(false)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your Cards</h1>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg px-4 py-2 border hover:bg-gray-50 disabled:opacity-50"
        >
          Add Card
        </button>
      </div>

      {/* Remove “Link”, “Import”, “Debug” boxes — gone */}

      {isLoading && <div>Loading…</div>}
      {error && <div className="text-red-600">Failed to load cards.</div>}

      <ul className="grid gap-4 md:grid-cols-2">
        {(cards ?? []).map((c) => (
          <li key={c._id} className="border rounded-xl p-4">
            <div className="text-sm text-gray-500">{c.issuer}</div>
            <div className="text-lg font-medium">{c.nickname || c.issuer}</div>
            <div className="mt-2">{c.account_mask || `•••• •••• •••• ${c.last4}`}</div>
            {c.expiry_month && c.expiry_year && (
              <div className="text-sm text-gray-500 mt-1">
                Expires {String(c.expiry_month).padStart(2, "0")}/{String(c.expiry_year)}
              </div>
            )}
          </li>
        ))}
      </ul>

      <AddCardDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
