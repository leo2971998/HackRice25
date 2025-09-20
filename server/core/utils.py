"""Shared helper utilities for routes."""

from datetime import datetime
from typing import Any, Dict, Iterable, Tuple

from bson import ObjectId
from werkzeug.exceptions import BadRequest, NotFound


def parse_window_days(default: int = 30) -> int:
    from flask import request  # Imported lazily to avoid circular imports

    raw = request.args.get("window", default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise BadRequest("window must be an integer")
    if value <= 0:
        raise BadRequest("window must be positive")
    return value


def validate_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:  # pragma: no cover - defensive
        raise NotFound("Resource not found") from exc


def format_card_row(doc: Dict[str, Any]) -> Dict[str, Any]:
    expires = None
    if doc.get("expiry_year") and doc.get("expiry_month"):
        expires = f"{int(doc['expiry_year']):04d}-{int(doc['expiry_month']):02d}"
    last_sync = doc.get("last_sync")
    return {
        "id": str(doc["_id"]),
        "nickname": doc.get("nickname") or doc.get("issuer") or "Card",
        "issuer": doc.get("issuer", ""),
        "network": doc.get("network"),
        "mask": doc.get("account_mask", ""),
        "type": doc.get("account_type", "credit_card"),
        "expires": expires,
        "status": doc.get("status", "Active"),
        "appliedAt": doc.get("applied_at"),
        "cardProductSlug": doc.get("card_product_slug"),
        "lastSynced": last_sync.isoformat().replace("+00:00", "Z") if isinstance(last_sync, datetime) else None,
    }


def calculate_summary(transactions: Iterable[Dict[str, Any]]) -> Tuple[float, int, Dict[str, float]]:
    total = 0.0
    count = 0
    by_category: Dict[str, float] = {}
    for txn in transactions:
        amount = float(txn.get("amount", 0))
        category = txn.get("category") or "Uncategorized"
        total += amount
        count += 1
        by_category[category] = by_category.get(category, 0.0) + amount
    return total, count, by_category


def calculate_money_moments(window_days: int, txns: Iterable[Dict[str, Any]]) -> Iterable[Dict[str, Any]]:
    txns_list = list(txns)
    if not txns_list:
        return []

    total, count, by_category = calculate_summary(txns_list)
    _ = count  # kept for parity but unused directly
    moments = []
    top_category = None
    if by_category:
        top_category = max(by_category.items(), key=lambda item: item[1])
    if top_category and total > 0:
        share = (top_category[1] / total) if total else 0
        if share >= 0.55:
            moments.append(
                {
                    "id": "moment-focus",
                    "title": "Spotlight on your spending",
                    "body": f"About {share:.0%} of your recent spending went to {top_category[0]}. A small budget tweak could help balance things out.",
                    "type": "alert",
                }
            )
        else:
            moments.append(
                {
                    "id": "moment-balance",
                    "title": "Nice balance",
                    "body": f"No single category dominated—{top_category[0]} was your largest area, but spending stayed well distributed.",
                    "type": "win",
                }
            )

    avg_daily = total / window_days
    if avg_daily > 0:
        moments.append(
            {
                "id": "moment-daily",
                "title": "Daily pace",
                "body": f"You're averaging ${avg_daily:,.2f} per day over the last {window_days} days.",
                "type": "tip",
            }
        )

    repeat_merchants: Dict[str, int] = {}
    for txn in txns_list:
        merchant = txn.get("merchant_id") or txn.get("description_clean") or txn.get("description") or "Merchant"
        repeat_merchants[merchant] = repeat_merchants.get(merchant, 0) + 1
    top_merchant = max(repeat_merchants.items(), key=lambda item: item[1]) if repeat_merchants else None
    if top_merchant and top_merchant[1] >= 3:
        moments.append(
            {
                "id": "moment-merchant",
                "title": "Frequent stop spotted",
                "body": f"You visited {top_merchant[0]} {top_merchant[1]} times recently. If it's a favorite, consider setting a spending goal for it.",
                "type": "tip",
            }
        )

    return moments[:3]
