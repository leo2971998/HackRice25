import { useMemo } from "react"
import { useMe, useUpdateMe } from "@/hooks/useApi"

export type BudgetPrefs = {
    enabled: boolean
    monthly_limit: number | null
    soft_pct: number
    hard_pct: number
}

const DEFAULT: BudgetPrefs = { enabled: true, monthly_limit: null, soft_pct: 0.8, hard_pct: 1.0 }

export function useBudgetPreferences() {
    const me = useMe()
    const updateMe = useUpdateMe()

    const prefs: BudgetPrefs = useMemo(() => {
        const p = (me.data?.preferences as any)?.budget
        return { ...DEFAULT, ...(p ?? {}) }
    }, [me.data])

    const save = (patch: Partial<BudgetPrefs>) =>
        updateMe.mutate({ preferences: { budget: { ...prefs, ...patch } } })

    const setLimit = (limit: number | null) => save({ monthly_limit: limit })
    const setPct = (soft_pct: number, hard_pct: number) => save({ soft_pct, hard_pct })
    const toggle = (enabled: boolean) => save({ enabled })

    return { prefs, setLimit, setPct, toggle, isSaving: updateMe.isPending, isLoading: me.isLoading }
}
