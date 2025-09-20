import type {
  CategorySummary,
  Merchant,
  LinkedAccount,
  Recommendation,
  StatSummary,
  SpendingWindow,
} from "@/types/api"

export const statSummaries: StatSummary[] = [
  { label: "30 day spend", value: "$4,280", delta: 6.4 },
  { label: "90 day spend", value: "$11,930", delta: -2.1 },
  { label: "Transactions", value: "182", delta: 4.3 },
]

export const categorySummaries: CategorySummary[] = [
  { id: "dining", label: "Dining", amount: 1280, percentage: 28 },
  { id: "travel", label: "Travel", amount: 980, percentage: 21 },
  { id: "wellness", label: "Wellness", amount: 760, percentage: 16 },
  { id: "living", label: "Living", amount: 650, percentage: 14 },
  { id: "shopping", label: "Shopping", amount: 540, percentage: 12 },
]

export const merchants: Merchant[] = [
  {
    id: "merch_1",
    name: "Evergreen Grocers",
    logoUrl: "https://avatar.vercel.sh/evergreen",
    category: "Groceries",
    total: 640,
    recurring: true,
  },
  {
    id: "merch_2",
    name: "Nimbus Airlines",
    logoUrl: "https://avatar.vercel.sh/nimbus",
    category: "Travel",
    total: 1250,
    recurring: false,
  },
  {
    id: "merch_3",
    name: "Glow Cycle Studio",
    logoUrl: "https://avatar.vercel.sh/glow",
    category: "Fitness",
    total: 380,
    recurring: true,
  },
  {
    id: "merch_4",
    name: "Solstice Dining",
    logoUrl: "https://avatar.vercel.sh/solstice",
    category: "Dining",
    total: 540,
    recurring: false,
  },
]

export const linkedAccounts: LinkedAccount[] = [
  {
    id: "acc_1",
    institution: "First Light Credit",
    status: "Active",
    lastSynced: "2h ago",
    mask: "1234",
  },
  {
    id: "acc_2",
    institution: "Evergreen Card",
    status: "Reconnect",
    lastSynced: "1d ago",
    mask: "5678",
  },
]

export const recommendations: Recommendation[] = [
  {
    id: "rec_1",
    title: "Switch groceries to the Evergreen Gold",
    estimatedValue: 320,
    reasons: [
      "5% back at markets you already love",
      "Auto-detects subscription increases",
      "$100 quarterly dining credits",
    ],
  },
  {
    id: "rec_2",
    title: "Activate Nimbus lounges",
    estimatedValue: 560,
    reasons: [
      "Includes guest passes for 2 travelers",
      "$200 travel credit renews each January",
      "Complimentary Clear® membership",
    ],
  },
  {
    id: "rec_3",
    title: "Optimize wellness budget with Glow+",
    estimatedValue: 180,
    reasons: [
      "Bundle classes to save 18%",
      "Set a $200 monthly autopilot",
      "Goal reminders keep streaks alive",
    ],
  },
]

export const spendingWindows: SpendingWindow[] = [30, 90, 180]

export const moneyMoments = [
  { title: "New cashback unlocked", caption: "+$22 dining boost", emoji: "✨" },
  { title: "Subscription nudge", caption: "CloudStream jumped 18%", emoji: "🌥️" },
  { title: "You’re trending ahead", caption: "Travel 12% under plan", emoji: "🛫" },
]
