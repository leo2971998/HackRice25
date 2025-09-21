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

export type SpendDetailCategory = {
  key: string
  amount: number
  count: number
  pct: number
}

export type SpendDetailMerchant = {
  name: string
  category: string
  amount: number
  count: number
  logoUrl?: string
}

export type SpendDetails = {
  windowDays: number
  total: number
  transactionCount: number
  categories: SpendDetailCategory[]
  merchants: SpendDetailMerchant[]
}

export type MoneyMoment = {
  id: string
  title: string
  body: string
  type: "tip" | "win" | "alert"
}

export type TransactionRow = {
  id: string
  date: string | null
  merchantName: string
  merchantId?: string | null
  description: string
  category: string
  amount: number
  accountId?: string | null
  accountName?: string | null
  status?: string | null
  logoUrl?: string | null
}

export type TransactionsResponse = {
  windowDays: number
  total: number
  transactionCount: number
  transactions: TransactionRow[]
}

export type RecurringGroup = {
  id: string
  merchantId?: string | null
  merchantName?: string | null
  period?: string | null
  typicalAmount?: number | null
  nextExpectedAt?: string | null
  confidence?: number | null
}

export type UpcomingTransaction = {
  id: string
  merchantId?: string | null
  merchantName?: string | null
  amountPredicted?: number | null
  expectedAt?: string | null
  confidence?: number | null
  explain?: string | null
}

export type UpcomingResponse = {
  ok: boolean
  upcoming: UpcomingTransaction[]
}

export type CardRow = {
  id: string
  nickname: string
  issuer: string
  network?: string
  mask: string
  type: "credit_card"
  expires?: string | null
  status: "Active" | "Needs Attention" | "Applied"
  lastSynced?: string | null
  appliedAt?: string | null
  cardProductId?: string | null
  cardProductSlug?: string | null
  productName?: string | null
  account_mask?: string | null
  credit_limit?: number | null
}

export type CardSummary = {
  windowDays: number
  spend: number
  txns: number
  byCategory: { name: string; total: number }[]
}

export type CardCashbackScenario = {
  id: string
  label: string
  category: string
  amount: number
  estimatedCashback: number
  rate: number
  description?: string | null
}

export type CardDetails = CardRow & {
  productName?: string
  features?: string[]
  summary?: CardSummary
  cashbackScenarios?: CardCashbackScenario[]
}

export type RewardsEstimateCategory = {
  category: string
  spend: number
  rate: number
  cashback: number
  transactions: number
  capMonthly?: number | null
}

export type RewardsEstimate = {
  cardId?: string
  cardSlug?: string | null
  cardName?: string | null
  windowDays: number
  totalCashback: number
  totalSpend: number
  effectiveRate: number
  baseRate: number
  byCategory: RewardsEstimateCategory[]
}

export type CreditCardReward = {
  category: string
  rate: number
  cap_monthly?: number | null
}

export type WelcomeOffer = {
  bonus_value_usd?: number
  min_spend?: number
  window_days?: number
} | null

export type CreditCardProduct = {
  id: string | null
  slug: string
  product_name: string
  issuer: string
  network?: string | null
  annual_fee: number
  base_cashback: number
  rewards: CreditCardReward[]
  welcome_offer: WelcomeOffer
  foreign_tx_fee: number
  link_url?: string | null
  active: boolean
  last_updated?: string | null
}

export type RecommendationBonusBreakdown = {
  category: string
  rate: number
  cap_monthly?: number | null
  eligible_spend_monthly: number
  monthly_amount: number
  annual_amount: number
}

export type RecommendationBreakdown = {
  monthly_spend: number
  base: {
    rate: number
    monthly_amount: number
    annual_amount: number
  }
  bonuses: RecommendationBonusBreakdown[]
  welcome: {
    value: number
    min_spend?: number
    window_days?: number
  } | null
}

export type RecommendationCard = {
  id: string | null
  slug?: string | null
  product_name?: string
  issuer?: string
  network?: string | null
  link_url?: string | null
  foreign_tx_fee?: number | null
  base_cashback: number
  annual_fee: number
  annual_reward: number
  monthly_reward: number
  net: number
  active: boolean
  rewards: CreditCardReward[]
  welcome_offer: WelcomeOffer
  breakdown: RecommendationBreakdown
  highlights: string[]
}

export type RecommendationResponse = {
  mix: Record<string, number>
  monthly_spend: number
  windowDays: number
  cards: RecommendationCard[]
  explanation: string
}

export type MandateStatus = "pending_approval" | "approved" | "declined" | "executed"

export type Mandate = {
  id: string
  type: "intent" | "cart" | "payment"
  status: MandateStatus
  data: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
}

export type MandateAttachment = Mandate & {
  context?: Record<string, unknown>
}

export type ChatMessage = {
  id: string
  author: "user" | "assistant"
  content: string
  timestamp: string
  mandate?: MandateAttachment
}

export type ChatResponse = {
  reply: string
  timestamp: string
}
