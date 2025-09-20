"""Recommendation endpoints."""

from typing import Any, Dict

from flask import Blueprint, g, jsonify, request
from werkzeug.exceptions import BadRequest

from server.llm.gemini import explain_recommendations
from server.routes.helpers import parse_card_ids_query
from server.services.scoring import score_catalog
from server.services.spend import (
    aggregate_spend_details,
    compute_user_mix,
    load_transactions,
)


def register_recommendation_routes(bp: Blueprint, database) -> None:
    @bp.post("/recommendations")
    def recommendations():
        user = g.current_user
        payload = request.get_json(silent=True) or {}

        try:
            window_days = int(payload.get("window") or 90)
        except (TypeError, ValueError):
            raise BadRequest("window must be an integer")
        if window_days <= 0:
            raise BadRequest("window must be positive")

        try:
            limit = int(payload.get("limit", 5))
        except (TypeError, ValueError):
            raise BadRequest("limit must be an integer")

        include_explain = bool(payload.get("include_explain", True))

        monthly_spend_value = None
        if payload.get("monthly_spend") is not None:
            try:
                monthly_spend_value = float(payload.get("monthly_spend"))
            except (TypeError, ValueError):
                raise BadRequest("monthly_spend must be a number")

        card_object_ids = parse_card_ids_query()

        transactions = load_transactions(database, user["_id"], window_days, card_object_ids)
        breakdown = aggregate_spend_details(transactions)
        total_window_spend = breakdown["total"]

        raw_mix = payload.get("category_mix")
        normalized_mix: Dict[str, float] = {}
        if isinstance(raw_mix, dict):
            sanitized: Dict[str, float] = {}
            for key, value in raw_mix.items():
                try:
                    numeric = float(value)
                except (TypeError, ValueError):
                    continue
                if numeric <= 0:
                    continue
                sanitized[str(key)] = numeric
            mix_total = sum(sanitized.values())
            if mix_total > 0:
                normalized_mix = {key: val / mix_total for key, val in sanitized.items()}

        if not normalized_mix:
            normalized_mix, total_window_spend, transactions = compute_user_mix(
                database,
                user["_id"],
                window_days,
                card_object_ids,
                transactions=transactions,
            )

        if monthly_spend_value is not None:
            monthly_total = max(monthly_spend_value, 0.0)
        else:
            if total_window_spend > 0 and window_days > 0:
                monthly_total = (total_window_spend / window_days) * 30
            elif normalized_mix:
                monthly_total = 1000.0
            else:
                monthly_total = 0.0

        if not normalized_mix or monthly_total <= 0:
            return jsonify(
                {
                    "mix": normalized_mix,
                    "monthly_spend": round(monthly_total, 2),
                    "windowDays": window_days,
                    "cards": [],
                    "explanation": "",
                }
            )

        catalog_cards = list(database["credit_cards"].find({"active": True}))
        if not catalog_cards:
            return jsonify(
                {
                    "mix": normalized_mix,
                    "monthly_spend": round(monthly_total, 2),
                    "windowDays": window_days,
                    "cards": [],
                    "explanation": "",
                }
            )

        scored_cards = score_catalog(catalog_cards, normalized_mix, monthly_total, window_days, limit=limit)

        explanation = ""
        if include_explain and scored_cards:
            top_names = [card.get("product_name") for card in scored_cards[:3] if card.get("product_name")]
            if top_names:
                explanation = explain_recommendations(normalized_mix, top_names)

        return jsonify(
            {
                "mix": normalized_mix,
                "monthly_spend": round(monthly_total, 2),
                "windowDays": window_days,
                "cards": scored_cards,
                "explanation": explanation,
            }
        )
