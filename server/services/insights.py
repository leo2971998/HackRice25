# server/services/insights.py
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from services.spend import (
    load_transactions,
    aggregate_spend_details,
    build_category_rules,
)

# ---------- Category helpers ----------

_CAT_ALIASES = {
    "dining": "Food and Drink",
    "food": "Food and Drink",
    "food & drink": "Food and Drink",
    "food and drink": "Food and Drink",
    "grocery": "Groceries",
    "groceries": "Groceries",
    "pharmacy": "Drugstores",
    "drugstore": "Drugstores",
    "drugstores": "Drugstores",
    "travel": "Travel",
    "bills": "Bills",
    "shopping": "Shopping",
    "entertainment": "Entertainment",
    "transit": "Transportation",
    "transport": "Transportation",
    "transportation": "Transportation",
    "home improvement": "Home Improvement",
}

def _canon_cat(name: str) -> str:
    s = (name or "").strip().lower().replace("&", "and")
    return _CAT_ALIASES.get(s, name)

def _resolve_days(alias: Any, default_days: int = 30) -> int:
    if isinstance(alias, int):
        return max(1, alias)
    if isinstance(alias, str):
        a = alias.strip().upper()
        if a == "MTD":
            today = datetime.utcnow().date()
            first = today.replace(day=1)
            return max((today - first).days + 1, 1)
        try:
            return max(1, int(a))
        except Exception:
            return default_days
    return default_days

def _as_dt(val) -> datetime:
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
    except Exception:
        return datetime.utcnow()

# ---------- Window helpers for compare ----------

def _window_bounds(this_window: Any) -> Tuple[datetime, datetime, datetime, datetime, int]:
    """
    Returns (cur_start, cur_end, prev_start, prev_end, window_days)
    """
    now = datetime.utcnow()

    if isinstance(this_window, str) and this_window.upper() == "MTD":
        cur_start = datetime(now.year, now.month, 1)
        cur_end = now
        window_days = max(1, (cur_end - cur_start).days or 1)
        prev_end = cur_start
        prev_start = prev_end - timedelta(days=window_days)
        return cur_start, cur_end, prev_start, prev_end, window_days

    try:
        days = int(this_window)
    except Exception:
        days = 30

    days = max(1, days)
    cur_end = now
    cur_start = now - timedelta(days=days)
    prev_end = cur_start
    prev_start = prev_end - timedelta(days=days)
    return cur_start, cur_end, prev_start, prev_end, days

def _fetch_txns_for_range(db, user_id: ObjectId, start: datetime, end: datetime) -> List[Dict[str, Any]]:
    return list(db["transactions"].find({"userId": user_id, "date": {"$gte": start, "$lt": end}}))

def _index_amount(rows: List[Dict[str, Any]], key_field: str, amount_field: str) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for r in rows or []:
        key = str(r.get(key_field) or "").strip()
        amt = float(r.get(amount_field, 0) or 0)
        if key:
            out[key] = out.get(key, 0.0) + amt
    return out

