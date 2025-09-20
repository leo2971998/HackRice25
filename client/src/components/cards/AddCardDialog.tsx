import { useEffect, useMemo, useState } from "react"
import { useAddCard } from "@/hooks/useApi"

const ISSUERS = [
  "American Express",
  "Chase",
  "Citi",
  "Capital One",
  "Discover",
  "Bank of America",
  "Wells Fargo",
  "Barclays",
  "US Bank",
  "Synchrony",
  "Other",
]

function luhnCheck(num: string): boolean {
  // digits only
  const s = num.replace(/\D/g, "")
  if (s.length < 12 || s.length > 19) return false
  let sum = 0,
    dbl = false
  for (let i = s.length - 1; i >= 0; i--) {
    let n = Number(s[i])
    if (dbl) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    dbl = !dbl
  }
  return sum % 10 === 0
}

function maskPreview(full: string): string {
  const digits = full.replace(/\D/g, "")
  const last4 = digits.slice(-4)
  return last4 ? `•••• •••• •••• ${last4}` : "•••• •••• •••• ••••"
}

export function AddCardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [issuer, setIssuer] = useState("")
  const [nickname, setNickname] = useState("")
  const [network, setNetwork] = useState("")
  const [expiryMonth, setExpiryMonth] = useState<number | "">("")
  const [expiryYear, setExpiryYear] = useState<number | "">("")
  const [fullNumber, setFullNumber] = useState("")

  const last4 = useMemo(() => fullNumber.replace(/\D/g, "").slice(-4), [fullNumber])
  const masked = useMemo(() => maskPreview(fullNumber), [fullNumber])

  const valid =
    issuer.trim().length > 0 &&
    luhnCheck(fullNumber) &&
    (expiryMonth === "" || (Number(expiryMonth) >= 1 && Number(expiryMonth) <= 12)) &&
    (expiryYear === "" || String(expiryYear).length >= 2)

  const addCard = useAddCard()

  useEffect(() => {
    if (!open) {
      setIssuer("")
      setNickname("")
      setNetwork("")
      setExpiryMonth("")
      setExpiryYear("")
      setFullNumber("")
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Add Card</h2>
          <button className="text-gray-500 hover:text-black" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-700">Issuer</span>
            <select
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
            >
              <option value="">Select an issuer…</option>
              {ISSUERS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-gray-700">Nickname (optional)</span>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g., Sapphire Dining"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-700">Network (optional)</span>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              placeholder="Visa / MasterCard / Amex"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-gray-700">Expiry Month (MM)</span>
              <input
                type="number"
                min={1}
                max={12}
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={expiryMonth}
                onChange={(e) => setExpiryMonth(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="MM"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-700">Expiry Year (YY or YYYY)</span>
              <input
                type="number"
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={expiryYear}
                onChange={(e) => setExpiryYear(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="YYYY"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm text-gray-700">Full Card Number</span>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={fullNumber}
              onChange={(e) => setFullNumber(e.target.value)}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 5678 9012 3456"
            />
            <div className="text-xs text-gray-500 mt-1">
              We only keep the last 4. Preview: <span className="font-mono">{masked}</span>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button className="px-4 py-2 rounded-lg border" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
            disabled={!valid || addCard.isPending}
            onClick={async () => {
              const payload = {
                issuer,
                nickname: nickname || undefined,
                network: network || undefined,
                expiry_month: expiryMonth === "" ? undefined : Number(expiryMonth),
                expiry_year: expiryYear === "" ? undefined : Number(expiryYear),
                last4,
                account_mask: masked,
              }
              await addCard.mutateAsync(payload)
              setFullNumber("")
              onClose()
            }}
          >
            {addCard.isPending ? "Saving…" : "Save Card"}
          </button>
        </div>
      </div>
    </div>
  )
}
