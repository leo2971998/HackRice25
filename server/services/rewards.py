from __future__ import annotations

from typing import Any, Dict, Iterable, List, Tuple


def _normalize_rewards(rewards: Iterable[Dict[str, Any]] | None) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for reward in rewards or []:
        category_raw = reward.get("category")
        rate_raw = reward.get("rate")
        if not category_raw or rate_raw is None:
            continue
        try:
            rate = float(rate_raw)
        except (TypeError, ValueError):
            continue
        category = str(category_raw).strip()
        if not category:
            continue
        entry: Dict[str, Any] = {
            "category": category,
            "key": category.lower(),
            "rate": rate,
        }
        cap_value = reward.get("cap_monthly")
        if cap_value is not None:
            try:
                entry["cap_monthly"] = float(cap_value)
            except (TypeError, ValueError):
                pass
        formatted.append(entry)
    return formatted


def summarize_spend(transactions: Iterable[Dict[str, Any]]) -> Tuple[float, Dict[str, float], Dict[str, int]]:
    totals: Dict[str, float] = {}
    counts: Dict[str, int] = {}
    total_spend = 0.0
    for txn in transactions:
        amount_raw = txn.get("amount", 0)
        try:
            amount = float(amount_raw or 0)
        except (TypeError, ValueError):
            amount = 0.0
        amount = max(amount, 0.0)
        if amount <= 0:
            continue
        category = str(txn.get("category") or "General")
        totals[category] = totals.get(category, 0.0) + amount
        counts[category] = counts.get(category, 0) + 1
        total_spend += amount
    return total_spend, totals, counts


def compute_month_earnings(card: Dict[str, Any], transactions: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    base_rate = float(card.get("base_cashback") or 0.0)
    rewards = _normalize_rewards(card.get("rewards"))

    total_spend, totals_by_category, counts = summarize_spend(transactions)
    total_cashback = 0.0
    breakdown: List[Dict[str, Any]] = []

    for category, spend in sorted(totals_by_category.items(), key=lambda item: item[1], reverse=True):
        lookup_key = category.lower()
        reward = next((row for row in rewards if row["key"] == lookup_key), None)
        rate = reward["rate"] if reward else base_rate
        cap = reward.get("cap_monthly") if reward else None

        eligible = spend
        if isinstance(cap, (int, float)):
            eligible = min(spend, float(cap))

        base_cash = base_rate * spend
        bonus_cash = max(rate - base_rate, 0.0) * eligible
        cashback = base_cash + bonus_cash
        total_cashback += cashback

        breakdown.append(
            {
                "category": category,
                "spend": round(spend, 2),
                "rate": round(rate, 4),
                "cashback": round(cashback, 2),
                "transactions": counts.get(category, 0),
                "capMonthly": float(cap) if isinstance(cap, (int, float)) else None,
            }
        )

    effective_rate = (total_cashback / total_spend) if total_spend else 0.0

    return {
        "total_cashback": round(total_cashback, 2),
        "total_spend": round(total_spend, 2),
        "effective_rate": round(effective_rate, 4),
        "base_rate": round(base_rate, 4),
        "by_category": breakdown,
    }


def normalize_mix(raw_mix: Dict[str, Any]) -> Tuple[Dict[str, float], float]:
    sanitized: Dict[str, float] = {}
    for key, value in raw_mix.items():
        try:
            amount = float(value)
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue
        sanitized[str(key)] = amount

    total = sum(sanitized.values())
    if total <= 0:
        return {}, 0.0

    mix = {category: amount / total for category, amount in sanitized.items()}
    return mix, total