def _top_category_increases(cur_cats: List[Dict[str, Any]], prev_cats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cur_map = _index_amount([{ "key": r.get("key"), "amount": r.get("amount", 0.0)} for r in cur_cats], "key", "amount")
    prev_map = _index_amount([{ "key": r.get("key"), "amount": r.get("amount", 0.0)} for r in prev_cats], "key", "amount")
    out: List[Dict[str, Any]] = []
    for name, cur_amt in cur_map.items():
        change = float(cur_amt) - float(prev_map.get(name, 0.0))
        if change > 0:
            out.append({"name": name, "increase": round(change, 2), "current": round(cur_amt, 2)})
    out.sort(key=lambda r: r["increase"], reverse=True)
    return out

def _top_merchant_increases(cur_merchants: List[Dict[str, Any]], prev_merchants: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cur_map = _index_amount([{ "name": r.get("name"), "amount": r.get("amount", 0.0)} for r in cur_merchants], "name", "amount")
    prev_map = _index_amount([{ "name": r.get("name"), "amount": r.get("amount", 0.0)} for r in prev_merchants], "name", "amount")
    out: List[Dict[str, Any]] = []
    for name, cur_amt in cur_map.items():
        change = float(cur_amt) - float(prev_map.get(name, 0.0))
        if change > 0:
            out.append({"name": name, "change": round(change, 2)})
    out.sort(key=lambda r: r["change"], reverse=True)
    return out

# ---------- Public: compare_windows / overspend_reasons ----------

def compare_windows(db, user_id: ObjectId, this_window: Any = "MTD") -> Dict[str, Any]:
    """
    Compute this-window vs prior-window spend deltas without relying on Mongo date types.
    We load ~2 windows of txns via load_transactions and split in Python by timestamps.
    """
    # Establish window bounds
    now = datetime.utcnow()
    if isinstance(this_window, str) and this_window.upper() == "MTD":
        cur_start = datetime(now.year, now.month, 1)
        cur_end = now
        window_days = max(1, (cur_end - cur_start).days or 1)
        prev_end = cur_start
        prev_start = prev_end - timedelta(days=window_days)
    else:
        try:
            days = int(this_window)
        except Exception:
            days = 30
        days = max(1, days)
        window_days = days
        cur_end = now
        cur_start = now - timedelta(days=days)
        prev_end = cur_start
        prev_start = prev_end - timedelta(days=days)

    # Load ~2 windows worth (plus a little cushion)
    lookback_days = window_days * 2 + 2
    all_tx = load_transactions(db, user_id, lookback_days, None)

    # Split by window using robust timestamp parsing
    cur_tx = [t for t in all_tx if cur_start <= _as_dt(t.get("date")) < cur_end]
    prv_tx = [t for t in all_tx if prev_start <= _as_dt(t.get("date")) < prev_end]

    # Category rules (optional; keeps behavior consistent with other endpoints)
    rules = build_category_rules(db["merchant_categories"].find({}))

    br_cur = aggregate_spend_details(cur_tx, rules)
    br_prev = aggregate_spend_details(prv_tx, rules)

    total_cur = float(br_cur.get("total", 0.0) or 0.0)
    total_prev = float(br_prev.get("total", 0.0) or 0.0)

    top_cat_increases = _top_category_increases(br_cur.get("categories", []), br_prev.get("categories", []))
    top_merch_increases = _top_merchant_increases(br_cur.get("merchants", []), br_prev.get("merchants", []))

    return {
        "windowDays": window_days,
        "this": {
            "total": round(total_cur, 2),
            "categories": br_cur.get("categories", []),
            "merchants": br_cur.get("merchants", []),
        },
        "prior": {
            "total": round(total_prev, 2),
            "categories": br_prev.get("categories", []),
            "merchants": br_prev.get("merchants", []),
        },
        "deltaTotal": round(total_cur - total_prev, 2),
        "topCategoryIncreases": top_cat_increases,
        "topMerchantIncreases": top_merch_increases,
    }

def overspend_reasons(db, user_id: ObjectId, this_window: Any = "MTD") -> Dict[str, Any]:
    """
    Compact summary for LLM/tools.
    {
      "windowDays": ...,
      "delta": ...,
      "categories": [{"name","increase","current"}, ...],
      "merchants": [{"name","change"}, ...]
    }
    """
    cmp = compare_windows(db, user_id, this_window=this_window)
    return {
        "windowDays": cmp.get("windowDays"),
        "delta": cmp.get("deltaTotal"),
        "categories": cmp.get("topCategoryIncreases", []),
        "merchants": cmp.get("topMerchantIncreases", []),
    }

# ---------- Public: category_deep_dive ----------

def category_deep_dive(
        db,
        user_id: ObjectId,
        category_name: str,
        this_window: Any = 30,
        card_object_ids: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    """
    Returns a dict focused on a single category with current vs prior window comparison.
    {
      "category": "Food and Drink",
      "windowDays": 30,
      "thisTotal": 330.00,
      "priorTotal": 139.00,
      "delta": 191.00,
      "topMerchants": [{"name":"chipotle","amount":153.0,"count":3}, ...]
    }
    """
    cat = _canon_cat(category_name)
    days = _resolve_days(this_window, 30)

    tx = load_transactions(db, user_id, days * 2, card_object_ids)
    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    cur_tx = [t for t in tx if _as_dt(t.get("date")) >= cutoff]
    prv_tx = [t for t in tx if _as_dt(t.get("date")) < cutoff]

    cur = aggregate_spend_details(cur_tx)
    prv = aggregate_spend_details(prv_tx)

    def _sum_for_cat(agg) -> float:
        total = 0.0
        for m in agg.get("merchants", []):
            if _canon_cat(m.get("category", "")) == cat:
                total += float(m.get("amount", 0) or 0)
        return round(total, 2)

    cur_total = _sum_for_cat(cur)
    prv_total = _sum_for_cat(prv)

    cur_merchants = [
        {
            "name": m.get("name"),
            "amount": float(m.get("amount", 0) or 0.0),
            "count": int(m.get("count", 0) or 0),
        }
        for m in cur.get("merchants", [])
        if _canon_cat(m.get("category", "")) == cat
    ]
    cur_merchants.sort(key=lambda r: r["amount"], reverse=True)
    top_merchants = cur_merchants[:5]

    return {
        "category": cat,
        "windowDays": days,
        "thisTotal": cur_total,
        "priorTotal": prv_total,
        "delta": round(cur_total - prv_total, 2),
        "topMerchants": top_merchants,
    }
