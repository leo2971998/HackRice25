import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { MerchantBreakdownRow } from "@/types/api"

export type MerchantBarChartProps = {
  data: MerchantBreakdownRow[]
}

export function MerchantBarChart({ data }: MerchantBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RechartsBarChart data={data} barSize={28}>
        <XAxis dataKey="merchant" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <Tooltip
          cursor={{ fill: "rgba(99, 102, 241, 0.08)", radius: 24 }}
          contentStyle={{
            borderRadius: 18,
            border: "1px solid rgba(148, 163, 184, 0.3)",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
          }}
          formatter={(value: number) => `$${value.toLocaleString()}`}
        />
        <Bar dataKey="total" radius={[18, 18, 18, 18]} fill="#6366F1" />
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
