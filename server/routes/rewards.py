"""Rewards estimation and comparison routes."""

from typing import Any, Dict, Iterable, List

from flask import Blueprint, g, jsonify, request
from werkzeug.exceptions import BadRequest, NotFound

from server.services.rewards import compute_month_earnings
from server.services.spend import load_transactions


def _sanitize_spend_transactions(txns: Iterable[Dict[str, Any]]) -> List[Dict[str, float]]:
    sanitized = []
    for txn in txns:
        amount_raw = float(txn.get("amount") or 0)
        amount = abs(amount_raw)
        if amount <= 0:
            continue
        sanitized.append({"amount": amount, "category": txn.get("category") or "Uncategorized"})
    return sanitized


def register_reward_routes(bp: Blueprint, database) -> None:
    @bp.get("/rewards/estimate")
    def estimate_rewards():
        user = g.current_user
        slug = request.args.get("cardSlug")
        if not slug:
            raise BadRequest("cardSlug is required")
        window_raw = request.args.get("window", "30")
        try:
            window_days = int(window_raw)
        except (TypeError, ValueError):
            raise BadRequest("window must be an integer")
        if window_days <= 0:
            raise BadRequest("window must be positive")

        card = database["credit_cards"].find_one({"slug": slug})
        if not card:
            raise NotFound("card not found")

        txns = load_transactions(database, user["_id"], window_days, None)
        spend_txns = _sanitize_spend_transactions(txns)
        earnings = compute_month_earnings(card, spend_txns)
        projection_multiplier = 30 / window_days if window_days else 1
        projection_total = round(earnings["total"] * projection_multiplier, 2)
        return jsonify(
            {
                "card": {
                    "slug": card.get("slug"),
                    "product_name": card.get("product_name"),
                    "issuer": card.get("issuer"),
                },
                "windowDays": window_days,
                "earnings": earnings,
                "projectedMonthly": projection_total,
            }
        )

    @bp.post("/rewards/compare")
    def compare_rewards():
        payload = request.get_json(force=True) or {}
        mix = payload.get("mix") or {}
        card_slugs = payload.get("cards") or []

        if not isinstance(mix, dict) or not mix:
            raise BadRequest("mix is required")
        if not isinstance(card_slugs, list) or not card_slugs:
            raise BadRequest("cards is required")

        synthetic_txns = []
        for category, amount in mix.items():
            try:
                numeric_amount = float(amount)
            except (TypeError, ValueError):
                continue
            if numeric_amount <= 0:
                continue
            synthetic_txns.append({"amount": numeric_amount, "category": category})

        if not synthetic_txns:
            raise BadRequest("mix must contain positive amounts")

        results = []
        for slug in card_slugs:
            if not isinstance(slug, str):
                continue
            card = database["credit_cards"].find_one({"slug": slug})
            if not card:
                continue
            earnings = compute_month_earnings(card, synthetic_txns)
            results.append(
                {
                    "slug": card.get("slug"),
                    "product_name": card.get("product_name"),
                    "issuer": card.get("issuer"),
                    "earnings": earnings,
                }
            )

        results.sort(key=lambda item: item["earnings"]["total"], reverse=True)

        return jsonify({"mix": synthetic_txns, "results": results})
