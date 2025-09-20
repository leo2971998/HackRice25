export type SpendingWindow = 30 | 90 | 180

export type Merchant = {
  id: string
  name: string
  logoUrl: string
  category: string
  total: number
  recurring: boolean
}

export type CategorySummary = {
  id: string
  label: string
  amount: number
  percentage: number
}

export type StatSummary = {
  label: string
  value: string
  delta?: number
}

export type LinkedAccount = {
  id: string
  institution: string
  status: "Active" | "Reconnect"
  lastSynced: string
  mask: string
}

export type Recommendation = {
  id: string
  title: string
  estimatedValue: number
  reasons: string[]
}

export type ChatMessage = {
  id: string
  author: "user" | "assistant"
  content: string
  timestamp: string
}
