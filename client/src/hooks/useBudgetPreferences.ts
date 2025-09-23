// src/hooks/useBudgetPreferences.ts
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
        const prefRoot = (me.data?.preferences as any) ?? {}
        // Read from the canonical key first; fall back to legacy shapes if they exist
        const source =
            prefRoot.budget_prefs ??  // <— new canonical home for config
            prefRoot.budget ??        // legacy singular
            prefRoot.budgets_pref ??  // possible earlier variant
            {}                        // NOTE: prefRoot.budgets is NOT prefs (that’s summary data)
        return { ...DEFAULT, ...(source ?? {}) }
    }, [me.data?.preferences])

    // Always write to the canonical key `budget_prefs`.
    // Cast to `any` to avoid fighting the current Preferences type.
    const save = (patch: Partial<BudgetPrefs>) =>
        updateMe.mutate({
            preferences: { budget_prefs: { ...prefs, ...patch } } as any,
        })

    const setLimit = (limit: number | null) => save({ monthly_limit: limit })
    const setPct = (soft_pct: number, hard_pct: number) => save({ soft_pct, hard_pct })
    const toggle = (enabled: boolean) => save({ enabled })

    return { prefs, setLimit, setPct, toggle, isSaving: updateMe.isPending, isLoading: me.isLoading }
}
