// src/hooks/useBudgetPreferences.ts
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

    const prefs: BudgetsPrefs = me?.preferences?.budgets ?? {}

    /** Set the global monthly budget total (or null to unset). */
    const setMonthlyTotal = (value: number | null) => {
        updateMe.mutate({
            preferences: {
                budgets: {
                    ...prefs,
                    monthlyTotal: value,
                },
            },
        })
    }

    /** Replace (or extend) the per-category budget map. */
    const setByCategory = (map: Record<string, number>) => {
        updateMe.mutate({
            preferences: {
                budgets: {
                    ...prefs,
                    byCategory: { ...(prefs.byCategory ?? {}), ...map },
                },
            },
        })
    }

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
