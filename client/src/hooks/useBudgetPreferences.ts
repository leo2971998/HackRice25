// src/hooks/useBudgetPreferences.ts
import { useMemo } from "react"
import { useMe, useUpdateMe } from "@/hooks/useApi"

/**
 * Our canonical budgets shape:
 *   {
 *     monthlyTotal?: number | null,
 *     byCategory?: Record<string, number>
 *   }
 *
 * Older code used keys like enabled / monthly_limit / soft_pct / hard_pct.
 * This hook normalizes everything to the new shape.
 */
export type BudgetsPrefs = {
    monthlyTotal?: number | null
    byCategory?: Record<string, number>
}

export function useBudgetPreferences() {
    const { data: me } = useMe()
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

    /** Set multiple keys in one go; only accepts the canonical keys. */
    const patchBudgets = (patch: Partial<BudgetsPrefs>) => {
        updateMe.mutate({
            preferences: {
                budgets: {
                    ...prefs,
                    ...patch,
                },
            },
        })
    }

    return {
        prefs,
        setMonthlyTotal,
        setByCategory,
        patchBudgets,
    }
}
