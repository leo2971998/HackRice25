export type Preferences = {
  timezone: string
  currency: string
  theme: "light" | "dark" | "system"
  privacy: { blurAmounts: boolean }
  notifications: { monthly_summary: boolean; new_recommendation: boolean }
}

export type Me = {
  userId: string
  email: string | null
  name?: string | null
  preferences: Preferences
}

export type SpendSummary = {
  stats: { totalSpend: number; txns: number; accounts: number }
  byCategory: { name: string; total: number }[]
}

export type MerchantRow = {
  id: string
  name: string
  category: string
  count: number
  total: number
  logoUrl?: string
}

export type MoneyMoment = {
  id: string
  title: string
  body: string
  type: "tip" | "win" | "alert"
}

export type CardRow = {
  id: string
  nickname: string
  issuer: string
  network?: string
  mask: string
  type: "credit_card"
  expires?: string | null
  status: "Active" | "Needs Attention"
  lastSynced?: string | null
}

export type CardSummary = {
  windowDays: number
  spend: number
  txns: number
  byCategory: { name: string; total: number }[]
}

export type CardDetails = CardRow & {
  productName?: string
  features?: string[]
  summary?: CardSummary
}
