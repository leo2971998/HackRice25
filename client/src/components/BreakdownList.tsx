import type { CategoryShare, SpendSummary } from "@/types/api"

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function formatShare(value: number) {
  return `${value.toFixed(1)}%`
}

export type BreakdownListProps = {
  categories: CategoryShare[]
  others?: SpendSummary["others"]
  isLoading?: boolean
}

export function BreakdownList({ categories, others, isLoading }: BreakdownListProps) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Crunching your categories…</div>
  }

  if (!categories.length) {
    return <div className="text-sm text-muted-foreground">No spending data for this period.</div>
  }

  return (
    <div className="space-y-2">
      {categories.map((category) => (
        <div key={category.name} className="flex items-center justify-between text-sm">
          <div className="font-medium text-foreground">
            {category.name} <span className="text-muted-foreground">— {currencyFormatter.format(category.total)}</span>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">{formatShare(category.share)}</span>
        </div>
      ))}
      {others && others.share > 0 && others.count > 0 ? (
        <div className="text-xs text-muted-foreground">
          +{others.count} more categories covering {currencyFormatter.format(others.total)} ({formatShare(others.share)})
        </div>
      ) : null}
    </div>
  )
}
