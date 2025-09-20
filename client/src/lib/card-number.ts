export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D+/g, "")
  return digits.match(/.{1,4}/g)?.join(" ") ?? ""
}

export function extractLast4(value: string): string {
  const digits = value.replace(/\D+/g, "")
  return digits.slice(-4)
}
