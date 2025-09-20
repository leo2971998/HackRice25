import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts"

const CHART_COLORS = ["#6366F1", "#8B5CF6", "#C084FC", "#34D399", "#38BDF8", "#F59E0B", "#14B8A6"]

type DonutChartProps = {
  data: { name: string; total: number }[]
  isLoading?: boolean
  emptyMessage?: string
}

export function DonutChart({ data, isLoading, emptyMessage = "No spending yet in the last 30 days." }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.total, 0)
  const showEmpty = !isLoading && (data.length === 0 || total <= 0)

  return (
    <div className="relative h-full w-full">
      {isLoading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
      ) : showEmpty ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" innerRadius={70} outerRadius={110} paddingAngle={4} cornerRadius={12}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, _name, entry) => [
                `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                entry?.payload?.name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
