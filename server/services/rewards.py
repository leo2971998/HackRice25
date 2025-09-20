"""Rewards computation utilities."""

from collections import defaultdict
from typing import Any, Dict, Iterable, Tuple


def _match_rate(card: Dict[str, Any], category: str) -> float:
    for reward in card.get("rewards", []):
        if reward.get("category") == category:
            return float(reward.get("rate") or 0)
    return float(card.get("base_cashback") or 0)


def compute_txn_earnings(
    card: Dict[str, Any], txn: Dict[str, Any], month_usage: Dict[str, float]
) -> Tuple[float, Dict[str, float]]:
    amount = float(txn.get("amount") or 0)
    category = txn.get("category") or "Uncategorized"
    rate = _match_rate(card, category)

    cap = None
    for reward in card.get("rewards", []):
        if reward.get("category") == category and reward.get("cap_monthly") is not None:
            cap = float(reward["cap_monthly"])
            break

    effective_amount = amount
    if cap is not None:
        used = month_usage.get(category, 0.0)
        remaining = max(cap - used, 0.0)
        effective_amount = min(amount, remaining)
        month_usage[category] = used + effective_amount

    earned = effective_amount * rate
    return earned, month_usage


def compute_month_earnings(card: Dict[str, Any], txns: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    usage = defaultdict(float)
    total = 0.0
    by_cat = defaultdict(float)
    for txn in txns:
        earned, usage = compute_txn_earnings(card, txn, usage)
        total += earned
        category = txn.get("category") or "Uncategorized"
        by_cat[category] += earned
    return {
        "total": round(total, 2),
        "byCategory": {key: round(value, 2) for key, value in by_cat.items()},
    }
