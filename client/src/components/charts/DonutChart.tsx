import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts"

import type { CategorySummary } from "@/types/api"

const CHART_COLORS = ["#6366F1", "#8B5CF6", "#C084FC", "#34D399", "#38BDF8"]

type DonutChartProps = {
  data: CategorySummary[]
}

export function DonutChart({ data }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          innerRadius={70}
          outerRadius={110}
          paddingAngle={4}
          cornerRadius={12}
        >
          {data.map((entry, index) => (
            <Cell key={entry.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: 16,
            border: "1px solid rgba(99, 102, 241, 0.1)",
            boxShadow: "0 12px 40px rgba(79, 70, 229, 0.15)",
          }}
          formatter={(value: number, _name, entry) => [
            `$${value.toLocaleString()}`,
            `${(entry?.payload as CategorySummary).label}`,
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
