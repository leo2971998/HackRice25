# server/tools.py
from __future__ import annotations

from typing import Any, Dict, Optional
from flask import g

# Make sure services is importable whether you run as a package or from server/
try:
    # When running "python -m server.app" (recommended)
    from .services.card_optimizer import best_cards
    from .services.insights import (
        compare_windows,
        overspend_reasons,
        top_subscriptions_by_annual_burn,
    )
except Exception:
    # When running "python app.py" from inside the server/ folder
    from services.card_optimizer import best_cards  # type: ignore
    from services.insights import (  # type: ignore
        compare_windows,
        overspend_reasons
    )

# ---- GLOBAL TOOL REGISTRY (define BEFORE using) -----------------------------
TOOLS: Dict[str, Dict[str, Any]] = {}


# ---- Helpers ----------------------------------------------------------------
def _require_ctx() -> Optional[str]:
    """Return an error string if g.db / g.user_id are missing; else None."""
    if getattr(g, "db", None) is None:
        return "database not available"
    if not getattr(g, "user_id", None):
        return "user not identified"
    return None


# ---- Tool: get_best_card ----------------------------------------------------
def _tool_get_best_card(merchant: Optional[str], category: Optional[str], amount: float):
    err = _require_ctx()
    if err:
        return {"type": "error", "message": f"best_card: {err}"}

    amount_cents = int(round(float(amount or 0) * 100))

    # Card catalog (keep the fields minimal)
    catalog = list(
        g.db.card_catalog.find(
            {},
            {
                "_id": 1,
                "issuer": 1,
                "product": 1,
                "base_rate": 1,
                "category_rates": 1,
                "rotating": 1,
                "merchant_overrides": 1,
            },
        )
    )

    # User's linked cards (adjust collection name if yours differs)
    user_cards = list(
        g.db.cards.find(
            {"user_id": g.user_id},
            {
                "_id": 0,
                "user_id": 1,
                "card_id": 1,
                "nickname": 1,
                "last4": 1,
                "caps": 1,
                "rotating": 1,
            },
        )
    )

    ranked = best_cards(
        amount_cents=amount_cents,
        merchant=merchant,
        category=category,
        card_catalog=catalog,
        user_cards=user_cards,
    )

    return {
        "type": "best_card.result",
        "query": {"merchant": merchant, "category": category, "amount": float(amount or 0)},
        "candidates": [
            {
                "card_id": r.card_id,
                "display": r.display,
                "effective_rate": r.effective_rate,
                "est_reward_usd": round(r.est_reward_cents / 100, 2),
                "reasons": r.reasons,
                "actions": r.actions,
            }
            for r in ranked[:5]
        ],
    }


TOOLS["get_best_card"] = {
    "fn": lambda merchant=None, category=None, amount=0: _tool_get_best_card(merchant, category, amount),
    "schema": {
        "type": "object",
        "properties": {
            "merchant": {"type": ["string", "null"]},
            "category": {"type": ["string", "null"]},
            "amount": {"type": "number", "minimum": 0},
        },
        "required": ["amount"],
    },
}


# ---- Tool: get_insights -----------------------------------------------------
def _tool_get_insights(kind: str, window: Optional[str]):
    err = _require_ctx()
    if err:
        return {"type": "error", "message": f"insights: {err}"}

    if kind == "overspend":
        return {"type": "insight.overspend", **overspend_reasons(g.db, g.user_id, window=window or "MTD")}
    if kind == "delta":
        return {"type": "insight.delta", **compare_windows(g.db, g.user_id, this_window=window or "MTD")}
    if kind == "subscriptions":
        return {"type": "insight.subscriptions", **top_subscriptions_by_annual_burn(g.db, g.user_id)}
    return {"type": "error", "message": "unknown kind"}


TOOLS["get_insights"] = {
    "fn": lambda kind, window=None: _tool_get_insights(kind, window),
    "schema": {
        "type": "object",
        "properties": {
            "kind": {"type": "string", "enum": ["overspend", "delta", "subscriptions"]},
            "window": {"type": ["string", "null"]},
        },
        "required": ["kind"],
    },
}
