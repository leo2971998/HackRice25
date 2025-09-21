from __future__ import annotations
from flask import Blueprint, request, jsonify, g

# Use package import if available, else fallback to script-mode import
try:
    from ..services.card_optimizer import best_cards
except Exception:
    from services.card_optimizer import best_cards  # type: ignore

cards_best_bp = Blueprint("cards_best", __name__)

@cards_best_bp.post("/api/cards/best")
def post_best():
    data = request.get_json(force=True) or {}
    merchant = data.get("merchant")
    category = data.get("category")
    amount = float(data.get("amount") or 0)
    amount_cents = int(round(amount * 100))

    catalog = list(g.db.card_catalog.find({}, {
        "_id": 1, "issuer": 1, "product": 1, "base_rate": 1,
        "category_rates": 1, "rotating": 1, "merchant_overrides": 1
    }))
    user_cards = list(g.db.cards.find({"user_id": g.user_id}, {
        "_id": 0, "user_id": 1, "card_id": 1, "nickname": 1, "last4": 1, "caps": 1, "rotating": 1
    }))

    ranked = best_cards(
        amount_cents=amount_cents, merchant=merchant, category=category,
        card_catalog=catalog, user_cards=user_cards
    )

    return jsonify({
        "type": "best_card.result",
        "query": {"merchant": merchant, "category": category, "amount": amount},
        "candidates": [{
            "card_id": r.card_id,
            "display": r.display,
            "effective_rate": r.effective_rate,
            "est_reward_usd": round(r.est_reward_cents/100, 2),
            "reasons": r.reasons,
            "actions": r.actions
        } for r in ranked[:5]]
    })
