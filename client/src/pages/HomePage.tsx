import { useMe, useSpendSummary, useAuthWiring } from "@/hooks/useApi"

export function HomePage() {
  useAuthWiring()

  const { data: me } = useMe()
  const { data: summary, isLoading, error } = useSpendSummary()

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Welcome{me?.name ? `, ${me.name}` : ""}</h1>

      {isLoading && <div>Loading spending…</div>}
      {error && <div className="text-red-600">Could not load spending.</div>}

      {summary && (
        <div className="space-y-2">
          <div className="text-lg">Total this period: ${summary.total.toFixed(2)}</div>
          <ul className="list-disc pl-6">
            {summary.byCategory.map((c) => (
              <li key={c.category}>
                {c.category}: ${c.amount.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default HomePage
