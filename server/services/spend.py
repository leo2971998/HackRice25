"""Helpers for analysing spend data."""

from __future__ import annotations

from datetime import datetime, timedelta
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from bson import ObjectId


def load_transactions(
    database,
    user_id: ObjectId,
    window_days: int,
    card_object_ids: Optional[Sequence[ObjectId]] = None,
) -> List[Dict[str, Any]]:
    """Fetch transactions for the given user and time window."""

    cutoff = datetime.utcnow() - timedelta(days=window_days)
    query: Dict[str, Any] = {"userId": user_id, "date": {"$gte": cutoff}}
    if card_object_ids:
        query["accountId"] = {"$in": list(card_object_ids)}
    return list(database["transactions"].find(query))


def _summarize_categories(transactions: Iterable[Dict[str, Any]]) -> Tuple[float, Dict[str, float], Dict[str, int]]:
    total = 0.0
    by_category: Dict[str, float] = {}
    counts: Dict[str, int] = {}
    for txn in transactions:
        raw_amount = float(txn.get("amount", 0) or 0)
        amount = max(raw_amount, 0.0)
        category = txn.get("category") or "Uncategorized"
        by_category[category] = by_category.get(category, 0.0) + amount
        counts[category] = counts.get(category, 0) + 1
        total += amount
    return total, by_category, counts


def compute_user_mix(
    database,
    user_id: ObjectId,
    window_days: int,
    card_object_ids: Optional[Sequence[ObjectId]] = None,
    transactions: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[Dict[str, float], float, List[Dict[str, Any]]]:
    """Return the user category mix and total spend for the given window."""

    if transactions is None:
        transactions = load_transactions(database, user_id, window_days, card_object_ids)

    total, by_category, _ = _summarize_categories(transactions)
    if total <= 0:
        return {}, 0.0, transactions

    mix = {category: amount / total for category, amount in by_category.items() if amount > 0}
    return mix, total, transactions


def build_category_rules(mappings: Iterable[Dict[str, Any]]) -> List[Tuple[str, Any, str]]:
    """Compile merchant category mapping rules from the database."""

    rules: List[Tuple[str, Any, str]] = []
    for mapping in mappings:
        pattern = mapping.get("pattern")
        category = mapping.get("category")
        if not pattern or not category:
            continue
        try:
            rules.append(("regex", re.compile(pattern, re.IGNORECASE), category))
        except re.error:
            rules.append(("substr", str(pattern).lower(), category))
    return rules


def _resolve_category(name: str, fallback: str, rules: Optional[Sequence[Tuple[str, Any, str]]]) -> str:
    if not rules:
        return fallback
    lowered = name.lower()
    for rule_type, matcher, category in rules:
        if rule_type == "regex":
            if matcher.search(name):  # type: ignore[attr-defined]
                return category
        else:
            if matcher in lowered:
                return category
    return fallback


def aggregate_spend_details(
    transactions: List[Dict[str, Any]],
    category_rules: Optional[Sequence[Tuple[str, Any, str]]] = None,
) -> Dict[str, Any]:
    """Produce a detailed breakdown of categories and merchants."""

    total, by_category, counts = _summarize_categories(transactions)

    categories = [
        {
            "key": category,
            "amount": round(amount, 2),
            "count": counts.get(category, 0),
            "pct": (amount / total) if total else 0.0,
        }
        for category, amount in sorted(by_category.items(), key=lambda item: item[1], reverse=True)
    ]

    merchants: Dict[str, Dict[str, Any]] = {}
    for txn in transactions:
        raw_amount = float(txn.get("amount", 0) or 0)
        amount = max(raw_amount, 0.0)
        if amount <= 0:
            continue
        name = (
            txn.get("merchant_id")
            or txn.get("description_clean")
            or txn.get("description")
            or "Merchant"
        )
        base_category = txn.get("category") or "General"
        merchant = merchants.setdefault(
            name,
            {
                "name": name,
                "category": base_category,
                "count": 0,
                "amount": 0.0,
                "logoUrl": txn.get("logoUrl", ""),
            },
        )
        merchant["count"] += 1
        merchant["amount"] += amount
        if not merchant.get("logoUrl") and txn.get("logoUrl"):
            merchant["logoUrl"] = txn.get("logoUrl")

    for merchant in merchants.values():
        merchant["category"] = _resolve_category(merchant["name"], merchant.get("category", "General"), category_rules)
        merchant["amount"] = round(merchant["amount"], 2)

    merchant_rows = sorted(merchants.values(), key=lambda item: item["amount"], reverse=True)

    return {
        "total": round(total, 2),
        "transaction_count": len(transactions),
        "categories": categories,
        "merchants": merchant_rows,
    }

